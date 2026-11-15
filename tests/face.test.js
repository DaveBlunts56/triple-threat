import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACE, createFace, faceWants } from '../src/render/face.js';
import { STEAL } from '../src/sim/tuning.js';

const DT = 1 / 60;
const NAMES = ['blink', 'effort', 'shout', 'dejected'];
const fakeMesh = () => ({ morphTargetDictionary: Object.fromEntries(NAMES.map((n, i) => [n, i])), morphTargetInfluences: NAMES.map(() => 0) });
const level = (mesh, name) => mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]];

// The times (s) each blink of `seconds` of frames starts and how long it lasts.
function blinks(seed, seconds) {
  const mesh = fakeMesh(), face = createFace(mesh, seed), out = [];
  let start = null;
  for (let i = 0; i < seconds / DT; i++) {
    face.update(DT, {});
    const shut = level(mesh, 'blink') > 0;
    if (shut && start === null) start = i * DT;
    if (!shut && start !== null) { out.push([start, i * DT - start]); start = null; }
  }
  return out;
}

test('he blinks within the first six seconds, every two to six seconds, each blink lasting 0.12 s', () => {
  const seen = blinks(7, 60);
  assert.ok(seen.length >= 10 && seen[0][0] <= FACE.blinkEvery[1], `blinks at ${seen.map(b => b[0].toFixed(2))}`);
  for (const [, lasting] of seen) assert.ok(Math.abs(lasting - FACE.blinkFor) <= DT + 1e-9, `a blink of ${lasting.toFixed(3)} s`);
  for (let i = 1; i < seen.length; i++) {
    const gap = seen[i][0] - seen[i - 1][0];
    assert.ok(gap >= FACE.blinkEvery[0] - DT && gap <= FACE.blinkEvery[1] + DT, `${gap.toFixed(2)} s between blinks`);
  }
});

test('two players blink at different times', () => {
  assert.notDeepEqual(blinks(3, 20).map(b => b[0].toFixed(2)), blinks(11, 20).map(b => b[0].toFixed(2)));
});

test('a wanted expression comes in fully within 0.15 s and goes out within 0.15 s after', () => {
  const mesh = fakeMesh(), face = createFace(mesh, 1), frames = Math.ceil(FACE.ease / DT);
  for (let i = 0; i < frames; i++) face.update(DT, { effort: true });
  assert.ok(level(mesh, 'effort') > 0.999, `${level(mesh, 'effort')}`);
  assert.equal(level(mesh, 'shout'), 0);
  for (let i = 0; i < frames; i++) face.update(DT, {});
  assert.ok(level(mesh, 'effort') < 0.001, `${level(mesh, 'effort')}`);
});

test('reset leaves a neutral face, and a mesh without expressions is left alone', () => {
  const mesh = fakeMesh(), face = createFace(mesh, 1);
  for (let i = 0; i < 400; i++) face.update(DT, { shout: true, dejected: true });
  face.reset();
  assert.deepEqual(mesh.morphTargetInfluences, [0, 0, 0, 0]);
  const bare = createFace({}, 1);
  assert.doesNotThrow(() => { bare.update(DT, { effort: true }); bare.reset(); });
  assert.doesNotThrow(() => createFace(null, 1).update(DT, {}));
});

test('effort in a finish, a fade, a step-back and a swipe at the ball; a shout when celebrating; dejected when beaten', () => {
  const player = { id: 3, shooting: false, finish: null, fading: false, move: null, stealCooldown: 0 };
  const none = { effort: false, shout: false, dejected: false };
  assert.deepEqual(faceWants(player, {}), none);
  assert.equal(faceWants({ ...player, shooting: true, finish: 'dunk' }, {}).effort, true);
  assert.equal(faceWants({ ...player, shooting: true, fading: true }, {}).effort, true);
  assert.equal(faceWants({ ...player, shooting: true }, {}).effort, false);   // a plain jump shot keeps his face
  assert.equal(faceWants({ ...player, move: { kind: 'stepBack' } }, {}).effort, true);
  assert.equal(faceWants({ ...player, move: { kind: 'crossover' } }, {}).effort, false);
  assert.equal(faceWants({ ...player, stealCooldown: STEAL.cooldown - 0.1 }, {}).effort, true);
  assert.equal(faceWants({ ...player, stealCooldown: STEAL.cooldown - FACE.reach - 0.1 }, {}).effort, false);
  assert.deepEqual(faceWants(player, { show: { celebrate: 3 } }), { ...none, shout: true });
  assert.deepEqual(faceWants(player, { show: { dejected: 3 } }), { ...none, dejected: true });
  assert.deepEqual(faceWants(player, { show: { celebrate: 4, dejected: 5 } }), none);
});
