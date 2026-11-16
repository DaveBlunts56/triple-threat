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
  let best = null, bestCost = Infinity;
  for (const order of orders(open)) {
    const c = rest.reduce((sum, d, i) => sum + cost(d, order[i]), 0);
    if (c < bestCost) { best = order; bestCost = c; }
  }
  const match = new Map([[stopper.id, threat.id], ...rest.map((d, i) => [d.id, best[i].id])]);
  return defenders.map(d => match.get(d.id));
}

// Puts everyone back on his own man, as his coach matches them (see matchFor).
export function ownMen(state) {
  for (const team of [0, 1]) {
    const men = matchFor(state, team);
    state.players.filter(p => p.team === team).forEach((p, i) => { p.man = men[i]; p.switchWait = 0; });
  }
}

// Two team-mates take each other's men, and neither is switched again for a moment.
function swap(state, a, b) {
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
