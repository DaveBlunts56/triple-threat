import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { setStyle } from '../src/sim/styles.js';
import { choose } from '../src/sim/choose.js';

const options = [{ key: 'best', value: 1.2 }, { key: 'worse', value: 0.9 }];
const share = (s, iq, n = 2000, side = 'offence') => { let best = 0; for (let i = 0; i < n; i++) if (choose(s, options, iq, side).key === 'best') best++; return best / n; };

test('a sharp player nearly always takes the best; a poor one sometimes does not', () => {
  assert.ok(share(createMatch(1, 5), 0.98) >= 0.95);
  const poor = 1 - share(createMatch(2, 5), 0.4);
  assert.ok(poor >= 0.15 && poor <= 0.45, `${poor}`);
});

test('an option not allowed is never taken, and with none allowed there is no choice', () => {
  const s = createMatch(3, 5);
  for (let i = 0; i < 500; i++) assert.equal(choose(s, [{ key: 'no', value: -Infinity }, { key: 'yes', value: 0.1 }, { key: 'no2', value: -Infinity }], 0.4).key, 'yes');
  assert.equal(choose(s, [{ key: 'no', value: -Infinity }], 0.9), null);
});

test('the same seed draws the same', () => {
  const draw = () => { const s = createMatch(7, 5); return Array.from({ length: 50 }, () => choose(s, options, 0.6).key).join(); };
  assert.equal(draw(), draw());
});

test('the IQ sliders sharpen and blur, each for its own side', () => {
  const at = (key, value) => setStyle(createMatch(4, 5), 'arcade', { [key]: value });
  assert.ok(share(at('offIQ', 100), 0.6) > share(at('offIQ', 0), 0.6) + 0.05);
  assert.ok(share(at('defIQ', 100), 0.6, 2000, 'defence') > share(at('defIQ', 0), 0.6, 2000, 'defence') + 0.05);
  assert.equal(share(at('defIQ', 0), 0.6), share(at('defIQ', 100), 0.6));   // the defence's slider leaves the offence alone
});
