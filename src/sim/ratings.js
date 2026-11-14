// What a player is good at. Each person on a roster has eight ratings from 40 to 99 (see ROSTER.ratings); 70 is the
// player every player used to be, so everything here is 1, or no change, at 70.
import { HEAT } from './tuning.js';
import { personOf } from './state.js';

export const KEYS = Object.freeze(['inside', 'mid', 'three', 'handle', 'speed', 'defence', 'rebound', 'stamina']);

// What a thing is multiplied by for a rating, when every 10 points above 70 adds `per10` of it (and below takes it away).
export const lift = (rating, per10) => 1 + ((rating - 70) / 10) * per10;
// The same for a thing a better rating makes less of: tiredness, the chance of losing the ball.
export const drop = (rating, per10) => 1 - ((rating - 70) / 10) * per10;

// The rating `key` of whoever is now in `player`'s place on the court.
export const rated = (state, player, key) => personOf(state, player).ratings[key];

// A person's overall: the mean of his best five ratings.
export function overall(person) {
  const best = KEYS.map(key => person.ratings[key]).sort((a, b) => b - a).slice(0, 5);
  return Math.round(best.reduce((sum, r) => sum + r, 0) / 5);
}

// The roster row of `team`'s star: its player with the highest overall, the first of them if two are level.
export const starOf = (state, team) => state.rosters[team].reduce((best, person, row, all) => (overall(person) > overall(all[best]) ? row : best), 0);

// 'hot' after HEAT.after makes in a row from the floor, 'cold' after as many misses, else null.
export const heatOf = person => (person.streak >= HEAT.after ? 'hot' : person.streak <= -HEAT.after ? 'cold' : null);
