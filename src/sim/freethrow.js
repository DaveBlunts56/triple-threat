import { CLOCK, COURT, FT, PLAYER } from './tuning.js';
import { attackSign, personOf, rand } from './state.js';
import { rimCentre } from './ball.js';
import { carryBall, giveBall, launchShot } from './players.js';
import { shotFactor } from './stamina.js';

export const newFreeThrow = (shooter, shots) =>
  ({ shooter, left: shots, total: shots, stage: 'aim', meter: 0, dir: 1, t: 0, armed: false, live: false });

// The chance a free throw goes in with the marker at `meter` (0 to 1 along the bar).
export const ftChance = meter => FT.edgeChance + (FT.centreChance - FT.edgeChance) * (1 - 2 * Math.abs(meter - 0.5));

// The ball goes to the shooter for his next attempt.
function handBall(state) {
  const ft = state.freeThrow;
  giveBall(state, state.players[ft.shooter]);
  carryBall(state, 0);
  Object.assign(ft, { stage: 'aim', meter: 0, dir: 1, t: 0, armed: false, live: false });
}

// shortcut: players are placed on their spots directly, as inbounders are; walk them there after the 5v5 option
export function setupFreeThrow(state) {
  const shooter = state.players[state.freeThrow.shooter];
  const sign = attackSign(shooter.team), hoop = rimCentre(sign);
  const place = (p, [fromBaseline, z]) => Object.assign(p, {
    x: sign * (COURT.halfLength - fromBaseline), z, y: 0, vx: 0, vy: 0, vz: 0,
    inbounder: false, shooting: false, held: false, steps: 0,
  });
  place(shooter, [FT.lineDist, 0]);
  state.players.filter(p => p.team === shooter.team && p !== shooter).forEach((p, i) => place(p, FT.offence[i]));
  state.players.filter(p => p.team !== shooter.team).forEach((p, i) => place(p, FT.defence[i]));
  for (const p of state.players) p.facing = Math.atan2(hoop.z - p.z, hoop.x - p.x);
  handBall(state);
  state.shotClock = CLOCK.shot;
  state.controlTeam = null;
  state.phase = 'freeThrow';
}

// Advances the free throw. Returns 'scored' (the last attempt went in), 'live' (it missed and a player has the ball),
// 'over' (every attempt is done and the period clock is at zero), or null while it carries on.
export function stepFreeThrow(state, intents, events, dt) {
  const ft = state.freeThrow, { ball } = state;
  const shooter = state.players[ft.shooter];

  if (ft.stage === 'aim') {
    ft.t += dt;
    const pressed = ft.armed && intents[ft.shooter].shoot;
    if (!intents[ft.shooter].shoot) ft.armed = true;   // Space still held from before the meter appeared does not count
    const chance = shooter.team === 0 && pressed ? ftChance(ft.meter)
      : shooter.team === 1 && ft.t >= FT.aiDelay ? FT.aiChance
      : ft.t >= FT.limit ? 0 : null;
    if (chance === null) {
      ft.meter += ft.dir * FT.sweep * dt;
      if (ft.meter >= 1) { ft.meter = 2 - ft.meter; ft.dir = -1; }
      else if (ft.meter <= 0) { ft.meter = -ft.meter; ft.dir = 1; }
      return null;
    }
    Object.assign(ball, { x: shooter.x, y: shooter.y + PLAYER.releaseHeight, z: shooter.z });
    launchShot(state, shooter, rand(state) < chance * shotFactor(personOf(state, shooter).energy), 1);
    ft.stage = 'flight';
    ft.live = ft.left === 1 && state.gameClock > 0;   // the last attempt is played on, unless time is up
    return null;
  }

  if (ft.stage === 'flight') {
    if (events.scored) state.score[shooter.team] += 1;
    if (ft.live) return events.scored ? 'scored' : ball.holder !== null ? 'live' : null;
    if (events.scored || events.hitFloor) { ft.left--; ft.stage = 'pause'; ft.t = 0; }
    return null;
  }

  ft.t += dt;
  if (ft.t < FT.pause) return null;
  if (ft.left === 0) return 'over';
  handBall(state);
  return null;
}
