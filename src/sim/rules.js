import { CLOCK, COURT, PLAYER, VIOLATION } from './tuning.js';
import { lineUp } from './state.js';
import { applySubs } from './roster.js';
import { findViolation, trackCounters } from './violations.js';
import { setupFreeThrow, stepFreeThrow } from './freethrow.js';

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
function checkOut(state, events) {
  const { ball } = state;
  const holder = state.players[ball.holder];
  // A free ball is also out once it flies past the run-off around the court, without waiting for it to land.
  const inStands = Math.abs(ball.x) > COURT.halfLength + COURT.margin || Math.abs(ball.z) > COURT.halfWidth + COURT.margin;
  if (holder ? !holder.inbounder && outOfBounds(holder) : inStands || (events.hitFloor && outOfBounds(ball))) {
    const loser = holder ? holder.team : state.lastTouch ?? state.possession;
    stopPlay(state, 1 - loser, spotWhereOut(holder ?? ball), makeCall('out', loser));
    return true;
  }
  return false;
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

  if (events.scored) {
    const team = events.scored === 1 ? 0 : 1;
    state.score[team] += ball.shotValue || 2;
    ball.shooter = null; ball.shotValue = 0; ball.mode = 'loose';
    stopPlay(state, 1 - team, underHoop(events.scored));
    state.shotClock = CLOCK.shot;
    return;
  }
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
