// The parts of the ratings that need no match: the eight keys, what a rating multiplies a thing by, and a person's
// overall. In a file of their own, importing nothing, so that state.js can use them while ratings.js imports state.js
// (the single-file build needs the imports to form a tree). ratings.js passes them on.
export const KEYS = Object.freeze(['inside', 'mid', 'three', 'handle', 'speed', 'defence', 'rebound', 'stamina']);

// What a thing is multiplied by for a rating, when every 10 points above 70 adds `per10` of it (and below takes it away).
export const lift = (rating, per10) => 1 + ((rating - 70) / 10) * per10;
// The same for a thing a better rating makes less of: tiredness, the chance of losing the ball.
export const drop = (rating, per10) => 1 - ((rating - 70) / 10) * per10;

// A person's overall: the mean of his best five ratings. (All eight less the lowest three: the named fields let the engine
// read all eight directly.)
export function overall(person) {
  const r = person.ratings;
  let total = 0, a = Infinity, b = Infinity, c = Infinity;   // the three lowest, a <= b <= c
  for (const v of [r.inside, r.mid, r.three, r.handle, r.speed, r.defence, r.rebound, r.stamina]) {
    total += v;
    if (v < a) { c = b; b = a; a = v; } else if (v < b) { c = b; b = v; } else if (v < c) c = v;
  }
  return Math.round((total - a - b - c) / 5);
}
