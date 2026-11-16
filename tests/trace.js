// A whole three-a-side computer match of 3-minute quarters, reduced to a fingerprint: every 60 steps a hash of where
// the ball and every player are, to the millimetre; the score each quarter; and the final box score. Two runs of the
// same game on the same code give the same trace. Not a test file itself.
import { createMatch } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { DT } from '../src/sim/tuning.js';

// FNV-1a over a string, as 8 hex digits.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const mm = v => Math.round(v * 1000);

// `setup(state)` runs before the match starts. `keys`: the box-score keys recorded (all of them by default).
export function arcadeTrace(seed, { setup, keys } = {}) {
  const s = createMatch(seed, 3);
  setup?.(s);
  startMatch(s);
  const hashes = [];
  let steps = 0;
  while (s.phase !== 'final' && steps < 60 * 60 * 30) {
    step(s, aiIntents(s, DT), DT);
    if (++steps % 60 === 0) hashes.push(hash([s.ball, ...s.players].map(o => `${mm(o.x)},${mm(o.y)},${mm(o.z)}`).join(';')));
  }
  const box = s.rosters.map(r => r.map(p => Object.fromEntries(Object.entries(p.stats).filter(([k]) => !keys || keys.includes(k)))));
  return { seed, steps, score: s.score, byQuarter: s.byQuarter, hashes, box };
}
