import { CLOCK, COURT, PLAYER, VIOLATION } from './tuning.js';
import { lineUp, personOf } from './state.js';
import { applySubs } from './roster.js';
import { findViolation, trackCounters } from './violations.js';
import { newFreeThrow, setupFreeThrow, stepFreeThrow } from './freethrow.js';
import { judgeContacts, recordFoul } from './fouls.js';

const OUTSIDE = 0.5;        // how far behind the line an inbounder stands
const BOARD_CLEAR = 1.5;    // baseline inbounds keep this far from the middle, clear of the backboard

const outOfBounds = o => Math.abs(o.x) > COURT.halfLength || Math.abs(o.z) > COURT.halfWidth;
const clamp = (v, lim) => Math.min(Math.max(v, -lim), lim);
const side = v => (v < 0 ? -1 : 1);

// Where to inbound after the ball went out at `o`: just outside the line it crossed.
function spotWhereOut(o) {
  if (Math.abs(o.x) > COURT.halfLength) {
    const z = clamp(o.z, COURT.halfWidth - 1);
    return { x: side(o.x) * (COURT.halfLength + OUTSIDE), z: Math.abs(z) < BOARD_CLEAR ? side(z) * BOARD_CLEAR : z };
  }
  return sidelineSpot(o);
}
const sidelineSpot = o => ({ x: clamp(o.x, COURT.halfLength - 1), z: side(o.z) * (COURT.halfWidth + OUTSIDE) });
// Where the other team inbounds after a basket in the hoop on side `sign`.
const underHoop = sign => ({ x: sign * (COURT.halfLength + OUTSIDE), z: 2 });

// A whistle: `team` is penalised and the other team gets the ball. `extra` may set `number` and `shots`.
const makeCall = (kind, team, extra = {}) => ({ kind, team, ball: 1 - team, number: null, shots: 0, ...extra });

// Every stoppage goes through here. `call` says why the whistle blew; a basket has none.
// The shot clock keeps its time unless the ball changes hands.
// If the period clock has run out, the period ends instead of restarting, once any free throws are shot.
function stopPlay(state, possession, spot, call = null) {
  deadBall(state);
  state.call = call;
  if (possession !== state.possession) state.shotClock = CLOCK.shot;
  state.possession = possession;
  state.inboundSpot = spot;
  if (state.gameClock <= 0 && !state.freeThrow) endPeriod(state);
  else { state.phase = 'dead'; state.phaseT = CLOCK.dead; }
}

// A foul stops play. `shots` overrides the free throws the foul earns by itself: a shooting foul's depend on the shot.
function callFoul(state, foul, shots) {
  const fouler = state.players[foul.by];
  const number = personOf(state, fouler).number;   // read now: he may be substituted during the stoppage
  const given = recordFoul(state, foul);
  const n = shots ?? given.shots;
  if (n) state.freeThrow = newFreeThrow(foul.on, n);
  stopPlay(state, given.ball, sidelineSpot(state.ball), makeCall(foul.kind, fouler.team, { number, shots: n }));
  // After a defensive foul the offence has at least 14 seconds left to shoot.
  if (!n && foul.kind !== 'charge') state.shotClock = Math.max(state.shotClock, CLOCK.shotAfterFoul);
  state.pendingFoul = null;
}

// A dead ball drops where it is instead of bouncing off into the distance.
function deadBall(state) {
  if (state.ball.holder === null) state.ball.vx = state.ball.vz = 0;
}

function endPeriod(state) {
  deadBall(state);
  state.phase = 'quarterEnd';
  state.phaseT = CLOCK.quarterBreak;
}

// shortcut: the inbounder is teleported to the spot, visible as a small jump; walk them there when animations arrive in milestone 3
function setupInbound(state) {
  const { ball, inboundSpot: spot } = state;
  const d = p => Math.hypot(p.x - spot.x, p.z - spot.z);
  const inbounder = state.players.filter(p => p.team === state.possession).reduce((a, b) => (d(b) < d(a) ? b : a));
  for (const p of state.players) { p.inbounder = false; p.shooting = false; p.held = false; p.steps = 0; }
  Object.assign(inbounder, {
    x: spot.x, z: spot.z, y: 0, vx: 0, vy: 0, vz: 0, inbounder: true,
    facing: Math.atan2(-spot.z, spot.x * 0.7 - spot.x),   // toward the middle of the court
  });
  Object.assign(ball, {
    holder: inbounder.id, mode: 'held', shooter: null, shotValue: 0, noPickupT: 0,
    x: spot.x, y: PLAYER.handHeight, z: spot.z, vx: 0, vy: 0, vz: 0,
  });
  state.lastTouch = state.possession;
  if (state.possession === 0) state.controlled = inbounder.id;
  state.inboundT = 0;
  state.controlTeam = null;   // the backcourt, 8-second and 3-second counts start afresh
  state.phase = 'inbound';
}

function beginPeriod(state) {
  state.gameClock = state.quarter <= CLOCK.quarters ? CLOCK.quarter : CLOCK.overtime;
  state.shotClock = CLOCK.shot;
  if (state.quarter <= CLOCK.quarters) state.teamFouls = [0, 0];   // overtime carries on the 4th quarter's count
  lineUp(state);
  state.possession = state.quarter % 2 === 1 ? 0 : 1;   // team 0 starts odd periods
  state.inboundSpot = { x: 0, z: COURT.halfWidth + OUTSIDE };
  setupInbound(state);
}

export function startMatch(state) {
  state.quarter = 1;
  state.score = [0, 0];
  beginPeriod(state);
}

// Out of bounds: a free ball on the floor outside the lines, or a ball carrier standing outside them.
function isOut(state, events) {
  const { ball } = state;
  const holder = state.players[ball.holder];
  // A free ball is also out once it flies past the run-off around the court, without waiting for it to land.
  const inStands = Math.abs(ball.x) > COURT.halfLength + COURT.margin || Math.abs(ball.z) > COURT.halfWidth + COURT.margin;
  return holder ? !holder.inbounder && outOfBounds(holder) : inStands || (events.hitFloor && outOfBounds(ball));
}

function checkOut(state, events) {
  if (!isOut(state, events)) return false;
  const holder = state.players[state.ball.holder];
  const loser = holder ? holder.team : state.lastTouch ?? state.possession;
  stopPlay(state, 1 - loser, spotWhereOut(holder ?? state.ball), makeCall('out', loser));
  return true;
}

// A shot stops being a shot once it touches something; its value survives until the floor or a pickup.
function shotTouched(state, events) {
  const { ball } = state;
  if (ball.holder === null && (events.hitFloor || events.hitRim || events.hitBoard)) {
    ball.mode = 'loose';
    if (events.hitFloor) { ball.shooter = null; ball.shotValue = 0; }
  }
}

function livePlay(state, events, dt) {
  const { ball } = state;
  shotTouched(state, events);
  if (events.hitRim) state.shotClock = CLOCK.shot;

  // When several things happen in one step the call is, in order: a foul, a basket, a violation, out of bounds, the clocks.
  const foul = judgeContacts(state, events, dt);
  if (foul?.kind === 'shooting') state.pendingFoul = { by: foul.by, on: foul.on, shots: ball.shotValue };   // the shot carries on
  else if (foul) return callFoul(state, foul);
  const fouledShot = state.pendingFoul && { kind: 'shooting', ...state.pendingFoul };

  if (events.scored) {
    const team = events.scored === 1 ? 0 : 1;
    state.score[team] += ball.shotValue || 2;
    ball.shooter = null; ball.shotValue = 0; ball.mode = 'loose';
    if (fouledShot) return callFoul(state, fouledShot, 1);   // the basket counts, and one free throw
    stopPlay(state, 1 - team, underHoop(events.scored));
    state.shotClock = CLOCK.shot;
    return;
  }
  // A fouled shot that missed: the whistle waits until it has been touched, landed or left the court.
  if (fouledShot && (ball.shooter === null || isOut(state, events))) return callFoul(state, fouledShot, fouledShot.shots);
  trackCounters(state, dt);
  const violation = findViolation(state, events);
  if (violation) return stopPlay(state, 1 - violation.team, sidelineSpot(ball), makeCall(violation.kind, violation.team));
  if (checkOut(state, events)) return;

  // Both clocks wait at zero for a shot that is still in the air.
  const shotInAir = ball.shooter !== null;
  state.shotClock = Math.max(0, state.shotClock - dt);
  state.gameClock = Math.max(0, state.gameClock - dt);
  if (state.gameClock <= 0 && !shotInAir) endPeriod(state);
  else if (state.shotClock <= 0 && !shotInAir) stopPlay(state, 1 - state.possession, sidelineSpot(ball), makeCall('shotClock', state.possession));
}

export function applyRules(state, events, dt, intents) {
  const { ball } = state;
  switch (state.phase) {
    case 'inbound': {
      const holder = state.players[ball.holder];
      if (holder && !holder.inbounder) {
        for (const p of state.players) p.inbounder = false;
        state.phase = 'live';
      } else if (holder) {
        state.inboundT += dt;
        if (state.inboundT > VIOLATION.inbound) stopPlay(state, 1 - state.possession, state.inboundSpot, makeCall('fiveSeconds', state.possession));
      } else {
        checkOut(state, events);   // an inbound pass thrown away goes to the other team
      }
      break;
    }
    case 'live':
      livePlay(state, events, dt);
      break;
    case 'dead':
      applySubs(state);
      state.phaseT -= dt;
      if (state.phaseT <= 0) (state.freeThrow ? setupFreeThrow : setupInbound)(state);
      break;
    case 'freeThrow': {
      const ft = state.freeThrow, team = state.players[ft.shooter].team;
      shotTouched(state, events);   // so a missed last attempt can be rebounded
      const result = stepFreeThrow(state, intents, events, dt);
      if (result) state.freeThrow = null;
      if (result === 'scored') { stopPlay(state, 1 - team, underHoop(events.scored)); state.shotClock = CLOCK.shot; }
      else if (result === 'live') state.phase = 'live';
      else if (result === 'over') endPeriod(state);
      else if (ft.live && checkOut(state, events)) state.freeThrow = null;
      break;
    }
    case 'quarterEnd':
      applySubs(state);
      state.phaseT -= dt;
      if (state.phaseT > 0) break;
      if (state.quarter >= CLOCK.quarters && state.score[0] !== state.score[1]) state.phase = 'final';
      else { state.quarter++; beginPeriod(state); }
      break;
  }
}
