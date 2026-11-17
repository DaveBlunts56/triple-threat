import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legMotion, MOTION } from '../src/render/motion.js';
import { checkGaits, checkFacts, personName, courtPeople, keepTrack, sized, missingPeople } from '../src/render/checks.js';
import { createMatch } from '../src/sim/state.js';
import { substitute } from '../src/sim/roster.js';
import { BALL, PLAYER, ROSTER } from '../src/sim/tuning.js';

// Seconds from leaving the floor to landing, for a full jump.
const AIR_TIME = (2 * PLAYER.jumpV) / BALL.gravity;

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

test('motion facts without a speed for every gait are refused, so the game falls back to capsules', () => {
  assert.doesNotThrow(() => checkGaits({ gaits }));
  for (const broken of [undefined, {}, { gaits: {} }, { gaits: { walk: 1.5, run: 4 } }, { gaits: { ...gaits, sprint: 0 } }, { gaits: { ...gaits, walk: 'fast' } }, { gaits: { ...gaits, backpedal: undefined } }]) {
    assert.throws(() => checkGaits(broken), /motion\.json/, JSON.stringify(broken));
  }
});

test('motion facts without a length for every motion, the dribble\'s push and bounces or a stride\'s foot strikes are refused', () => {
  const real = JSON.parse(readFileSync('assets/motion.json', 'utf8'));
  const without = change => { const copy = structuredClone(real); change(copy.clips); return copy; };
  assert.doesNotThrow(() => checkFacts(real));
  assert.throws(() => checkFacts(without(c => delete c.pass)), /motion\.json.*"pass"/);                 // armMotion reads these four every frame
  assert.throws(() => checkFacts(without(c => delete c.follow.duration)), /motion\.json.*"follow"/);
  assert.throws(() => checkFacts(without(c => { c.freeThrow.duration = 0; })), /"freeThrow"/);
  assert.throws(() => checkFacts(without(c => { c.reach.duration = null; })), /"reach"/);
  assert.throws(() => checkFacts(without(c => delete c.dribble.push)), /motion\.json.*dribble/);        // and the animator these
  assert.throws(() => checkFacts(without(c => { c.dribble.bounces = 0; })), /dribble/);
  assert.throws(() => checkFacts(without(c => delete c.run.strike)), /motion\.json.*"run"/);
  assert.throws(() => checkFacts(without(c => delete c.sprint.strike.left)), /"sprint"/);
  for (const broken of [undefined, {}, { clips: {} }]) assert.throws(() => checkFacts(broken), /motion\.json/);
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

test('in a paced style (Simulation) a walk may slow further, so the feet keep to the ground as he starts, stops and shuffles; Arcade\'s floor is as it was', () => {
  const at = (speed, look) => legMotion({ ...still, vx: speed }, gaits, 'walk', look).rate;
  assert.equal(at(0.5, null), MOTION.minRate);
  assert.ok(Math.abs(at(0.5, { paced: true }) - Math.max(MOTION.paced.minRate, 0.5 / gaits.walk)) < 1e-9 && MOTION.paced.minRate < MOTION.minRate);
  assert.ok(Math.abs(at(1.2, { paced: true }) - 1.2 / gaits.walk) < 1e-9, 'above both floors, the same');
  assert.ok(MOTION.paced.minRateStep < MOTION.minRateStep);
});
