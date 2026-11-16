// The sliders move the fast engine's results the right way (plan Task 5.6): fouls, rebounding, fatigue, each over 200
// games at 20 and at 80, the same seeds at each; and every slider at its ends. See sliders.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slid } from './sliding.js';
import { quickMatch } from '../src/sim/quick/engine.js';
import { SLIDERS, defaultSliders } from '../src/sim/styles.js';
import { teamLine } from '../src/sim/stats.js';

test('fouls up: more free throws', () => {
  const lo = slid('fouls', 20), hi = slid('fouls', 80);
  assert.ok(hi.fta > lo.fta + 3, `${lo.fta.toFixed(1)} -> ${hi.fta.toFixed(1)}`);
});

test('rebounding up: more offensive rebounds', () => {
  const lo = slid('rebounding', 20), hi = slid('rebounding', 80);
  assert.ok(hi.orb > lo.orb + 2, `${lo.orb.toFixed(1)} -> ${hi.orb.toFixed(1)}`);
});

test('fatigue up: more substitutions, and worse shots late (fewer expected points a shot in the fourth quarter)', () => {
  const lo = slid('fatigue', 20), hi = slid('fatigue', 80);
  assert.ok(hi.subs > lo.subs, `substitutions ${lo.subs.toFixed(1)} -> ${hi.subs.toFixed(1)}`);
  assert.ok(hi.ep4 < lo.ep4, `fourth-quarter expected points a shot ${lo.ep4.toFixed(3)} -> ${hi.ep4.toFixed(3)}`);
});

test('every slider at 0 and at 100: games end, with a winner, and every box score adds up', () => {
  for (const { key } of SLIDERS) for (const value of [0, 100]) for (let seed = 1; seed <= 3; seed++) {
    const s = quickMatch({ seed, sliders: { ...defaultSliders(), [key]: value } });
    assert.equal(s.phase, 'final', `${key} ${value}`);
    assert.notEqual(s.score[0], s.score[1]);
    for (const t of [0, 1]) {
      const l = teamLine(s, t);
      assert.equal(l.pts, 2 * l.fgm + l.tpm + l.ftm, `${key} ${value} seed ${seed}`);
      assert.equal(l.pts, s.score[t]);
      assert.ok(l.fgm <= l.fga && l.tpm <= l.tpa && l.ftm <= l.fta, `${key} ${value} seed ${seed}`);
    }
  }
});
