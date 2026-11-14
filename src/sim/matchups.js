// Who guards whom. Every player has a man: the one opponent he guards. This file is the only place that reads or
// changes it.
import { FOUL, MATCHUP } from './tuning.js';
import { onFloor } from './state.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// The opponent `player` guards.
export const manOf = (state, player) => state.players[player.man];

// The opponent who guards `player`.
export const guardOf = (state, player) => state.players.find(o => o.man === player.id);

// Puts everyone back on his own man: the opponent in his place of the team's order.
export function ownMen(state) {
  for (const p of state.players) {
    p.man = state.players.find(o => o.team !== p.team && o.slot === p.slot).id;
    p.switchWait = 0;
  }
}

// Two team-mates take each other's men, and neither is switched again for a moment.
function swap(state, a, b) {
  [a.man, b.man] = [b.man, a.man];
  a.switchWait = b.switchWait = MATCHUP.wait;
  state.switches++;
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
    const man = manOf(state, defender);
    if (!set || man === screener || dist(man, defender) <= MATCHUP.lost) continue;
    const other = guardOf(state, screener);
    if (defender.switchWait > 0 || other.switchWait > 0 || dist(other, man) >= dist(defender, man)) continue;
    swap(state, defender, other);
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
