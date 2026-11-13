import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dribbleHeight, switchSpot, ballSpot, ballHands, BALL_IN_HAND } from '../src/render/motion.js';

const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;

test('a dribbled ball stays at the hand for 55% of each bounce and touches the floor midway through the rest', () => {
  const d = { push: 0.25, bounces: 1 }, height = phase => dribbleHeight(phase, d, 1, 0.12);
  assert.ok(near(height(0.25), 1) && near(height(0.475), 0.12) && near(height(0.7), 1) && near(height(0.9), 1) && near(height(0.1), 1));
  const atHand = Array.from({ length: 1000 }, (_, i) => height(i / 1000)).filter(y => y > 1 - 1e-9).length;
  assert.ok(Math.abs(atHand - 550) <= 2, `${atHand / 10}% of the cycle at the hand`);
  assert.ok(near(dribbleHeight(0.5, { push: 0, bounces: 2 }, 1, 0.12), 1) && near(dribbleHeight(0.1125, { push: 0, bounces: 2 }, 1, 0.12), 0.12));
  assert.ok(near(dribbleHeight(0.475, d, 0.8, 0.12), 0.12) && near(dribbleHeight(0.9, d, 0.8, 0.12), 0.8));   // it follows the hand's real height
});

test('changing hands, the ball crosses low in front with one bounce on the way', () => {
  const from = { x: 0, y: 0.9, z: -0.3 }, to = { x: 0.1, y: 0.9, z: 0.3 };
  assert.deepEqual(switchSpot(from, to, 0, 0.12), from);
  assert.deepEqual(switchSpot(from, to, 1, 0.12), to);
  const mid = switchSpot(from, to, 0.5, 0.12);
  assert.ok(near(mid.x, 0.05) && near(mid.z, 0) && near(mid.y, 0.12));
  assert.ok(switchSpot(from, to, 0.25, 0.12).y < 0.9 && switchSpot(from, to, 0.25, 0.12).y > 0.12);
});

test('whenever the ball changes hands or leaves them it is drawn there over a tenth of a second, and never jumps', () => {
  const held = { x: 1, y: 2, z: 0 }, ruled = { x: 2, y: 3, z: 0 };
  assert.deepEqual(ballSpot(held, ruled, 0), held);
  assert.deepEqual(ballSpot(held, ruled, 0.05), { x: 1.5, y: 2.5, z: 0 });
  assert.deepEqual(ballSpot(held, ruled, BALL_IN_HAND.blend), ruled);
  assert.deepEqual(ballSpot(held, ruled, 5), ruled);
  assert.deepEqual(ballSpot(null, ruled, 0), ruled);                       // the first frame: nothing to blend from
});

test('the dribble is carried in one hand, everything else in both', () => {
  assert.deepEqual(['dribble', 'dribbleLeft', 'hold', 'holdLeft', 'shoot', 'catch'].map(ballHands), ['right', 'left', 'both', 'both', 'both', 'both']);
});
