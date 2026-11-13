import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legMotion, fade, checkGaits, AIR_TIME, MOTION, personName, courtPeople, keepTrack, sized, missingPeople } from '../src/render/motion.js';
import { createMatch } from '../src/sim/state.js';
import { substitute } from '../src/sim/roster.js';
import { ROSTER } from '../src/sim/tuning.js';

const gaits = { walk: 1.5, run: 4, sprint: 6.5, strafeLeft: 1.5, strafeRight: 1.5, backpedal: 1.3 };
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

const resting = () => ({ idle: 1, walk: 0, run: 0, sprint: 0, jump: 0 });
const total = weights => Object.values(weights).reduce((sum, w) => sum + w, 0);

test('a cross-fade always adds up to one whole pose, even when the motion changes again mid-fade', () => {
  const weights = resting();
  // A start (idle, a moment of walk, then run), a stop and a jump, each cut short by the next: a fifth of a fade per frame.
  for (const clip of ['walk', 'run', 'run', 'walk', 'idle', 'jump', 'run', 'run', 'run', 'run', 'run', 'run']) {
    fade(weights, clip, 0.2);
    assert.ok(Math.abs(total(weights) - 1) < 1e-9, `fading to ${clip}: the weights add up to ${total(weights)}`);
    assert.ok(Object.values(weights).every(w => w >= 0 && w <= 1), JSON.stringify(weights));
  }
  assert.deepEqual(weights, { idle: 0, walk: 0, run: 1, sprint: 0, jump: 0 });
});

test('a cross-fade takes one whole fade to finish, and the old motion fades out evenly', () => {
  const weights = resting();
  fade(weights, 'run', 0.25);
  assert.deepEqual(weights, { idle: 0.75, walk: 0, run: 0.25, sprint: 0, jump: 0 });
  for (let i = 0; i < 3; i++) fade(weights, 'run', 0.25);
  assert.deepEqual(weights, { idle: 0, walk: 0, run: 1, sprint: 0, jump: 0 });
  assert.deepEqual(fade(resting(), 'idle', 0), resting());   // no time passed (paused): nothing moves
});

test('motion facts without a speed for every gait are refused, so the game falls back to capsules', () => {
  assert.doesNotThrow(() => checkGaits({ gaits }));
  for (const broken of [undefined, {}, { gaits: {} }, { gaits: { walk: 1.5, run: 4 } }, { gaits: { ...gaits, sprint: 0 } }, { gaits: { ...gaits, walk: 'fast' } }, { gaits: { ...gaits, backpedal: undefined } }]) {
    assert.throws(() => checkGaits(broken), /motion\.json/, JSON.stringify(broken));
  }
});

test('each court player is drawn with the model of the person in that slot, also after a substitution', () => {
  const s = createMatch(1);
  assert.deepEqual(courtPeople(s), ['player-0-4', 'player-0-7', 'player-0-11', 'player-1-5', 'player-1-8', 'player-1-10']);
  substitute(s, 1, 4);
  assert.equal(courtPeople(s)[1], 'player-0-23');
});

test('a motion keeps every turn and the position of the hips, and nothing else', () => {
  assert.deepEqual(['mixamorigHips.position', 'mixamorigLeftArm.quaternion', 'mixamorigLeftArm.position', 'mixamorigHips.scale'].map(keepTrack), [true, true, false, false]);
});

test('a taller player strides further: his gait speeds grow with him', () => {
  assert.deepEqual(sized({ walk: 2, run: 5, sprint: 7 }, 1.1), { walk: 2.2, run: 5.5, sprint: 7.7 });
});

test('a player file that lacks someone on a roster is noticed', () => {
  const all = [0, 1].flatMap(team => ROSTER.numbers[team].map(number => personName(team, number)));
  assert.deepEqual(missingPeople(all), []);
  assert.deepEqual(missingPeople(all.filter(name => name !== 'player-1-33')), ['player-1-33']);
});
