// The hand-made motions, measured in the shipped file: each is held at a moment with the real mixer and the bones are read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MOVE_BALL } from '../src/render/hands.js';

const data = readFileSync('assets/motion.glb');
const gltf = await new Promise((ok, bad) => new GLTFLoader().parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '', ok, bad));
const BONES = ['Hips', 'Spine2', 'Head', 'LeftArm', 'RightArm', 'LeftHand', 'RightHand', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];

// Where those bones are, in metres, with motion `name` held at `share` of its length. `mid` is the point between the wrists.
// The player stands on the floor at the origin and faces +z; his left is +x. LeftArm and RightArm are the shoulder joints,
// LeftLeg and RightLeg the knees, LeftFoot and RightFoot the ankles.
function posed(name, share) {
  const mixer = new THREE.AnimationMixer(gltf.scene), clip = gltf.animations.find(c => c.name === name);
  assert.ok(clip, `no ${name}`);
  const action = mixer.clipAction(clip).play();
  action.timeScale = 0; action.time = share * clip.duration;
  mixer.update(0);
  gltf.scene.updateMatrixWorld(true);
  const at = Object.fromEntries(BONES.map(bone => [bone, gltf.scene.getObjectByName(`mixamorig${bone}`).getWorldPosition(new THREE.Vector3())]));
  at.LeftToe = at.LeftToeBase; at.RightToe = at.RightToeBase;
  at.mid = at.LeftHand.clone().add(at.RightHand).multiplyScalar(0.5);
  at.apart = at.LeftHand.distanceTo(at.RightHand);
  return at;
}
const stood = posed('idle', 0);

test('the stance is deep and wide, with the arms out low', () => {
  for (const share of [0, 0.5]) {
    const p = posed('stance', share), lower = stood.Hips.y - p.Hips.y;
    assert.ok(lower > 0.2 && lower < 0.3, `hips ${lower} m lower`);
    assert.ok(p.LeftFoot.x - p.RightFoot.x > 0.7, `feet ${p.LeftFoot.x - p.RightFoot.x} m apart`);
    assert.ok(Math.abs(p.LeftFoot.y - stood.LeftFoot.y) < 0.05 && Math.abs(p.RightFoot.y - stood.RightFoot.y) < 0.05, 'a foot is off the floor or under it');
    for (const side of ['Left', 'Right']) {
      const hand = p[`${side}Hand`];
      assert.ok(hand.y < p.Hips.y && hand.y > p[`${side}Leg`].y, `${side} hand ${hand.y} m up`);          // between knee and hip
      assert.ok(Math.abs(hand.x) > 0.45, `${side} hand only ${Math.abs(hand.x)} m out`);
    }
  }
});

test('the gather dips the knees and is back at standing height when his feet leave the floor', () => {
  const start = posed('gather', 0), low = posed('gather', 0.55), end = posed('gather', 1), dip = start.Hips.y - low.Hips.y;
  assert.ok(dip > 0.06 && dip < 0.12, `dips ${dip} m`);
  assert.ok(Math.abs(end.Hips.y - start.Hips.y) < 0.015);
  for (const p of [low, end]) assert.ok(Math.abs(p.LeftFoot.y - start.LeftFoot.y) < 0.03 && Math.abs(p.RightFoot.y - start.RightFoot.y) < 0.03, 'a foot left the floor');
});

test('a held ball sits on the hip, right or left, not in front of the chest', () => {
  const right = posed('hold', 0), left = posed('holdLeft', 0);
  assert.ok(right.mid.x < -0.12 && Math.abs(right.mid.y - right.Hips.y) < 0.2, `the ball is ${right.mid.x} m across and ${right.mid.y} m up`);   // his right is -x
  assert.ok(right.apart > 0.2 && right.apart < 0.4, `wrists ${right.apart} m apart`);                                                         // a ball between them
  assert.ok(left.mid.x > 0.12 && Math.abs(left.mid.x + right.mid.x) < 0.02 && Math.abs(left.mid.y - right.mid.y) < 0.02, 'holdLeft is not hold in a mirror');
});

test('the shot dips to the waist, and the ball is at the set point above the forehead when the gather ends', () => {
  const dip = posed('shoot', 0.55), set = posed('shoot', 1);
  assert.ok(dip.mid.y > 0.95 && dip.mid.y < 1.35, `the dip holds the ball ${dip.mid.y} m up`);
  assert.ok(set.mid.y > set.Head.y + 0.2 && set.mid.y < 2.3, `the set point is ${set.mid.y} m up`);
  assert.ok(Math.hypot(set.mid.x - set.Head.x, set.mid.z - set.Head.z) < 0.3 && set.mid.z > set.Head.z - 0.05, 'the ball is not over the forehead');
  assert.ok(set.apart < 0.4);
});

test('the follow-through is up within a tenth of a second, stays up, and comes down at the end', () => {
  for (const share of [0.2, 0.6]) { const p = posed('follow', share); assert.ok(p.RightHand.y > p.Head.y + 0.35, `at ${share} the hand is ${p.RightHand.y} m up`); }
  const end = posed('follow', 1);
  assert.ok(end.RightHand.y < end.RightArm.y, 'the arm never comes down');
});

test('the free throw is a set shot: up to the set point, a follow-through, then down', () => {
  const set = posed('freeThrow', 0.45);
  assert.ok(set.mid.y > set.Head.y + 0.15, `the ball only reaches ${set.mid.y} m`);
  for (const share of [0.6, 0.85]) { const p = posed('freeThrow', share); assert.ok(p.RightHand.y > p.Head.y + 0.35, `at ${share}`); }
  const end = posed('freeThrow', 1);
  assert.ok(end.RightHand.y < end.RightArm.y, 'the arm never comes down');
});

test('a pass shows what follows the throw: the arms are already out at its first frame', () => {
  const out = posed('pass', 0), end = posed('pass', 1);
  for (const side of ['Left', 'Right']) {
    const hand = out[`${side}Hand`];
    assert.ok(hand.z > out.Spine2.z + 0.4 && Math.abs(hand.y - out.Spine2.y) < 0.25, `${side} hand is not out in front of the chest`);
    assert.ok(end[`${side}Hand`].z < hand.z - 0.2, `${side} arm never relaxes`);
  }
});

test('the catch reaches out, then pulls the ball in', () => {
  const out = posed('catch', 0.6), end = posed('catch', 1);
  assert.ok(out.mid.z > out.Spine2.z + 0.3 && Math.abs(out.mid.y - out.Spine2.y) < 0.3, 'the hands are not out at chest height');
  assert.ok(out.apart > 0.2 && out.apart < 0.45, `hands ${out.apart} m apart`);
  assert.ok(end.mid.z < out.mid.z - 0.1, 'the ball is never pulled in');
});

test('a steal reach is out within 0.07 s and comes back', () => {
  const out = posed('reach', 0.07 / 0.4), end = posed('reach', 1);
  assert.ok(out.RightHand.z > out.Spine2.z + 0.4 && out.RightHand.y < out.RightArm.y, `after 0.07 s the hand is ${out.RightHand.z} m forward`);
  assert.ok(end.RightHand.z < out.RightHand.z - 0.2, 'the arm never comes back');
});

test('a hand goes up to a shooter: the right arm high, the left low', () => {
  for (const share of [0, 0.5]) {
    const p = posed('handUp', share);
    assert.ok(p.RightHand.y > p.Head.y + 0.35 && p.LeftHand.y < p.LeftArm.y, `at ${share}`);
  }
});

test('a contest ends with both arms up, a tip with one reaching', () => {
  const contest = posed('contest', 1), tip = posed('tip', 1);
  assert.ok(contest.LeftHand.y > contest.Head.y + 0.35 && contest.RightHand.y > contest.Head.y + 0.35);
  assert.ok(tip.RightHand.y > tip.Head.y + 0.4 && tip.LeftHand.y < tip.LeftArm.y);
});

// ---------- the five moves, made by hand until a downloaded clip takes their place ----------

const motionFacts = JSON.parse(readFileSync('assets/motion.json', 'utf8'));
const byHand = name => motionFacts.clips[name]?.from === 'hand';
const still = posed('hold', 0);   // an arms-only motion: his legs as they rest

test('the file has a motion for each move, the dribbles with a twin for the other hand, each as long as its move', () => {
  const lengths = { crossover: 0.3, betweenLegs: 0.4, behindBack: 0.5, stepBack: 0.35, fade: 0.3 };
  for (const [name, seconds] of Object.entries(lengths)) {
    assert.ok(motionFacts.clips[name], name);
    assert.ok(['hand', 'clip'].includes(motionFacts.clips[name].from), `${name} says where it is from`);
    if (byHand(name)) assert.ok(Math.abs(motionFacts.clips[name].duration - seconds) < 0.02, `${name} lasts ${motionFacts.clips[name].duration}`);   // to the nearest frame
  }
  for (const name of ['crossover', 'betweenLegs', 'behindBack']) assert.equal(motionFacts.clips[`${name}Left`].duration, motionFacts.clips[name].duration);
});

test('the motions that were downloaded are as they were', () => {
  assert.deepEqual(motionFacts.gaits, { walk: 1.844, run: 5.207, sprint: 7.273, strafeLeft: 2.775, strafeRight: 2.775, backpedal: 1.335 });
  const lengths = { idle: 9.9333, walk: 1.1667, run: 0.7333, sprint: 0.5333, jump: 0.4667, land: 0.1667, strafeLeft: 0.5333, strafeRight: 0.5333, backpedal: 1.2,
    dribble: 2.1, dribbleLeft: 2.1, stance: 2, gather: 0.3, hold: 2, holdLeft: 2, shoot: 0.3, follow: 0.5, freeThrow: 0.9, pass: 0.3333, catch: 0.3333, reach: 0.4,
    handUp: 1, contest: 0.4667, tip: 0.4667 };
  for (const [name, seconds] of Object.entries(lengths)) assert.equal(motionFacts.clips[name].duration, seconds, name);
});

test('a move made by hand moves the arms and the upper trunk only: the legs are left to the step he is taking, so his feet do not slide', () => {
  for (const name of ['crossover', 'betweenLegs', 'behindBack'].filter(byHand)) assert.notEqual(motionFacts.clips[`${name}Left`].whole, true, `nor is ${name}Left of the whole body`);
  for (const name of ['crossover', 'betweenLegs', 'behindBack', 'stepBack', 'fade'].filter(byHand)) for (const share of [0, 0.5, 1]) {
    assert.notEqual(motionFacts.clips[name].whole, true, `${name} is not of the whole body`);
    const p = posed(name, share);
    for (const bone of ['Hips', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot']) assert.ok(p[bone].distanceTo(still[bone]) < 0.002, `${name} at ${share}: ${bone}`);
  }
});

const DRIBBLES = ['crossover', 'betweenLegs', 'behindBack'].filter(byHand);

test('each dribble move takes the ball hand from low and wide on his right to low and wide on his left, and its twin the other way', () => {
  for (const name of DRIBBLES) {
    // Behind the back he stays upright, and the hand is a little above the hip; in the other two he is bent over it.
    const start = posed(name, 0), end = posed(name, 1), high = name === 'behindBack' ? 0.2 : 0.05;
    assert.ok(start.RightHand.x < -0.4 && start.RightHand.y < start.Hips.y + high, `${name} starts with the right hand at ${start.RightHand.x}, ${start.RightHand.y}`);   // his left is +x
    assert.ok(end.LeftHand.x > 0.4 && end.LeftHand.y < end.Hips.y + high, `${name} ends with the left hand at ${end.LeftHand.x}, ${end.LeftHand.y}`);
    const twinStart = posed(`${name}Left`, 0), twinEnd = posed(`${name}Left`, 1);
    assert.ok(Math.abs(twinStart.LeftHand.x + start.RightHand.x) < 0.03 && Math.abs(twinStart.LeftHand.y - start.RightHand.y) < 0.03, `${name}Left starts in a mirror`);
    assert.ok(Math.abs(twinEnd.RightHand.x + end.LeftHand.x) < 0.03 && Math.abs(twinEnd.RightHand.y - end.LeftHand.y) < 0.03, `${name}Left ends in a mirror`);
  }
});

test('a crossover swings the trunk from over the ball on one side, down through the middle, to over it on the other', () => {
  if (!byHand('crossover')) return;
  const start = posed('crossover', 0), mid = posed('crossover', 0.5), end = posed('crossover', 1);
  assert.ok(start.Head.x < -0.06 && Math.abs(mid.Head.x) < 0.02 && end.Head.x > 0.06, `the head goes ${start.Head.x}, ${mid.Head.x}, ${end.Head.x} across`);
  // Measured on legs that stand straight; in the game his legs are bent and lean, and he is lower still.
  assert.ok(mid.Head.y < start.Head.y - 0.02 && mid.Head.z > still.Head.z + 0.08, 'lowest and furthest over in the middle');
});

test('between the legs he is bent well over the ball, lowest as it goes under him', () => {
  if (!byHand('betweenLegs')) return;
  const start = posed('betweenLegs', 0), mid = posed('betweenLegs', 0.5), end = posed('betweenLegs', 1);
  // Measured on legs that stand straight; in the game his legs are bent and lean, and he is lower still.
  for (const p of [start, mid, end]) assert.ok(p.Head.z > still.Head.z + 0.08 && p.Head.y < still.Head.y - 0.05, `the head is ${p.Head.z - still.Head.z} m forward, ${still.Head.y - p.Head.y} m down`);
  assert.ok(mid.Head.y < start.Head.y - 0.02 && mid.Head.y < end.Head.y - 0.02, 'lowest in the middle');
  assert.ok(Math.abs(mid.LeftHand.x) < 0.3 && Math.abs(mid.RightHand.x) < 0.3, 'both hands in by the ball as it goes under');
});

test('behind the back the right hand goes back round the hip, then the left takes the ball there and brings it out', () => {
  if (!byHand('behindBack')) return;
  const wrap = posed('behindBack', 0.35), take = posed('behindBack', 0.7), end = posed('behindBack', 1);
  assert.ok(wrap.RightHand.z < wrap.Hips.z - 0.1, `the right hand is ${wrap.Hips.z - wrap.RightHand.z} m behind the hips`);
  assert.ok(take.LeftHand.z < take.Hips.z - 0.1, `the left hand is ${take.Hips.z - take.LeftHand.z} m behind the hips`);
  assert.ok(end.LeftHand.z > end.Hips.z + 0.1, 'and comes out in front again');
});

test('a fade ends at the set point with the trunk leaning back', () => {
  if (!byHand('fade')) return;
  const fade = posed('fade', 1), shot = posed('shoot', 1);
  assert.ok(fade.Head.z < shot.Head.z - 0.08, `the head is ${shot.Head.z - fade.Head.z} m further back`);
  assert.ok(fade.RightHand.y > fade.Head.y, 'the ball hand is above the head');
  assert.ok(fade.Hips.distanceTo(shot.Hips) < 0.002);
});
