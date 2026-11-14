import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, addPoints } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { RIM } from '../src/sim/tuning.js';
import { live, run, shotAt } from './helpers.js';

test('points are kept by quarter as well as in total', () => {
  const s = createMatch();
  assert.deepEqual(s.byQuarter, [[], []]);
  addPoints(s, 0, 2); addPoints(s, 1, 3);
  s.quarter = 3;
  addPoints(s, 0, 1);
  assert.deepEqual([s.score, s.byQuarter], [[3, 3], [[2, 0, 1], [3]]]);
  s.quarter = 5;                                                          // overtime is one more period
  addPoints(s, 1, 2);
  assert.deepEqual(s.byQuarter[1], [3, 0, 0, 0, 2]);
});

test('a basket in play and a new match both keep the record right', () => {
  const s = live(); s.quarter = 2;
  shotAt(s, { x: RIM.x, y: 3.5, z: 0 }, 3);
  run(s, 1);
  assert.deepEqual([s.score, s.byQuarter[0]], [[3, 0], [0, 3]]);
  startMatch(s);
  assert.deepEqual([s.score, s.byQuarter], [[0, 0], [[], []]]);
});
