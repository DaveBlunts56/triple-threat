import { COURT, PLAYER, VIOLATION } from './tuning.js';
import { attackSign, onFloor } from './state.js';

// Inside the key at the hoop on side `sign`.
export const keyContains = (x, z, sign) =>
  sign * x >= COURT.halfLength - VIOLATION.keyDepth && sign * x <= COURT.halfLength && Math.abs(z) <= VIOLATION.keyHalfWidth;

// Keeps the counts behind the backcourt, 8-second and 3-second calls.
// They belong to the team in control: the holder's team, or the passer's while a pass is in the air.
export function trackCounters(state, dt) {
  const { ball } = state;
  const holder = state.players[ball.holder];
  const team = holder ? holder.team : ball.mode === 'pass' ? state.lastTouch : null;
  if (team === null || team !== state.controlTeam) {
    state.frontcourt = false; state.backcourtT = 0;
    for (const p of state.players) p.keyT = 0;
    state.controlTeam = team;
    if (team === null) return;
  }
  const sign = attackSign(team);
  if (holder && sign * holder.x > PLAYER.radius) state.frontcourt = true;
  if (!state.frontcourt) state.backcourtT += dt;
  for (const p of state.players) {
    if (p.team !== team) continue;
    if (!state.frontcourt || !keyContains(p.x, p.z, sign)) p.keyT = 0;
    else if (onFloor(p)) p.keyT += dt;
  }
}

// The violation in this step, if any: what was called and the team that committed it.
export function findViolation(state, events) {
  const by = (kind, id) => ({ kind, team: state.players[id].team, id });   // id: the player the call is on
  const holder = state.players[state.ball.holder];
  if (events.travel !== null) return by('travel', events.travel);
  if (holder?.held && holder.steps > PLAYER.gatherDist) return by('travel', holder.id);
  if (events.doubleDribble !== null) return by('doubleDribble', events.doubleDribble);
  if (holder && state.frontcourt && attackSign(holder.team) * holder.x < -PLAYER.radius) return by('backcourt', holder.id);
  if (state.backcourtT > VIOLATION.backcourt) return { kind: 'eightSeconds', team: state.controlTeam };
  const camper = state.players.find(p => p.keyT > VIOLATION.key);
  if (camper) return by('threeSeconds', camper.id);
  return null;
}
