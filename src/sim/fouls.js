import { FOUL } from './tuning.js';
import { onFloor, personOf, rand } from './state.js';
import { styled } from './styles.js';
import { screenerOn } from './plays.js';
import { manOf } from './matchups.js';

// The share of the style's chance that a defender's contact is a foul: one in foul trouble plays softer (the style's
// careful: with two fouls to give, and with one; Arcade's are 1).
function softer(state, id) {
  const left = state.foulLimit - personOf(state, state.players[id]).fouls, careful = styled(state, 'foul.careful');
  return left <= 1 ? careful[1] : left === 2 ? careful[0] : 1;
}

// Decides whether any of this step's contacts is a foul. Returns the first one found: { kind, by, on } (player ids).
export function judgeContacts(state, events, dt) {
  for (const p of state.players) p.foulCooldown = Math.max(0, p.foulCooldown - dt);

  const shot = events.release;
  for (const miss of events.stealMisses) {
    if (!miss.sure && rand(state) >= (miss.front ? styled(state, 'foul.reachFront') : styled(state, 'foul.reachBack')) * softer(state, miss.by)) continue;   // sure: he meant to foul
    // A reach on the step its victim lets a shot go is a foul on the shot: the ball is already in the air.
    const onShot = shot && shot.shooter === miss.on && !shot.blocked;
    return { kind: onShot ? 'shooting' : 'reach', by: miss.by, on: miss.on };
  }

  if (shot && shot.defender !== null && !shot.blocked && rand(state) < styled(state, 'foul.shooting') * softer(state, shot.defender)) {
    return { kind: 'shooting', by: shot.defender, on: shot.shooter };
  }
  // A finish with a defender on him, on the floor or in the air: the contact of a drive (where the style calls it).
  if (shot && shot.near !== null && shot.near !== undefined && !shot.blocked && rand(state) < styled(state, 'foul.drive') * softer(state, shot.near)) {
    return { kind: 'shooting', by: shot.near, on: shot.shooter };
  }

  // Contacts away from the ball, where the style calls them: a loose-ball foul in the scramble for a rebound (on whoever
  // runs into a man holding his ground, or either), and an illegal screen (a screener still moving into the defender).
  for (const [i, j] of events.contacts) {
    const a = state.players[i], b = state.players[j];
    if (a.team === b.team || a.foulCooldown > 0 || b.foulCooldown > 0) continue;
    if (state.board && state.ball.holder === null && styled(state, 'foul.looseBall') > 0) {
      a.foulCooldown = b.foulCooldown = FOUL.cooldown;
      if (rand(state) < styled(state, 'foul.looseBall')) {
        const [by, on] = a.setT >= FOUL.setTime && b.setT < FOUL.setTime ? [b, a] : b.setT >= FOUL.setTime && a.setT < FOUL.setTime ? [a, b] : rand(state) < 0.5 ? [a, b] : [b, a];
        return { kind: 'looseBall', by: by.id, on: on.id };
      }
      continue;
    }
    const holder = state.players[state.ball.holder];
    if (!holder || styled(state, 'foul.illegalScreen') <= 0) continue;
    const [screener, defender] = a.team === holder.team ? [a, b] : [b, a];
    // Only a screen: the man of a play setting it, into the ball handler's defender, still moving.
    if (screenerOn(state, holder.team) !== screener.id || manOf(state, defender) !== holder) continue;
    if (screener === holder || screener.inbounder || Math.hypot(screener.vx, screener.vz) <= FOUL.setSpeed) continue;
    screener.foulCooldown = defender.foulCooldown = FOUL.cooldown;
    if (rand(state) < styled(state, 'foul.illegalScreen')) return { kind: 'illegalScreen', by: screener.id, on: defender.id };
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
        if (rand(state) < styled(state, 'foul.charge')) return { kind: 'charge', by: holder.id, on: o.id };
      } else if (rand(state) < styled(state, 'foul.block') * softer(state, o.id)) return { kind: 'block', by: o.id, on: holder.id };
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
  const defensive = foul.kind === 'reach' || foul.kind === 'block' || foul.kind === 'looseBall';
  // In the last two minutes of a period, a team's second foul there is shot even short of the bonus (where the style
  // has that rule).
  const late = styled(state, 'rules.lastTwo') && state.gameClock <= 120 && ++(state.lateFouls ??= [0, 0])[fouler.team] >= 2;
  return { shots: defensive && (teamFouls >= state.bonus || late) ? 2 : 0, ball: state.players[foul.on].team };
}
