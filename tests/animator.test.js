// The real mixer, in Node, on the real motion file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAnimator } from '../src/render/animator.js';
import { LEG_CLIPS, ARM_CLIPS, MOTION, crossFade, layerOf, outOfStep, stridePhase, wholeBody } from '../src/render/motion.js';
import { checkMotions } from '../src/render/checks.js';

const data = readFileSync('assets/motion.glb');
const gltf = await new Promise((ok, bad) => new GLTFLoader().parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '', ok, bad));
const facts = JSON.parse(readFileSync('assets/motion.json', 'utf8'));
const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
const fresh = (index = 0) => createAnimator(gltf.scene, clips, facts, 1, index);
const whole = layer => Math.abs(Object.values(layer).reduce((sum, w) => sum + w, 0) - 1) < 1e-9;
const FRAME = 1 / 60, run = { clip: 'run', rate: 1 }, idle = { clip: 'idle', rate: 1 };
const frames = (a, n, legs, arms, head) => { for (let i = 0; i < n; i++) a.update(legs, arms, FRAME, head); };
const bone = name => gltf.scene.getObjectByName(name);
const facing = name => { gltf.scene.updateMatrixWorld(true); return new THREE.Vector3(0, 0, 1).applyQuaternion(bone(name).getWorldQuaternion(new THREE.Quaternion())); };

test('both layers stay one whole pose through a start, a dribble, a pass, a catch, a gather, a shot, a landing and a stop', () => {
  const a = fresh();
  const script = [[{ clip: 'walk', rate: 1 }, null], [run, { clip: 'dribble', rate: 1 }], [run, { clip: 'pass', at: 0.2 }], [run, { clip: 'catch', at: 0.5 }],
    [{ clip: 'gather', at: 0.5 }, { clip: 'shoot', at: 0.5 }], [{ clip: 'jump', at: 0.3 }, { clip: 'shoot', at: 1 }], [{ clip: 'jump', at: 0.6 }, { clip: 'follow', at: 0.4 }],
    [{ clip: 'land', at: 0.5 }, { clip: 'follow', at: 0.8 }], [{ clip: 'stance', rate: 1 }, { clip: 'handUp', rate: 1 }], [idle, null]];
  for (const [legs, arms] of script) for (let i = 0; i < 3; i++) {        // three frames each: every fade is cut short
    a.update(legs, arms, FRAME);
    assert.ok(whole(a.weights.legs) && whole(a.weights.arms), JSON.stringify(a.weights));
  }
});

test('every motion the two tables name has its place on a layer', () => {
  const a = fresh();
  // The legs play their own motions and those of the whole body: the dribble moves, made by hand or downloaded.
  const whole = ARM_CLIPS.filter(name => wholeBody(facts.clips, name));
  assert.deepEqual(whole.filter(name => facts.clips[name].from === 'hand').sort(), ['behindBack', 'behindBackLeft', 'crossover', 'crossoverLeft']);
  assert.deepEqual(Object.keys(a.weights.legs).sort(), [...LEG_CLIPS, ...whole].sort());
  assert.deepEqual(Object.keys(a.weights.arms).sort(), [...LEG_CLIPS, ...ARM_CLIPS].sort());
});

test('with nothing for the arms to do they follow the legs', () => {
  const a = fresh();
  frames(a, 30, run, null);
  assert.deepEqual([a.weights.legs.run, a.weights.arms.run], [1, 1]);
});

test('a person who has just come on starts from a whole idle pose, also when he has been on before', () => {
  const a = fresh();
  assert.deepEqual([a.weights.legs.idle, a.weights.arms.idle], [1, 1]);
  frames(a, 4, run, { clip: 'dribble', rate: 1 });                        // substituted off in the middle of a fade
  a.reset();
  assert.deepEqual([a.weights.legs.idle, a.weights.arms.idle, whole(a.weights.legs), whole(a.weights.arms)], [1, 1, true, true]);
});

test('a ball handler keeps the lean of his run: the lower spine follows the legs whatever the arms do', () => {
  const a = fresh(), b = fresh();
  frames(a, 30, run, null);
  const leaning = bone('mixamorigSpine').quaternion.clone();
  frames(b, 30, run, { clip: 'hold', rate: 1 });
  assert.ok(Math.abs(bone('mixamorigSpine').quaternion.dot(leaning)) > 0.9999, 'the lower spine left the run');
});

test('a one-off move is fully shown within 0.07 s and is gone 0.22 s after it ends', () => {
  const a = fresh();
  frames(a, 30, idle, { clip: 'dribble', rate: 1 });
  frames(a, 5, idle, { clip: 'pass', at: 0.1 });                          // 0.083 s
  assert.ok(Math.abs(a.weights.arms.pass - 1) < 1e-9);
  frames(a, 12, idle, null);                                              // 0.2 s later
  assert.ok(a.weights.arms.pass > 0.05 && a.weights.arms.pass < 0.15, `${a.weights.arms.pass}`);
  frames(a, 2, idle, null);
  assert.equal(a.weights.arms.pass, 0);
});

test('from one gait to the next the legs carry on from the same point of the stride', () => {
  const a = fresh();
  frames(a, 20, run, null);
  const before = a.phase('run');
  a.update({ clip: 'sprint', rate: 1 }, null, FRAME);
  const gap = Math.abs(a.phase('sprint') - before);
  assert.ok(Math.min(gap, 1 - gap) < 0.05, `run at ${before}, sprint starts at ${a.phase('sprint')}`);
});

test('at a run the dribble is tied to the stride: the push comes as the same-side foot lands', () => {
  const a = fresh(), { push, bounces } = facts.clips.dribble, strike = facts.clips.run.strike.right;
  for (let i = 0; i < 40; i++) {
    a.update(run, { clip: 'dribble', rate: 1 }, FRAME);
    const want = (((push + (a.phase('run') - strike) / bounces) % 1) + 1) % 1, gap = Math.abs(a.phase('dribble') - want);
    assert.ok(Math.min(gap, 1 - gap) < 0.06, `frame ${i}: dribble at ${a.phase('dribble')}, stride wants ${want}`);
  }
});

test('no two people idle in step', () => {
  const a = fresh(0), first = a.phase('idle');
  const b = fresh(3);
  assert.ok(Math.abs(b.phase('idle') - first) > 0.05);
});

test('the arm that does not dribble follows the legs: only the hand with the ball leaves their motion', () => {
  const turn = name => bone(`mixamorig${name}`).quaternion.clone(), same = (q, name) => Math.abs(bone(`mixamorig${name}`).quaternion.dot(q)) > 0.9999;
  frames(fresh(), 30, run, null);
  const running = { left: turn('LeftArm'), right: turn('RightArm'), finger: turn('LeftHandIndex1'), head: turn('Head') };
  frames(fresh(), 30, run, { clip: 'dribble', rate: 1 });
  assert.ok(same(running.left, 'LeftArm') && same(running.finger, 'LeftHandIndex1'), 'the left arm left the run');
  assert.ok(!same(running.right, 'RightArm') && !same(running.head, 'Head'), 'the right arm and the head do not dribble');
  const c = fresh();
  frames(c, 30, run, { clip: 'dribbleLeft', rate: 1 });
  assert.ok(same(running.right, 'RightArm') && !same(running.left, 'LeftArm'), 'dribbleLeft is not dribble in a mirror');
  for (let i = 0; i < 12; i++) {                                           // a change of hand and of gait, each cut short
    c.update({ clip: i < 4 ? 'walk' : 'sprint', rate: 1 }, { clip: i % 5 ? 'dribble' : 'dribbleLeft', rate: 1 }, FRAME);
    assert.ok(whole(c.weights.legs) && whole(c.weights.arms), JSON.stringify(c.weights));
  }
});

test('a dribble that is showing when the run takes it over catches the stride up: the hand is never thrown to its place', () => {
  const { bounces } = facts.clips.dribble, strike = facts.clips.run.strike.right, dribble = { clip: 'dribble', rate: 1 };
  const round = gap => Math.abs(gap - Math.round(gap));                    // the way round the cycle that is shorter
  for (let lead = 20; lead < 150; lead += 7) {                             // he stands dribbling for a while, then runs
    const a = fresh();
    frames(a, lead, idle, dribble);
    let before = a.phase('dribble');
    for (let i = 0; i < 60; i++) {
      a.update(run, dribble, FRAME);
      assert.ok(round(a.phase('dribble') - before) < 0.02, `after ${lead} frames standing, frame ${i} of the run: from ${before} to ${a.phase('dribble')}`);
      before = a.phase('dribble');
    }
    const off = (a.phase('dribble') - facts.clips.dribble.push - (a.phase('run') - strike) / bounces) * bounces;   // in bounces
    assert.ok(round(off) < 0.02, `a second on, the push is ${round(off)} of a bounce from the foot's landing`);
  }
});

// ---- the plain logic the animator leans on ----

const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;

test('the lower spine goes with the legs; the upper spine, neck, head and arms are the arms layer', () => {
  assert.deepEqual(['mixamorigHips.position', 'mixamorigHips.quaternion', 'mixamorigLeftUpLeg.quaternion', 'mixamorigRightToeBase.quaternion', 'mixamorigSpine.quaternion',
    'mixamorigSpine1.quaternion', 'mixamorigSpine2.quaternion', 'mixamorigNeck.quaternion', 'mixamorigHead.quaternion', 'mixamorigLeftShoulder.quaternion', 'mixamorigRightHandIndex1.quaternion'].map(layerOf),
  ['legs', 'legs', 'legs', 'legs', 'legs', 'arms', 'arms', 'arms', 'arms', 'arms', 'arms']);
});

test('a motion file that lacks a motion the tables name is refused', () => {
  assert.doesNotThrow(() => checkMotions([...LEG_CLIPS, ...ARM_CLIPS]));
  assert.throws(() => checkMotions(LEG_CLIPS), /dribble/);
  assert.throws(() => checkMotions([...LEG_CLIPS, ...ARM_CLIPS].filter(name => name !== 'handUp')), /handUp/);
});

test('no two of the ten people idle in step', () => {
  const ten = Array.from({ length: 10 }, (_, i) => outOfStep(i));
  for (const { start, rate } of ten) assert.ok(start >= 0 && start < 1 && rate >= 0.92 && rate <= 1.08, `${start} ${rate}`);
  assert.equal(new Set(ten.map(o => o.start.toFixed(3))).size, 10);
  assert.equal(new Set(ten.map(o => o.rate.toFixed(3))).size, 10);
});

test('when the run carries the dribble, there is one bounce per stride and the push comes as that foot lands', () => {
  const d = { push: 0.25, bounces: 2 };
  assert.ok(near(stridePhase(0.3, 0.3, d), 0.25));                         // the foot lands: the ball leaves the hand
  assert.ok(near(stridePhase(0.8, 0.3, d), 0.5) && near(stridePhase(0.1, 0.3, d), 0.15));
  assert.ok(near(stridePhase(1.3, 0.3, d), 0.75));                         // a whole stride later: one bounce on (half of a two-bounce clip)
});

test('one-off moves fade in over 0.07 s and out over 0.22 s; everything else keeps 0.15 s; the shares always make one whole pose', () => {
  const w = { idle: 0, dribble: 1, pass: 0, run: 0 }, total = () => Object.values(w).reduce((sum, v) => sum + v, 0);
  crossFade(w, 'pass', 0.035);
  assert.ok(near(w.dribble, 0.5) && near(w.pass, 0.5));                   // half way in after half of 0.07 s
  crossFade(w, 'pass', 0.035);
  assert.ok(near(w.pass, 1) && near(w.dribble, 0));
  crossFade(w, 'dribble', 0.11);
  assert.ok(near(w.pass, 0.5) && near(w.dribble, 0.5));                   // half way out after half of 0.22 s
  crossFade(w, 'run', 0.03);
  assert.ok(near(w.pass, 0.5 - 0.03 / 0.22) && near(w.dribble, 0.3) && near(total(), 1));   // each leaves at its own pace
  crossFade(w, 'run', 0.2);
  assert.deepEqual(w, { idle: 0, dribble: 0, pass: 0, run: 1 });
  assert.deepEqual(crossFade({ idle: 0.4, run: 0.6 }, 'run', 0), { idle: 0.4, run: 0.6 });   // paused: nothing moves
});

test('a dribble move is shown at once: it comes in over 0.07 s, on the legs as on the arms', () => {
  for (const name of ['crossover', 'crossoverLeft', 'betweenLegs', 'betweenLegsLeft', 'behindBack', 'behindBackLeft']) {
    const w = crossFade({ run: 1, [name]: 0 }, name, 0.035);
    assert.ok(near(w[name], 0.5) && near(w.run, 0.5), name);
  }
});

test('a dribble move made by hand is played by the legs too: he drops low for it, and comes back up to run', () => {
  const a = fresh(), hips = () => { gltf.scene.updateMatrixWorld(true); return bone('mixamorigHips').getWorldPosition(new THREE.Vector3()).y; };
  frames(a, 30, idle, null);
  const stood = hips();
  for (const name of ['crossover', 'crossoverLeft', 'behindBack']) {
    assert.equal(facts.clips[name].whole, true, name);
    const move = { clip: name, at: 0.5 };
    frames(a, 6, move, move);                                             // 0.1 s: fully in
    assert.ok(near(a.weights.legs[name], 1) && near(a.weights.arms[name], 1), name);
    assert.ok(hips() < stood - 0.12, `${name}: hips ${stood - hips()} m lower`);
    frames(a, 30, idle, null);
    assert.ok(Math.abs(hips() - stood) < 0.03, `${name}: back up`);
  }
});

test('between the legs is taken in the step he is in: the legs keep their gait, so his feet do not slide, and only the trunk and arms make the move', () => {
  const a = fresh(), move = { clip: 'betweenLegs', at: 0.5 };
  assert.equal(wholeBody(facts.clips, 'betweenLegs'), false);
  frames(a, 30, run, null);
  frames(a, 12, run, move);
  assert.deepEqual([a.weights.legs.run, a.weights.arms.betweenLegs], [1, 1]);
  assert.equal('betweenLegs' in a.weights.legs, false);
});

test('the head turns toward what it is given: right for a positive yaw, up for a positive pitch, and the middle of the spine stays out of it', () => {
  const plain = fresh();
  frames(plain, 6, idle, null);
  const ahead = facing('mixamorigHead'), chest = facing('mixamorigSpine1');
  const turned = fresh();
  frames(turned, 5, idle, null); frames(turned, 1, idle, null, { yaw: 1, pitch: 0 });
  assert.ok(facing('mixamorigHead').x < ahead.x - 0.5, 'the head did not turn to its right');      // the model faces +z; its right is -x
  assert.ok(facing('mixamorigSpine1').distanceTo(chest) < 1e-6, 'the turn reached below the upper spine');
  const raised = fresh();
  frames(raised, 5, idle, null); frames(raised, 1, idle, null, { yaw: 0, pitch: 0.5 });
  assert.ok(facing('mixamorigHead').y > ahead.y + 0.3, 'the head did not tip up');
});

// ---- the chest, and a head that looks where it is told (additions to the brief) ----

const where = name => { gltf.scene.updateMatrixWorld(true); return bone(name).getWorldPosition(new THREE.Vector3()); };

// The hand is measured from his hips: walking legs carry the hips 0.13 m higher than running legs, whatever the chest does.
test('a dribble on walking legs bends the chest to it: the hand works about as low as on running legs', () => {
  const dribble = { clip: 'dribble', rate: 1 }, cycle = Math.round(facts.clips.dribble.duration / FRAME);
  const span = legs => {
    const a = fresh(), ys = [];
    frames(a, 30, legs, dribble);
    for (let i = 0; i < cycle; i++) { a.update(legs, dribble, FRAME); ys.push(where('mixamorigRightHand').y - where('mixamorigHips').y); }
    return { top: Math.max(...ys), bottom: Math.min(...ys) };
  };
  const walking = span({ clip: 'walk', rate: 1 }), running = span(run);
  assert.ok(Math.abs(walking.top - running.top) < 0.05 && Math.abs(walking.bottom - running.bottom) < 0.05, JSON.stringify({ walking, running }));
});

test('while the arms follow the legs the upper spine is the motion\'s own, whatever the head is told', () => {
  const a = fresh(), own = clips.run.tracks.find(track => track.name === 'mixamorigSpine1.quaternion').createInterpolant();
  frames(a, 20, run, null);
  for (let i = 0; i < 30; i++) {
    a.update(run, null, FRAME, { yaw: 0.6, pitch: -0.3 });
    const motion = new THREE.Quaternion().fromArray(own.evaluate(a.phase('run') * clips.run.duration)).normalize();   // as the mixer does
    assert.ok(Math.abs(bone('mixamorigSpine1').quaternion.dot(motion)) > 1 - 1e-9, `frame ${i}`);
  }
});

test('a head told to look level and ahead does, on running legs that lean into a catch', () => {
  const a = fresh(), level = { yaw: 0, pitch: 0 }, catching = { clip: 'catch', at: 0.6 }, ahead = new THREE.Vector3(0, 0, 1);
  frames(a, 20, run, catching, level);
  for (let i = 0; i < 30; i++) {
    a.update(run, catching, FRAME, level);
    const off = (facing('mixamorigHead').angleTo(ahead) * 180) / Math.PI;
    assert.ok(off < 3, `frame ${i}: the head looks ${off.toFixed(1)} degrees away`);
  }
});

test('nothing done after the motions builds up: arms held still on running legs keep the chest where it is asked, and a head no longer told is the motion\'s again', () => {
  const catching = { clip: 'catch', at: 0.6 };
  const lean = () => { const line = where('mixamorigNeck').sub(where('mixamorigSpine1')); return (Math.atan2(line.z, line.y) * 180) / Math.PI; };
  const a = fresh();
  frames(a, 10, run, catching);
  for (let i = 0; i < 50; i++) {                                           // the run leans the chest 33 to 41 degrees under a catch
    a.update(run, catching, FRAME);
    assert.ok(Math.abs(lean() - MOTION.chestMade) < 0.01, `frame ${i}: the chest leans ${lean().toFixed(2)} degrees`);
  }
  frames(fresh(), 30, run, catching);
  const own = bone('mixamorigHead').quaternion.clone();
  const b = fresh();
  frames(b, 29, run, catching, { yaw: 1, pitch: 0 }); frames(b, 1, run, catching, null);
  assert.ok(Math.abs(bone('mixamorigHead').quaternion.dot(own)) > 1 - 1e-9, 'the head stayed turned');
});
