import { FOUL } from './tuning.js';
import { personOf, rand } from './state.js';

const onFloor = p => p.y === 0 && p.vy === 0;

// Decides whether any of this step's contacts is a foul. Returns the first one found: { kind, by, on } (player ids).
export function judgeContacts(state, events, dt) {
  for (const p of state.players) p.foulCooldown = Math.max(0, p.foulCooldown - dt);

  for (const miss of events.stealMisses) {
    if (rand(state) < (miss.front ? FOUL.reachFront : FOUL.reachBack)) return { kind: 'reach', by: miss.by, on: miss.on };
  }

  const shot = events.release;
  if (shot && shot.defender !== null && !shot.blocked && rand(state) < FOUL.shooting) {
    return { kind: 'shooting', by: shot.defender, on: shot.shooter };
  }

  // A sprinting ball handler who runs into an opponent in his path: a charge if the defender was set, else maybe a block.
  const holder = state.players[state.ball.holder];
  if (holder && onFloor(holder) && !holder.inbounder && Math.hypot(holder.vx, holder.vz) > FOUL.chargeSpeed) {
    for (const pair of events.contacts) {
      if (!pair.includes(holder.id)) continue;
      const o = state.players[pair[0] === holder.id ? pair[1] : pair[0]];
      const ahead = (o.x - holder.x) * holder.vx + (o.z - holder.z) * holder.vz > 0;
      if (o.team === holder.team || o.foulCooldown > 0 || !ahead) continue;
      o.foulCooldown = FOUL.cooldown;
      if (o.setT >= FOUL.setTime) {
        if (rand(state) < FOUL.charge) return { kind: 'charge', by: holder.id, on: o.id };
      } else if (rand(state) < FOUL.block) return { kind: 'block', by: o.id, on: holder.id };
    }
  }
  return null;
}

// Counts the foul. Returns the free throws it earns by itself (the bonus) and the team that gets the ball.
// A shooting foul's free throws depend on the shot, so the caller supplies them.
export function recordFoul(state, foul) {
  const fouler = state.players[foul.by];
  personOf(state, fouler).fouls++;
  const teamFouls = ++state.teamFouls[fouler.team];
  const defensive = foul.kind === 'reach' || foul.kind === 'block';
  return { shots: defensive && teamFouls >= FOUL.bonus ? 2 : 0, ball: state.players[foul.on].team };
}
