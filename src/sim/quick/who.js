// Who on the floor gets each of the fast engine's events: a rebound, a block, a steal, a foul, an assist. A player's
// own profile (his ratings and tendencies) decides it, his position only a little, through where it stands on the
// court; and each choice keeps the team's totals as they were (see QUICK.who).
import { personOf, rand } from '../state.js';
import { QUICK } from './shapes.js';
import { foulLean } from '../mood.js';

const W = QUICK.who;
const isNear = zone => zone === 'rim' || zone === 'close';

// What each person on the floor brings to these choices, worked out once a match (his ratings and tendencies do not
// change during one): his rebounding pull and crashing, his pull as a help defender at the rim, his reach for a steal,
// his creating as a passer, and his foul tendency. And each team's floor: its five, and their means.
const matches = new WeakMap();
function cacheOf(state) {
  let c = matches.get(state);
  if (!c) matches.set(state, (c = { people: new Map(), floors: [null, null] }));
  return c;
}
function traitsOf(state, p, c = cacheOf(state)) {
  const person = personOf(state, p);
  let t = c.people.get(person);
  if (!t) {
    const r = person.ratings, tend = person.tend;
    t = {
      board: (W.board.near[person.position] ?? 1) * (r.rebound / 70) ** W.board.rating, crash: 0.4 + tend.crash,
      help: (W.rim[person.position] ?? 0.5) * (0.3 + tend.help) * (r.defence / 70) ** 2,
      steal: (0.15 + tend.gamble) * (r.speed / 70),
      creates: ((0.3 + tend.passFirst) * (r.handle / 70) ** 1.5) ** W.assist.power,
      foul: tend.foul,
    };
    c.people.set(person, t);
  }
  return t;
}

// The means of `team`'s five on the floor (foul tendency and creating), worked out again only when the five change.
function floorOf(state, team) {
  const c = cacheOf(state), was = c.floors[team];
  let i = 0, same = !!was;
  for (const m of state.players) if (m.team === team) { if (same && was.people[i] !== personOf(state, m)) same = false; i++; }
  if (same) return was;
  const five = state.players.filter(m => m.team === team), people = five.map(m => personOf(state, m)), all = five.map(m => traitsOf(state, m, c));
  return (c.floors[team] = { people, foul: all.reduce((s, t) => s + t.foul, 0) / all.length, creates: all.reduce((s, t) => s + t.creates, 0) / all.length });
}

// One of `list`, drawn by `weight`.
export function drawn(state, list, weight) {
  const w = list.map(weight), total = w.reduce((a, b) => a + b, 0);
  let at = rand(state) * total;
  return list.find((_, i) => (at -= w[i]) < 0) ?? list[list.length - 1];
}

// A rebounder's pull: his rebounding, where his position stands, and on his own team's miss his will to crash.
export function boardWeight(state, p, offensive) {
  const t = traitsOf(state, p);
  return offensive ? t.board * t.crash : t.board;
}

// One of the defenders of `defender`'s team other than him, by his pull as a help defender at the rim.
const helper = (state, defender) => drawn(state, state.players.filter(p => p.team === defender.team && p !== defender), p => traitsOf(state, p).help);

// The defender whose block it is on a shot from `zone` guarded by `defender`: at the rim, often a help defender.
export function blocker(state, defender, zone) {
  if (!isNear(zone) || rand(state) >= W.help.block) return defender;
  return helper(state, defender);
}

// The defender whose shooting foul it is: at the rim, sometimes a help defender's contact.
export function fouler(state, defender, zone) {
  if (!isNear(zone) || rand(state) >= W.help.foul) return defender;
  return helper(state, defender);
}

// How foul-prone a defender is against his team on the floor (1 for the floor's average): his foul tendency, less
// when he is in foul trouble and plays softer.
export function foulShare(state, p) {
  const left = state.foulLimit - personOf(state, p).fouls, careful = left <= 1 ? W.careful[1] : left === 2 ? W.careful[0] : 1;
  return careful * (traitsOf(state, p).foul / floorOf(state, p.team).foul) ** W.foul * foulLean(state, p);   // harder when frustrated (see mood.js)
}

// The defender whose steal it is when the ball is taken from a man guarded by `onBall`: the on-ball man most often,
// otherwise one in the lane, by how readily each gambles for the ball and how quick he is.
export function stealer(state, onBall) {
  return drawn(state, state.players.filter(p => p.team === onBall.team), p => (p === onBall ? W.steal.onBall : 1) * traitsOf(state, p).steal);
}

// How much more (or less) than his team's average a passer's pass is an assist: his creating, against the floor's.
export function assistShare(state, passer) {
  return W.assist.scale * Math.min(1.8, Math.max(0.35, traitsOf(state, passer).creates / floorOf(state, passer.team).creates));
}
