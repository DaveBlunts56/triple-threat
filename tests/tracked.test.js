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
