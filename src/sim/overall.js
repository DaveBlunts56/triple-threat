// The parts of the ratings that need no match: the eight keys, what a rating multiplies a thing by, and a person's
// overall. In a file of their own, importing nothing, so that state.js can use them while ratings.js imports state.js
// (the single-file build needs the imports to form a tree). ratings.js passes them on.
export const KEYS = Object.freeze(['inside', 'mid', 'three', 'handle', 'speed', 'defence', 'rebound', 'stamina']);

// What a thing is multiplied by for a rating, when every 10 points above 70 adds `per10` of it (and below takes it away).
export const lift = (rating, per10) => 1 + ((rating - 70) / 10) * per10;
// The same for a thing a better rating makes less of: tiredness, the chance of losing the ball.
export const drop = (rating, per10) => 1 - ((rating - 70) / 10) * per10;

// A person's overall: the mean of his best five ratings.
export function overall(person) {
  const best = KEYS.map(key => person.ratings[key]).sort((a, b) => b - a).slice(0, 5);
  return Math.round(best.reduce((sum, r) => sum + r, 0) / 5);
}
