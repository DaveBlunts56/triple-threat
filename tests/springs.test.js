// Spring bones: parts that lag behind and swing as a player moves (src/render/springs.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SPRING, createSprings } from '../src/render/springs.js';

const FRAME = 1 / 60;
// A root that moves, a parent bone at the hip and a spring bone at it, pointing down (a bone points along its own +Y).
function rig() {
  const root = new THREE.Group(), parent = new THREE.Bone(), spring = new THREE.Bone();
  parent.name = 'mixamorigLeftUpLeg'; spring.name = 'kitShortsLeft';
  parent.position.set(0, 1, 0);
  spring.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  root.add(parent); parent.add(spring);
  root.updateMatrixWorld(true);
  return { root, parent, spring, rest: spring.quaternion.clone() };
}
const angle = r => r.spring.quaternion.angleTo(r.rest);
const swingOf = ({ spring }) => spring.quaternion.clone();
const tipX = r => { r.root.updateMatrixWorld(true); return new THREE.Vector3(0, SPRING.reach, 0).applyMatrix4(r.spring.matrixWorld).x - r.root.position.x; };

test('at rest a spring bone stays at rest', () => {
  const r = rig(), springs = createSprings(r.root);
  for (let i = 0; i < 120; i++) springs.update(FRAME);
  assert.ok(angle(r) < 1e-6);
});

test('when the player sets off it swings back, never past its limit, and settles once he runs on steadily and when he stops', () => {
  const r = rig(), springs = createSprings(r.root);
  let x = 0, v = 0, most = 0, back = 0;
  for (let i = 0; i < 12; i++) {                                     // 4 m/s² for 0.2 s
    v += 4 * FRAME; x += v * FRAME; r.root.position.x = x; r.root.updateMatrixWorld(true);
    springs.update(FRAME);
    most = Math.max(most, angle(r));
    back = tipX(r);
  }
  assert.ok(most > 0.02, `it swung ${most} rad`);
  assert.ok(back < 0, 'the hem did not lag behind the leg');
  for (let i = 0; i < 240; i++) {                                   // he stops dead: it swings on, then settles
    r.root.updateMatrixWorld(true); springs.update(FRAME);
    most = Math.max(most, angle(r));
  }
  assert.ok(most <= SPRING.limit + 1e-6, `it swung ${most} rad, past ${SPRING.limit}`);
  assert.ok(angle(r) < 0.02, `it has not settled: ${angle(r)} rad`);
});

test('paused, it holds still; reset puts it at rest at once', () => {
  const r = rig(), springs = createSprings(r.root);
  for (let i = 0; i < 6; i++) { r.root.position.x += 0.1; r.root.updateMatrixWorld(true); springs.update(FRAME); }
  const held = swingOf(r);
  springs.update(0);
  assert.ok(swingOf(r).angleTo(held) < 1e-9);
  springs.reset();
  assert.ok(angle(r) < 1e-9);
  r.root.position.x += 3; r.root.updateMatrixWorld(true);             // put somewhere else after the reset: no jolt
  springs.update(FRAME);
  assert.ok(angle(r) < 1e-6);
});

test('a model with no spring bones gives no error and does nothing', () => {
  const root = new THREE.Group(); root.add(new THREE.Bone());
  const springs = createSprings(root);
  springs.update(FRAME); springs.reset();
  assert.deepEqual(springs.names, []);
});
