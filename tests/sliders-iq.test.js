// The sliders move the fast engine's results the right way (plan Task 5.6): offensive IQ, defensive IQ, ball
// security, each over 150 games at 20 and at 80, the same seeds at each. See sliders.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slid } from './sliding.js';

test('offensive IQ up: fewer turnovers, and better shots (more expected points a shot)', () => {
  const lo = slid('offIQ', 20), hi = slid('offIQ', 80);
  assert.ok(hi.tov < lo.tov, `turnovers ${lo.tov.toFixed(1)} -> ${hi.tov.toFixed(1)}`);
  assert.ok(hi.ep > lo.ep, `expected points a shot ${lo.ep.toFixed(3)} -> ${hi.ep.toFixed(3)}`);
});

test('defensive IQ up: the other team\'s eFG% down', () => {
  const lo = slid('defIQ', 20), hi = slid('defIQ', 80);
  assert.ok(hi.efg < lo.efg, `${lo.efg.toFixed(3)} -> ${hi.efg.toFixed(3)}`);
});

test('ball security up: fewer turnovers', () => {
  const lo = slid('security', 20), hi = slid('security', 80);
  assert.ok(hi.tov < lo.tov - 2, `${lo.tov.toFixed(1)} -> ${hi.tov.toFixed(1)}`);
});
