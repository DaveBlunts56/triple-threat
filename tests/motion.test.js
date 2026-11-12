import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legMotion, AIR_TIME, MOTION } from '../src/render/motion.js';

const gaits = { walk: 1.5, run: 4, sprint: 6.5 };
const still = { vx: 0, vz: 0, y: 0, vy: 0, jumpT: 0 };
const clip = (speed, last) => legMotion({ ...still, vx: speed }, gaits, last).clip;

test('standing is idle; moving is a walk, a run or a sprint by speed', () => {
  assert.deepEqual([0, 0.2, 1, 2.1, 2.3, 5, 5.5, 5.95, 7].map(v => clip(v)),
    ['idle', 'idle', 'walk', 'walk', 'run', 'run', 'run', 'sprint', 'sprint']);
});

test('the clip plays at the rate that matches his real speed, within limits', () => {
  assert.equal(legMotion({ ...still, vx: 5 }, gaits).rate, 1.25);          // 5 / 4
  assert.equal(legMotion({ ...still, vx: 2.3 }, gaits).rate, 0.6);         // 2.3 / 4 is 0.575: held at the slowest rate
  assert.equal(legMotion({ ...still, vx: 3, vz: 4 }, gaits).rate, 1.25);   // speed is the length of the velocity
  assert.equal(legMotion(still, gaits).rate, 1);
});

test('in the air the legs follow the jump, whatever his speed', () => {
  assert.deepEqual(legMotion({ ...still, vx: 5, y: 0.5, vy: 1, jumpT: AIR_TIME / 2 }, gaits), { clip: 'jump', at: 0.5 });
  assert.equal(legMotion({ ...still, y: 0.1, vy: -3, jumpT: 5 }, gaits).at, 1);      // never past the landing
  assert.equal(legMotion({ ...still, vy: 4, jumpT: 0 }, gaits).clip, 'jump');        // the step he leaves the floor
});

test('near the edge between two gaits he keeps the one he is in', () => {
  assert.deepEqual([clip(5.7, 'run'), clip(5.85, 'run')], ['run', 'sprint']);
  assert.deepEqual([clip(5.5, 'sprint'), clip(5.3, 'sprint')], ['sprint', 'run']);
  assert.deepEqual([clip(0.4, 'idle'), clip(0.2, 'walk')], ['idle', 'walk']);
  assert.equal(clip(5.25, 'run'), 'run');                                           // a tired sprinter: no flicker
});

test('a jump always ends in the gait his speed calls for', () => {
  assert.equal(clip(5, 'jump'), 'run');
});

test('a jump lasts as long as the rules make it, and motions cross-fade in 0.15 seconds', () => {
  assert.ok(Math.abs(AIR_TIME - 0.8155) < 0.001, `air time ${AIR_TIME}`);
  assert.equal(MOTION.fade, 0.15);
});
