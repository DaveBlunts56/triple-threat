// The measured clips as numbers (assets/source/tracked/), and the motions built from them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tracked = name => JSON.parse(readFileSync(`assets/source/tracked/${name}.json`, 'utf8'));
const length = v => Math.hypot(...v);
const LIMBS = ['leftThigh', 'leftShin', 'leftFoot', 'rightThigh', 'rightShin', 'rightFoot', 'leftUpperArm', 'leftForearm', 'rightUpperArm', 'rightForearm'];
const MOMENTS = {
  'dunk-one-foot': ['gather', 'step1', 'step2', 'deepest', 'takeoff', 'cocked', 'dunk', 'landing', 'settled'],
  'layup-finish': ['offFloor', 'rising', 'tucked', 'reaching', 'extended', 'release'],
};

test('each measured clip is its named moments in order, every limb a direction, and nothing but numbers', () => {
  for (const [name, moments] of Object.entries(MOMENTS)) {
    const clip = tracked(name);
    assert.deepEqual(clip.moments.map(m => m.name), moments, name);
    assert.ok(['left', 'right'].includes(clip.hand));
    let last = -1;
    for (const m of clip.moments) {
      assert.ok(m.at >= last, `${name} ${m.name} is out of order`); last = m.at;
      assert.deepEqual(Object.keys(m.limbs).sort(), [...LIMBS].sort());
      for (const v of [...Object.values(m.limbs), m.trunk, m.shoulders, m.hips]) assert.ok(Math.abs(length(v) - 1) < 1e-3, `${name} ${m.name}: a length of ${length(v)}`);
      for (const limb of LIMBS) assert.ok(m.seen[limb] >= 0 && m.seen[limb] <= 1);
    }
    assert.doesNotMatch(JSON.stringify(clip), /\.(mp4|png|jpg)|http/);
  }
});

test('the conversion keeps what the clip shows: the knee driven up and the plant leg down at the take-off, the arm back when cocked and forward at the dunk', () => {
  const at = Object.fromEntries(tracked('dunk-one-foot').moments.map(m => [m.name, m]));
  const [, thighUp, thighOut] = at.takeoff.limbs.rightThigh;
  assert.ok(thighOut > 0.7 && Math.abs(thighUp) < 0.5, `the right thigh points ${at.takeoff.limbs.rightThigh}`);
  assert.ok(at.takeoff.limbs.leftShin[1] < -0.8, `the left shin points ${at.takeoff.limbs.leftShin}`);
  assert.ok(at.takeoff.trunk[1] > 0.9, 'the trunk is not upright at the take-off');
  assert.ok(at.cocked.limbs.rightUpperArm[1] > 0.6 && at.cocked.limbs.rightUpperArm[2] < 0, `cocked, the right arm points ${at.cocked.limbs.rightUpperArm}`);
  assert.ok(at.dunk.limbs.rightUpperArm[2] > 0.5, `at the dunk the right arm points ${at.dunk.limbs.rightUpperArm}`);
  assert.ok(Math.abs(at.takeoff.at - 0.52) < 0.02 && Math.abs(at.dunk.at - at.takeoff.at - 0.62) < 0.03, 'the measured times');
});

// ---------- the motions built from them (assets/motion.glb) ----------

const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const data = readFileSync('assets/motion.glb');
const gltf = await new Promise((ok, bad) => new GLTFLoader().parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '', ok, bad));
const facts = JSON.parse(readFileSync('assets/motion.json', 'utf8'));
// Where the joints are with motion `name` held at `share`: the model stands at the origin facing +z, his left toward +x,
// which are the body's own axes of the measured clips.
function posed(name, share) {
  const mixer = new THREE.AnimationMixer(gltf.scene), clip = gltf.animations.find(c => c.name === name);
  assert.ok(clip, `no ${name}`);
  const action = mixer.clipAction(clip).play();
  action.timeScale = 0; action.time = share * clip.duration;
  mixer.update(0);
  gltf.scene.updateMatrixWorld(true);
  // Read now: stopping the mixer puts every bone back where it rests.
  const places = new Map();
  gltf.scene.traverse(o => { if (o.isBone) places.set(o.name, o.getWorldPosition(new THREE.Vector3())); });
  mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  return bone => places.get(`mixamorig${bone}`).clone();
}
// bone at the limb's near end, bone at its far end
const JOINTS = { leftThigh: ['LeftUpLeg', 'LeftLeg'], leftShin: ['LeftLeg', 'LeftFoot'], rightThigh: ['RightUpLeg', 'RightLeg'], rightShin: ['RightLeg', 'RightFoot'],
  leftUpperArm: ['LeftArm', 'LeftForeArm'], leftForearm: ['LeftForeArm', 'LeftHand'], rightUpperArm: ['RightArm', 'RightForeArm'], rightForearm: ['RightForeArm', 'RightHand'] };
const degrees = (a, b) => (Math.acos(Math.max(-1, Math.min(1, a.clone().normalize().dot(b.clone().normalize()))) ) * 180) / Math.PI;

test('the gather, the dunk and the layup are in the file with their twins: of the whole body, made from the measured clips', () => {
  const lengths = { finishGather: 0.5, dunk: 0.86, layup: 0.65 };
  for (const [name, seconds] of Object.entries(lengths)) for (const made of [name, `${name}Left`]) {
    const clip = facts.clips[made];
    assert.ok(clip, made);
    assert.deepEqual([clip.from, clip.whole, clip.kind], ['tracked', true, 'held'], made);
    assert.ok(Math.abs(clip.duration - seconds) < 0.02, `${made} lasts ${clip.duration}`);
  }
});

test('at each measured moment the built pose lies along what was measured, limb by limb', () => {
  const dunk = Object.fromEntries(tracked('dunk-one-foot').moments.map(m => [m.name, m]));
  const keys = [['finishGather', 0, 'gather'], ['finishGather', 0.33, 'step1'], ['finishGather', 0.69, 'step2'], ['finishGather', 0.81, 'deepest'], ['finishGather', 1, 'takeoff'],
    ['dunk', 0, 'takeoff'], ['dunk', 0.36, 'cocked'], ['dunk', 0.69, 'dunk'], ['dunk', 1, 'landing'], ['layup', 0, 'takeoff']];
  for (const [motion, share, moment] of keys) {
    const at = posed(motion, share);
    for (const [limb, [from, to]] of Object.entries(JOINTS)) {
      const off = degrees(at(to).sub(at(from)), new THREE.Vector3(...dunk[moment].limbs[limb]));
      assert.ok(off < 20, `${motion} at ${share} (${moment}): ${limb} is ${off.toFixed(0)} degrees off`);
    }
    const trunk = degrees(at('Neck').sub(at('Hips')), new THREE.Vector3(...dunk[moment].trunk));
    assert.ok(trunk < 20, `${motion} at ${share}: the trunk is ${trunk.toFixed(0)} degrees off`);
  }
});

test('the ball hand is above the head at the dunk and at the layup\'s release, and the twin is the same in a mirror', () => {
  for (const [motion, share] of [['dunk', 0.69], ['layup', 0.62]]) {
    const at = posed(motion, share), twin = posed(`${motion}Left`, share);
    assert.ok(at('RightHand').y > at('Head').y, `${motion}: the right hand is ${at('RightHand').y - at('Head').y} m above the head`);
    assert.ok(at('RightHand').z > at('Hips').z, `${motion}: the hand is behind the hips`);
    assert.ok(Math.abs(twin('LeftHand').x + at('RightHand').x) < 0.03 && Math.abs(twin('LeftHand').y - at('RightHand').y) < 0.03, `${motion}Left is not ${motion} in a mirror`);
  }
});

test('through the gather a toe is on the floor, and he leaves it from his left foot with the right knee driven up', () => {
  const floor = posed('stance', 0)('LeftToeBase').y;
  for (const share of [0, 0.2, 0.33, 0.5, 0.69, 0.81, 1]) {
    const at = posed('finishGather', share), lowest = Math.min(at('LeftToeBase').y, at('RightToeBase').y);
    assert.ok(Math.abs(lowest - floor) < 0.03, `at ${share} the lower toe is ${lowest - floor} m off the floor`);
  }
  const off = posed('finishGather', 1);
  assert.ok(off('LeftToeBase').y < off('RightToeBase').y - 0.2, 'the left foot is not the one on the floor at the take-off');
  assert.ok(off('RightLeg').y > off('LeftLeg').y + 0.15 && off('RightLeg').z > off('Hips').z + 0.2, 'the right knee is not up in front');
});
