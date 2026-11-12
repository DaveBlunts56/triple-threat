// Shared by the test files added in milestone 2. Older test files keep their own helpers.
import { createMatch, emptyIntent } from '../src/sim/state.js';
import { giveBall } from '../src/sim/players.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { DT } from '../src/sim/tuning.js';

// Live play: team 0 at x=5, team 1 at x=-5, spread across the court, player 0 holding the ball.
export function live(seed = 1) {
  const s = createMatch(seed);
  s.players.forEach(p => { p.x = p.team === 0 ? 5 : -5; p.z = (p.slot - 1) * 3; });
  s.phase = 'live';
  giveBall(s, s.players[0]);
  return s;
}

export const idle = () => Array.from({ length: 6 }, emptyIntent);
export const only = (id, intent) => Array.from({ length: 6 }, (_, i) => (i === id ? { ...emptyIntent(), ...intent } : emptyIntent()));

// Steps for `seconds`. `intents` is an array, or a function of the state. Returns true if `done(s)` fired.
export function run(s, seconds, intents = idle(), done) {
  for (let t = 0; t < seconds; t += DT) {
    step(s, typeof intents === 'function' ? intents(s) : intents, DT);
    if (done?.(s)) return true;
  }
  return false;
}

// The state built by `make(seed)` for the first seed where `hit(state)` is true.
export function firstSeed(make, hit, max = 400) {
  for (let seed = 1; seed <= max; seed++) {
    const s = make(seed);
    if (hit(s)) return s;
  }
  throw new Error(`no seed up to ${max} produced the situation`);
}

export const at = (s, id, x, z) => Object.assign(s.players[id], { x, z, vx: 0, vz: 0 });

export function freeBall(s, pos, extra = {}) {
  Object.assign(s.ball, { holder: null, mode: 'loose', shooter: null, shotValue: 0, vx: 0, vy: 0, vz: 0, ...pos, ...extra });
}
export const shotAt = (s, pos, value = 2) => freeBall(s, pos, { mode: 'shot', shooter: 0, shotValue: value });

export const ai = s => aiIntents(s, DT);

// One step with Space up, then one with the free-throw shooter's Space down.
export function press(s) {
  step(s, idle(), DT);
  step(s, only(s.freeThrow.shooter, { shoot: true }), DT);
}

// For run(): taps Space on alternate steps whenever a team 0 player is aiming a free throw.
export const pressWhenAiming = s => {
  const ft = s.freeThrow;
  const tap = ft?.stage === 'aim' && s.players[ft.shooter].team === 0 && Math.round(s.time / DT) % 2 === 0;
  return tap ? only(ft.shooter, { shoot: true }) : idle();
};
