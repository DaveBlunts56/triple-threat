import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, rand, attackSign, emptyIntent } from '../src/sim/state.js';

test('createMatch builds six players, three per team', () => {
  const s = createMatch();
  assert.equal(s.players.length, 6);
  assert.deepEqual(s.players.map(p => p.id), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(s.players.map(p => p.team), [0, 0, 0, 1, 1, 1]);
  assert.deepEqual(s.players.map(p => p.slot), [0, 1, 2, 0, 1, 2]);
  assert.equal(s.phase, 'start');
  assert.equal(s.quarter, 1);
  assert.equal(s.gameClock, 180);
  assert.equal(s.shotClock, 24);
  assert.deepEqual(s.score, [0, 0]);
  assert.equal(s.controlled, 0);
  assert.equal(s.ball.holder, null);
});

test('teams start on their own side of centre court', () => {
  const s = createMatch();
  for (const p of s.players) assert.ok(p.team === 0 ? p.x < 0 : p.x > 0);
});

test('rand is deterministic per seed and stays in [0,1)', () => {
  const a = createMatch(7), b = createMatch(7);
  const xs = Array.from({ length: 100 }, () => rand(a));
  assert.deepEqual(xs, Array.from({ length: 100 }, () => rand(b)));
  assert.ok(xs.every(x => x >= 0 && x < 1));
  assert.ok(new Set(xs).size > 90);
});

test('attackSign', () => {
  assert.equal(attackSign(0), 1);
  assert.equal(attackSign(1), -1);
});

test('emptyIntent is all zeros and falses', () => {
  assert.deepEqual(emptyIntent(), { moveX: 0, moveZ: 0, sprint: false, shoot: false, pass: false, steal: false, switch: false });
});
