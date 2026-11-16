// The shot model, as plain functions of plain numbers: how much a defender takes off a shot, the chance a shot goes
// in, its green window, and what a shot is worth in expected points. The 3D game works these out from where everyone
// stands (players.js); the fast engine (quick/) from the play it is running. Same functions, same numbers.
import { DT, FT, HEAT, MOVES, RATE, SHOT } from './tuning.js';
import { lift } from './overall.js';
import { shotFactor } from './stamina.js';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// The share of a shot's chance its nearest defender leaves it, from how far off him he is (`gap`, metres), his
// Defence, and whether he is in the air close by; a fade is harder to get to. All of it from SHOT.contestDist away.
export function contestShare({ gap, defence, airborne = false, fading = false }) {
  const byDistance = clamp(SHOT.maxContest + (1 - SHOT.maxContest) * (gap / SHOT.contestDist), SHOT.maxContest, 1);
  // A better defender takes more off the shot from the same distance.
  const factor = clamp(1 - (1 - byDistance) * lift(defence, RATE.contest), 0, 1);
  const left = airborne && gap < SHOT.airContestDist ? factor * SHOT.airContest : factor;
  return fading ? 1 - (1 - left) * MOVES.fade.contest : left;
}

// The chance of a shot from `far` metres before anything else counts. 'line': Arcade's, falling in a straight line from
// the rim. A zone table ({ rim, close, mid, corner3, arc3 }) gives each zone its own (see zoneFor).
export function distanceChance(curve, far, zone) {
  if (curve === 'line') return Math.max(SHOT.minChance, SHOT.nearChance + (SHOT.farChance - SHOT.nearChance) * (far / SHOT.farDist));
  return curve[zone];
}

// The zone of a shot for a zone table: at the rim (a finish, or within 1.5 m), close (to 3 m), mid-range, a corner
// three or a three above the break.
export function zoneFor(far, three, corner, finish) {
  if (finish || far < 1.5) return 'rim';
  if (!three) return far < 3 ? 'close' : 'mid';
  return corner ? 'corner3' : 'arc3';
}

// How much of a shot's chance its timing keeps, `t` seconds after the press: all of it at the best moment, falling in
// a straight line to `worst` at the press and at the landing.
export function timingShare(t, worst, best, lands) {
  const off = t < best ? (best - t) / best : (t - best) / (lands - best);
  return 1 - (1 - worst) * Math.min(1, off);
}

// What his rating for the shot and a streak make of it.
export const skillOf = (rating, heat) => lift(rating, RATE.shot) * (heat === 'hot' ? HEAT.hot : heat === 'cold' ? HEAT.cold : 1);

// The chance a shot goes in. The order of the factors is the one the game has always multiplied them in, so that
// Arcade's numbers stay exactly what they were; `make` (the Shooting slider) and `form` (his night) come last.
export function shotChance({ base, timing, contest, energy, levelMake, skill, fading = false, make = 1, form = 1 }) {
  return clamp(base * timing * contest * shotFactor(energy) * levelMake * skill * (fading ? MOVES.fade.make : 1) * make * form, 0, 1);
}

// How far a green window reaches either side of the best moment: SHOT.greenFull metres out it is full, at
// SHOT.greenNone gone.
export const rangeShare = far => clamp(1 - (far - SHOT.greenFull) / (SHOT.greenNone - SHOT.greenFull), 0, 1);

// The guarded level a contest share puts a shot at: { name, steps }.
export const levelFor = contest => SHOT.levels.find(level => level.above <= contest);

// Half the width of the green window, in seconds.
export function windowHalf({ steps, range, energy, levelGreen, rating, heat }) {
  return steps * DT * range * shotFactor(energy) * levelGreen * Math.max(0, lift(rating, RATE.window)) * (heat === 'hot' ? HEAT.hotWindow : 1);
}

// The chance a green release goes in: 'sure', always; 'boost', the shot's own chance with its miss cut to `boost` of
// what it was.
export const greenChance = (rule, chance, boost = 1) => (rule === 'sure' ? 1 : 1 - (1 - chance) * boost);

// A computer shooter's release: seconds either side of the best moment, drawn evenly within `jitter`.
export const releaseOffset = (rand, jitter) => (rand() * 2 - 1) * jitter;

// The share of a computer's releases, drawn within `jitter` of the best moment, that land in a window `half` wide.
// Half a step of slack, as greenAt has.
export const greenShare = (half, jitter, inRange = true) => (!inRange ? 0 : jitter <= 0 ? 1 : Math.min(1, (half + DT / 2) / jitter));

// What a shot is worth in expected points: its value, times its chance, a green release counted as the style says.
export function expectedShot({ value, chance, green = 0, rule = 'sure', boost = 1 }) {
  return value * (green * greenChance(rule, chance, boost) + (1 - green) * chance);
}

// A computer shooter's free throw. 'flat': the game's own, the same for everyone. 'touch' comes in Stage 4.
export function freeThrowChance(model) {
  if (model === 'flat') return FT.aiChance;
  return FT.aiChance;
}
