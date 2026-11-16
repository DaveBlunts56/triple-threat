// The sliders move the fast engine's results the right way (plan Task 5.6), each over 150 games at 20 and at 80, the
// same seeds at each: direction only. Pace, shot selection, shooting (the IQ and security sliders are in
// sliders-iq.test.js, the rest in sliders-body.test.js, so that the three run side by side).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slid } from './sliding.js';

test('pace up: more possessions', () => {
  const lo = slid('pace', 20), hi = slid('pace', 80);
  assert.ok(hi.poss > lo.poss + 3, `${lo.poss.toFixed(1)} -> ${hi.poss.toFixed(1)}`);
});

test('shot selection up: a higher three-point rate and more of the shots at the rim, fewer from the mid-range', () => {
  const lo = slid('selection', 20), hi = slid('selection', 80);
  assert.ok(hi.threeRate > lo.threeRate, `threes ${lo.threeRate.toFixed(3)} -> ${hi.threeRate.toFixed(3)}`);
  assert.ok(hi.rim > lo.rim, `rim ${lo.rim.toFixed(3)} -> ${hi.rim.toFixed(3)}`);
});

test('shooting up: a higher eFG%', () => {
  const lo = slid('shooting', 20), hi = slid('shooting', 80);
  assert.ok(hi.efg > lo.efg + 0.05, `${lo.efg.toFixed(3)} -> ${hi.efg.toFixed(3)}`);
});
