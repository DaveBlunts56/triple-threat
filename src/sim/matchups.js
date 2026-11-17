// Who guards whom. Every player has a man: the one opponent he guards. This file is the only place that reads or
// changes it.
import { FOUL, HEAT, MATCHUP, SCHEME } from './tuning.js';
import { onFloor, personOf } from './state.js';
import { overall } from './overall.js';
import { DEFENCES } from './teams.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// The opponent `player` guards.
export const manOf = (state, player) => state.players[player.man];

// The scheme `team` defends with: its coach's, as adjusted during the game, or its own from teams.js.
export const schemeOf = (state, team) => state.coach?.[team]?.scheme ?? DEFENCES[state.teams?.[team]?.defence] ?? DEFENCES.standard;

// The opponent who guards `player`.
export const guardOf = (state, player) => state.players.find(o => o.man === player.id);

// How far apart two players are in size, by position (a guard against a centre is far apart).
const SIZE = Object.freeze({ PG: 1, SG: 2, SF: 3, PF: 4, C: 5 });

// Mismatches, as the offence reads them (both engines: see hunt). quick: expected points a drive or a move gains for
// each 10 rating points by which a man's handle and speed beat his defender's defence and speed. size: what a post-up
// gains for each position bigger he is than his defender (only from two up: a forward on a guard). feed: what a pass
// to a man gains for each unit of his own edge, so team-mates get the ball to the mismatch. most: the most of each.
export const MISMATCH = Object.freeze({ quick: 0.05, size: 0.07, feed: 0.05, most: 0.15 });

// How far `player` has the better of the man guarding him: { quick, size }. quick: 10s of rating points by which his
// handle and speed beat his man's defence and speed (0 if they do not); size: positions bigger than his man, from two.
export function edgeOf(state, player) {
  const guard = guardOf(state, player);
  if (!guard) return { quick: 0, size: 0 };
  const me = personOf(state, player), him = personOf(state, guard);
  const quick = Math.max(0, (me.ratings.handle + me.ratings.speed - him.ratings.defence - him.ratings.speed) / 2) / 10;
  const apart = (SIZE[me.position] ?? 3) - (SIZE[him.position] ?? 3);
  return { quick, size: apart >= 2 ? apart - 1 : 0 };
}

// Hunts the mismatches among `player`'s options (see choose.js), before he chooses: a drive or a move against a man he
// is quicker than, a post-up against a smaller man, a pass to a team-mate who has the better of his. A pass option
// names its man by `to` (an id in the 3D game, the player in the fast engine). Returns the options.
export function hunt(state, player, options) {
  const mine = edgeOf(state, player), cap = v => Math.min(MISMATCH.most, v);
  for (const o of options) {
    if (o.value === -Infinity) continue;
    if (o.key === 'drive' || o.key === 'move') o.value += cap(MISMATCH.quick * mine.quick);
    else if (o.key === 'post') o.value += cap(MISMATCH.size * mine.size);
    else if (o.key === 'pass' && o.to !== undefined) {
      const m = typeof o.to === 'number' ? state.players[o.to] : o.to, theirs = edgeOf(state, m);
      o.value += cap(MISMATCH.feed * (theirs.quick + theirs.size));
    }
  }
  return options;
}
// How much of a threat an attacker is: how good he is, how much he looks for his shot, and whether he is hot.
const threatOf = person => overall(person) * (0.5 + (person.tend?.usage ?? 0.5)) * (person.streak >= HEAT.after ? 1.2 : 1);

// Who each of `team`'s defenders should guard, as their coach would match them: his best defender for the other team's
// main threat (the best who can stay with him), and the rest so that sizes and speeds are as close as they can be (and, all else equal, each on the
// man in his own place of the order, as the game always matched them). Returns a list of attacker ids by defender.
export function matchFor(state, team) {
  const defenders = state.players.filter(p => p.team === team), attackers = state.players.filter(p => p.team !== team);
  const person = p => personOf(state, p);
  const threat = attackers.reduce((a, b) => (threatOf(person(b)) > threatOf(person(a)) ? b : a));
  const size = p => SIZE[person(p).position] ?? 3;
  // His stopper: the best defender who can stay with that man, a big's Defence counting for less on a quick guard.
  const fit = d => person(d).ratings.defence - Math.abs(person(d).ratings.speed - person(threat).ratings.speed) / 2 - 4 * Math.abs(size(d) - size(threat));
  const stopper = defenders.reduce((a, b) => (fit(b) > fit(a) ? b : a));
  const cost = (d, a) => Math.abs(size(d) - size(a))
    + Math.abs(person(d).ratings.speed - person(a).ratings.speed) / 15 + (d.slot === a.slot ? 0 : 0.01);
  const rest = defenders.filter(d => d !== stopper), open = attackers.filter(a => a !== threat);
  // Every order of the rest, tried in the order `orders` gives them, over a table of costs worked out once.
  const table = rest.map(d => open.map(a => cost(d, a)));
  let best = null, bestCost = Infinity;
  for (const order of indexOrders(open.length)) {
    let c = 0;
    for (let i = 0; i < order.length; i++) c += table[i][order[i]];
    if (c < bestCost) { best = order; bestCost = c; }
  }
  const match = new Map([[stopper.id, threat.id], ...rest.map((d, i) => [d.id, open[best[i]].id])]);
  return defenders.map(d => match.get(d.id));
}

// Every order of 0 .. n-1, as `orders` would give them, kept once worked out.
const ORDERS = new Map();
function indexOrders(n) {
  if (!ORDERS.has(n)) ORDERS.set(n, [...orders([...Array(n).keys()])]);
  return ORDERS.get(n);
}

// Puts everyone back on his own man, as his coach matches them (see matchFor). The matching is worked out again only
// when who is on the floor, or who is hot, has changed since the last time.
export function ownMen(state) {
  state.matched ??= [null, null];
  for (const team of [0, 1]) {
    const key = state.players.map(p => `${p.person}${personOf(state, p).streak >= HEAT.after ? 'h' : ''}`).join(',');
    if (state.matched[team]?.key !== key) state.matched[team] = { key, men: matchFor(state, team) };
    const men = state.matched[team].men;
    state.players.filter(p => p.team === team).forEach((p, i) => { p.man = men[i]; p.switchWait = 0; });
  }
}

// Two team-mates take each other's men, and neither is switched again for a moment.
export function swap(state, a, b) {
  [a.man, b.man] = [b.man, a.man];
  a.switchWait = b.switchWait = MATCHUP.wait;
  state.switches++;
  if (state.switchesBy) state.switchesBy[a.team]++;   // by the team that switched, for whoever watches
}

// Switching on a screen, from the pairs of players who ran into each other this step. A defender who runs into a set
// attacker (one without the ball who has stood his ground) while his own man gets away swaps men with the screener's
// defender, if that defender is the nearer of the two to the man being lost.
export function screenSwitches(state, contacts, dt) {
  for (const p of state.players) p.switchWait = Math.max(0, p.switchWait - dt);
  for (const [i, j] of contacts) {
    const a = state.players[i], b = state.players[j];
    if (a.team === b.team) continue;
    const [screener, defender] = a.team === state.possession ? [a, b] : [b, a];
    const set = state.ball.holder !== screener.id && !screener.inbounder && onFloor(screener) && screener.setT >= FOUL.setTime;
    const man = manOf(state, defender), other = guardOf(state, screener);
    if (!set || man === screener || !other || defender.switchWait > 0 || other.switchWait > 0) continue;
    // What his coach has them do on a screen: a switching team swaps whenever the screener's defender is there to
    // take the man; one that goes over swaps only when a man is being lost (the game's own way); one that drops its
    // big swaps only when he is lost by a long way, since the big is sitting back on purpose.
    const screen = schemeOf(state, defender.team).screen;
    const lost = dist(man, defender) > (screen === 'drop' ? 1.5 * MATCHUP.lost : MATCHUP.lost);
    const near = dist(other, man) < dist(defender, man);
    if (screen === 'switch' ? dist(other, man) < SCHEME.switchReach : lost && near) swap(state, defender, other);
  }
}

// Every order `list` can be put in.
function* orders(list) {
  if (list.length <= 1) return yield list;
  for (let i = 0; i < list.length; i++) for (const rest of orders([...list.slice(0, i), ...list.slice(i + 1)])) yield [list[i], ...rest];
}

// Getting back: `team`, which has just lost the ball in live play, is matched to the attackers again so that the
// distance its players must run is the least it can be in all, if that saves enough running to be worth the change.
export function rematch(state, team) {
  const defenders = state.players.filter(p => p.team === team), attackers = state.players.filter(p => p.team !== team);
  const run = men => defenders.reduce((sum, defender, i) => sum + dist(defender, men[i]), 0);
  const now = defenders.map(defender => manOf(state, defender));
  let best = now;
  for (const men of orders(attackers)) if (run(men) < run(best)) best = men;
  if (run(now) - run(best) < MATCHUP.save) return;
  defenders.forEach((defender, i) => { defender.man = best[i].id; });
  state.switches++;
}

