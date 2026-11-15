// Foot planting, with the real mixer on the real motion file: a foot on the floor stays where it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAnimator } from '../src/render/animator.js';
import { FEET } from '../src/render/feet.js';

const data = readFileSync('assets/motion.glb');
const facts = JSON.parse(readFileSync('assets/motion.json', 'utf8'));
const FRAME = 1 / 60, stance = { clip: 'stance', rate: 1 }, SIDES = ['Left', 'Right'];

// One person standing in a group, as the game places him: { group, animator, feet(): where his two ankles are on the court }.
async function someone() {
  const gltf = await new Promise((ok, bad) => new GLTFLoader().parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '', ok, bad));
  const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
  const group = new THREE.Group(); group.add(gltf.scene);
  const animator = createAnimator(gltf.scene, clips, facts, 1, 0);
  const bone = name => gltf.scene.getObjectByName(name);
  const feet = () => { group.updateMatrixWorld(true); return SIDES.map(side => bone(`mixamorig${side}Foot`).getWorldPosition(new THREE.Vector3())); };
  return { group, animator, feet, bone };
}
// Two people given the same motions and carried the same way: one plants his feet, the other does not. Both have
// stood in the stance for a second and a half, so the planted feet have stepped to where the stance has them.
async function pair() {
  const men = [await someone(), await someone()];
  for (let i = 0; i < 90; i++) { men[0].animator.update(stance, null, FRAME, null, true); men[1].animator.update(stance, null, FRAME); }
  return men;
}
const across = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('a foot on the floor stays where it is while he is carried on, and the other man\'s slides with him', async () => {
  const [planted, loose] = await pair();
  const before = planted.feet();
  for (let i = 1; i <= 12; i++) {
    for (const man of [planted, loose]) man.group.position.set(0.015 * i, 0, 0);   // 0.18 m in a fifth of a second: less than a step
    planted.animator.update(stance, null, FRAME, null, true); loose.animator.update(stance, null, FRAME);
  }
  planted.feet().forEach((foot, i) => assert.ok(across(foot, before[i]) < 0.01, `${SIDES[i]} foot slid ${across(foot, before[i])} m`));
  loose.feet().forEach((foot, i) => assert.ok(across(foot, before[i]) > 0.15, `${SIDES[i]} foot of the other did not slide`));
});

test('he turns on a planted foot: the foot does not swing round with him', async () => {
  const [planted] = await pair();
  const before = planted.feet();
  for (let i = 1; i <= 10; i++) { planted.group.rotation.y = 0.02 * i; planted.animator.update(stance, null, FRAME, null, true); }   // 11 degrees: further, and a foot steps round
  planted.feet().forEach((foot, i) => assert.ok(across(foot, before[i]) < 0.01, `${SIDES[i]} foot swung ${across(foot, before[i])} m`));
});

test('left too far behind, a foot steps after him: lifted, one at a time but for a moment, and both end under him', async () => {
  const [planted, loose] = await pair();
  const floor = planted.feet().map(foot => foot.y);
  let last = planted.feet(), highest = 0, both = 0, fastest = 0;
  for (let i = 1; i <= 60; i++) {
    const x = Math.min(1.2, 0.05 * i);                                // 1.2 m at 3 m/s, then he stands
    for (const man of [planted, loose]) man.group.position.set(x, 0, 0);
    planted.animator.update(stance, null, FRAME, null, true); loose.animator.update(stance, null, FRAME);
    const now = planted.feet(), up = now.map((foot, k) => foot.y - floor[k]);
    highest = Math.max(highest, ...up);
    if (up[0] > 0.02 && up[1] > 0.02) both++;
    fastest = Math.max(fastest, ...now.map((foot, k) => foot.distanceTo(last[k]) / FRAME));
    last = now;
  }
  assert.ok(highest > FEET.rise * 0.5, `the feet rose ${highest} m at most`);
  assert.ok(both <= 6, `both feet were off the floor together for ${both} frames`);   // at 3 m/s he may hop for a moment, no more
  assert.ok(fastest < 18, `a foot moved at ${fastest} m/s`);            // a quick step: put somewhere else in one frame it would be over 30 m/s
  const ends = planted.feet(), wanted = loose.feet();
  ends.forEach((foot, i) => assert.ok(across(foot, wanted[i]) < FEET.settle + 0.01, `${SIDES[i]} foot ended ${across(foot, wanted[i])} m from under him`));
});

test('in the air, and when the game does not ask for it, the feet are the motion\'s own', async () => {
  const [planted, loose] = await pair();
  for (let i = 1; i <= 20; i++) {
    for (const man of [planted, loose]) man.group.position.set(0.05 * i, 0.4, 0);
    planted.animator.update(stance, null, FRAME, null, false); loose.animator.update(stance, null, FRAME);
  }
  const a = planted.feet(), b = loose.feet();
  a.forEach((foot, i) => assert.ok(foot.distanceTo(b[i]) < 0.005, `${SIDES[i]} foot is ${foot.distanceTo(b[i])} m from the motion's`));
});

test('a player put somewhere else at once has his feet under him at once', async () => {
  const [planted, loose] = await pair();
  for (const man of [planted, loose]) man.group.position.set(6, 0, -3);
  planted.animator.update(stance, null, FRAME, null, true); loose.animator.update(stance, null, FRAME);
  const a = planted.feet(), b = loose.feet();
  a.forEach((foot, i) => assert.ok(foot.distanceTo(b[i]) < 0.005, `${SIDES[i]} foot was left ${foot.distanceTo(b[i])} m behind`));
});

test('planting does not wind the legs up: a minute standing planted leaves them as the motion has them', async () => {
  const [planted, loose] = await pair();
  for (let i = 0; i < 3600; i++) { planted.animator.update(stance, null, FRAME, null, true); loose.animator.update(stance, null, FRAME); }
  for (const name of ['mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigLeftFoot', 'mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightFoot']) {
    assert.ok(planted.bone(name).quaternion.angleTo(loose.bone(name).quaternion) < 0.15, `${name} is ${planted.bone(name).quaternion.angleTo(loose.bone(name).quaternion)} rad off`);
  }
  const a = planted.feet(), b = loose.feet();
  a.forEach((foot, i) => assert.ok(foot.distanceTo(b[i]) < FEET.settle + 0.01, `${SIDES[i]} foot drifted ${foot.distanceTo(b[i])} m`));
});

test('running at the pace of the run, a foot on the floor does not slide, and is never left so far behind that it must step', async () => {
  const planted = await someone(), loose = await someone(), run = { clip: 'run', rate: 1 }, speed = facts.gaits.run;
  let last = null, slid = 0, down = 0, worst = 0;
  for (let i = 1; i <= 180; i++) {
    for (const man of [planted, loose]) man.group.position.set(0, 0, speed * FRAME * i);   // the model faces +z
    planted.animator.update(run, null, FRAME, null, true); loose.animator.update(run, null, FRAME);
    const now = planted.feet(), free = loose.feet();
    if (i > 60) now.forEach((foot, k) => {
      if (foot.y < FEET.ankle + FEET.lift && last[k].y < FEET.ankle + FEET.lift) { slid += across(foot, last[k]); down++; }
      worst = Math.max(worst, across(foot, free[k]));
    });
    last = now;
  }
  assert.ok(down > 20, `a foot was on the floor for ${down} frames`);
  assert.ok(slid / down < 0.004, `feet on the floor slid ${slid / down} m a frame`);     // under 0.25 m/s; the motion alone slides them at over 1 m/s
  assert.ok(worst < FEET.most, `a foot was ${worst} m from the motion's`);
});

test('the two steps of a finish are planted: carried 1.5 m through the gather, a flat foot hardly slides', async () => {
  const man = await someone();
  for (let i = 0; i < 30; i++) man.animator.update({ clip: 'run', rate: 1 }, null, FRAME, null, true);
  let last = null, slid = 0;
  for (let i = 1; i <= 30; i++) {
    man.group.position.set(0, 0, 0.05 * i);                              // the model faces +z: 3 m/s
    const gather = { clip: 'finishGather', at: i / 30 };
    man.animator.update(gather, gather, FRAME, null, true);
    const now = man.feet();
    if (last) now.forEach((foot, k) => { if (foot.y < FEET.ankle + 0.015 && last[k].y < FEET.ankle + 0.015) slid += across(foot, last[k]); });
    last = now;
  }
  assert.ok(slid < 0.1, `flat feet slid ${slid} m through the gather`);
});
