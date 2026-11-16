// What a player of the team with the ball does when he does not have it and no play gives him a part: a place that
// suits what he is, taken up in his own time, and the moves he makes from it: a cut, getting out of the way of a
// drive, running a lane on a fast break. The rules never read any of this: it only says where he should go.
import { AI, OFF, RIM, isHuman } from './tuning.js';
import { attackSign, personOf, rand } from './state.js';
import { choose } from './choose.js';
import { rated } from './ratings.js';
import { guardOf } from './matchups.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inside = (state, p) => rated(state, p, 'inside') + rated(state, p, 'rebound');
// How far `point` is from the straight line from `a` to `b`, and how far along it the nearest point is (0 to 1).
function off(point, a, b) {
  const lx = b.x - a.x, lz = b.z - a.z, t = Math.min(1, Math.max(0, ((point.x - a.x) * lx + (point.z - a.z) * lz) / (lx * lx + lz * lz || 1)));
  return { far: Math.hypot(point.x - (a.x + lx * t), point.z - (a.z + lz * t)), t };
}

// What he is, for where he stands: one of his team's two best inside men on the floor is a big (one, in three a
// side); a good three-point shooter is a shooter; anyone else is a slasher.
export function kindOf(state, player) {
  const team = state.players.filter(p => p.team === player.team).sort((a, b) => inside(state, b) - inside(state, a) || a.slot - b.slot);
  if (team.indexOf(player) < (state.size === 5 ? 2 : 1)) return 'big';
  return rated(state, player, 'three') >= OFF.shooterAt ? 'shooter' : 'slasher';
}

// The side of the court `team`'s ball is on (+1 or -1), changing only when the ball is well past the middle.
function sideOf(state, team) {
  if (state.ball.z * state.side[team] < -OFF.sideHold) state.side[team] = -state.side[team];
  return state.side[team];
}

// A place for every player of `team` but its ball handler, no two the same, by what each is: shooters behind the
// three-point line (the corner on the ball's side first), slashers on the wings and at the top, one big low on the
// weak side and a second at the high post on the ball's side when the ball is on a wing. Returns Map(id -> { x, z }).
export function places(state, team) {
  const sign = attackSign(team), S = sideOf(state, team), holder = state.players[state.ball.holder];
  const at = (along, across) => ({ x: sign * along, z: across * S });
  const onWing = holder?.team === team && Math.abs(holder.z) > 4;
  const lists = {
    shooter: [at(11.6, 6.95), at(7.4, -5.6), at(11.6, -6.95), at(7.4, 5.6), at(5.4, 0)],
    slasher: [at(7.4, 5.6), at(7.4, -5.6), at(5.4, 0), at(11.6, -6.95), at(11.6, 6.95)],
    // In three a side the one big comes up to the high post when the ball is on a wing.
    big: state.size === 3 && onWing ? [at(8.2, 2.7), at(11, -3.2)] : [at(11, -3.2), onWing ? at(8.2, 2.7) : at(11, 3.2), at(8.2, -2.7)],
  };
  const order = { big: 0, shooter: 1, slasher: 2 }, taken = holder?.team === team ? [holder] : [], given = new Map();
  const rest = state.players.filter(p => p.team === team && p !== holder).map(p => ({ p, kind: kindOf(state, p) }))
    .sort((a, b) => order[a.kind] - order[b.kind] || (a.kind === 'big' ? inside(state, b.p) - inside(state, a.p) : rated(state, b.p, 'three') - rated(state, a.p, 'three')) || a.p.slot - b.p.slot);   // the best big and the best shooter choose first
  for (const { p, kind } of rest) {
    const spot = lists[kind].find(s => taken.every(t => dist(s, t) >= OFF.apart)) ?? [...lists.slasher, ...lists.shooter].find(s => taken.every(t => dist(s, t) >= OFF.apart)) ?? lists[kind][0];
    taken.push(spot); given.set(p.id, spot);
  }
  return given;
}

// Whether the handler is going at the hoop: moving toward it at some pace, from anywhere on the court.
function driving(holder, hoop) {
  const far = dist(holder, hoop) || 1, speed = Math.hypot(holder.vx, holder.vz);
  return speed > OFF.drivePace && (holder.vx * (hoop.x - holder.x) + holder.vz * (hoop.z - holder.z)) / (far * speed) > 0.7;
}

// Whether `player` is beaten off the ball: his defender is far from him, or is further from the hoop than he is,
// and nobody stands on his way to the rim.
function beaten(state, player, hoop) {
  const defender = guardOf(state, player);
  return dist(defender, player) > OFF.cutGap || dist(defender, hoop) > dist(player, hoop) + 0.3;
}

// Whether a cut from where `player` stands can go: he is not already near the rim, and nobody stands on his way to it.
const wayClear = (state, player, hoop) => dist(player, hoop) > OFF.cutFrom && state.players.every(o => o.team === player.team || off(o, player, hoop).far > OFF.cutWidth);

// Where `player`, whose team has the ball, should be now, and why: { x, z, sprint, why }. In this order: a cut he
// is making; out of the way of a drive; on a fast break, his lane; else his place, taken up only at his own moments,
// from which he may start a cut. Null for the ball handler and for the player you control.
export function offBallSpot(state, player) {
  const team = player.team, sign = attackSign(team), hoop = { x: sign * RIM.x, z: 0 }, holder = state.players[state.ball.holder];
  if (holder === player || (isHuman(state, team) && player.id === state.controlled)) return null;
  const { ai } = player, mine = holder?.team === team;

  const cut = state.cut[team];
  if (cut && state.time >= cut.until) state.cut[team] = null;
  if (state.cut[team]?.id === player.id) return { x: sign * OFF.rimAt, z: 0.6 * Math.sign(player.z || 1), sprint: true, why: 'cut' };

  if (mine && driving(holder, hoop)) {
    // Off the handler's line to the hoop, to the side he is already on.
    const { far, t } = off(player, holder, hoop);
    if (far < OFF.clear && t > 0) {
      const lx = hoop.x - holder.x, lz = hoop.z - holder.z, long = Math.hypot(lx, lz) || 1;
      const way = (player.x - holder.x) * -lz + (player.z - holder.z) * lx >= 0 ? 1 : -1;
      return { x: player.x + (-lz / long) * way * OFF.clearTo, z: player.z + (lx / long) * way * OFF.clearTo, sprint: true, why: 'clear' };
    }
  }

  // A fast break: the handler is ahead of every defender. The two quickest run wide of him and ahead; the rest trail.
  if (mine && sign * holder.x < OFF.breakUntil && state.players.every(o => o.team === team || dist(o, hoop) > dist(holder, hoop) + AI.breakLead)) {
    const rest = state.players.filter(p => p.team === team && p !== holder).sort((a, b) => rated(state, b, 'speed') - rated(state, a, 'speed') || a.slot - b.slot);
    const lane = rest.indexOf(player);
    if (lane < 2) return { x: sign * OFF.rimAt, z: (lane === 0 ? 1 : -1) * OFF.breakWide * (holder.z >= 0 ? 1 : -1), sprint: true, why: 'break' };   // all the way, wide of the ball
    return { x: holder.x - sign * OFF.breakTrail, z: player.z * 0.5, sprint: true, why: 'break' };
  }

  // His place, read again only at his own moments, so that no two of a team move at once.
  if (ai.place === undefined || state.time >= ai.placeAt) {
    ai.place = places(state, team).get(player.id);
    ai.placeAt = state.time + OFF.every[0] + rand(state) * (OFF.every[1] - OFF.every[0]) + (ai.placeAt === undefined ? player.slot * 0.6 : 0);
    // At such a moment he may cut instead, if nobody else is cutting and his way to the rim is clear. It is a choice
    // (see choose.js): a cut is worth more the further his man is beaten, the more that man watches the ball instead
    // of him, if he has just passed, and the more he likes to attack; staying is worth the possession going on.
    const passed = ai.passedAt !== undefined && state.time - ai.passedAt < OFF.giveAndGo;
    if (mine && !state.cut[team] && !driving(holder, hoop) && wayClear(state, player, hoop)) {
      const defender = guardOf(state, player), watching = 1 - (personOf(state, defender).iq ?? 0.7);
      const tend = personOf(state, player).tend;
      const kind = kindOf(state, player), lost = beaten(state, player, hoop);
      const cut = 0.7 + (lost ? 0.5 : 0) + 0.6 * watching + (passed ? 0.5 : 0) + (kind === 'slasher' ? 0.15 : 0) + 0.2 * (tend.drive - 0.5);
      // A shooter spotted up where he shoots from is worth something where he is, more with his man off him.
      const stay = kind === 'shooter' ? 1.35 + (lost ? 0.3 : 0) : 1;
      const go = choose(state, [{ key: 'cut', value: cut }, { key: 'stay', value: stay }], personOf(state, player).iq);
      if (go.key === 'cut') {
        state.cut[team] = { id: player.id, until: state.time + OFF.cutFor };
        return { x: sign * OFF.rimAt, z: 0.6 * Math.sign(player.z || 1), sprint: true, why: 'cut' };
      }
    }
  }
  return ai.place ? { ...ai.place, sprint: false, why: 'place' } : null;
}

// Whoever has just passed looks at once for the ball back: his next moment to move is now.
export function passed(state, player) {
  player.ai.passedAt = state.time;
  player.ai.placeAt = state.time;
}
