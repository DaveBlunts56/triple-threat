// What a player is good at. Each person on a roster has eight ratings from 40 to 99 (see ROSTER.ratings); 70 is the
// player every player used to be, so everything here is 1, or no change, at 70.
import { HEAT } from './tuning.js';
import { personOf } from './state.js';
import { KEYS, lift, drop, overall } from './overall.js';

export { KEYS, lift, drop, overall };

// The rating `key` of whoever is now in `player`'s place on the court.
export const rated = (state, player, key) => personOf(state, player).ratings[key];

// A team's overall: the mean of its first five players' (its starting five), to the nearest whole number.
export const teamOverall = players => Math.round(players.slice(0, 5).reduce((sum, p) => sum + overall(p), 0) / Math.min(5, players.length));

// The roster row of `team`'s star: its player with the highest overall, the first of them if two are level.
export const starOf = (state, team) => state.rosters[team].reduce((best, person, row, all) => (overall(person) > overall(all[best]) ? row : best), 0);

// 'hot' after HEAT.after makes in a row from the floor, 'cold' after as many misses, else null.
export const heatOf = person => (person.streak >= HEAT.after ? 'hot' : person.streak <= -HEAT.after ? 'cold' : null);
