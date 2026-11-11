import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodLabel, clockText } from '../src/render/hud.js';

test('periods are Q1-Q4 then OT1, OT2', () => {
  assert.deepEqual([1, 4, 5, 6].map(periodLabel), ['Q1', 'Q4', 'OT1', 'OT2']);
});

test('the game clock reads m:ss and only shows 0:00 when time is really up', () => {
  assert.equal(clockText(180), '3:00');
  assert.equal(clockText(179.2), '3:00');
  assert.equal(clockText(61), '1:01');
  assert.equal(clockText(9.01), '0:10');
  assert.equal(clockText(0.01), '0:01');
  assert.equal(clockText(0), '0:00');
});
