import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { newFreeThrow, setupFreeThrow } from '../src/sim/freethrow.js';
import { createLife, stepLife, LIFE, refSpots, signFor, armsFor, REFS, ADS, AD, adAt } from '../src/render/life.js';
import { CLOCK, COURT, DT } from '../src/sim/tuning.js';
import { live } from './helpers.js';

test('a team\'s fans are on their feet after it scores, longer for a three, and the photographers\' flashes go off', () => {
  const s = live(1, 5), life = createLife();
  stepLife(life, s, DT);
  assert.deepEqual([life.cheer, life.flashes], [[0, 0], 0]);
  s.score[0] += 2; stepLife(life, s, DT);
  assert.ok(Math.abs(life.cheer[0] - (LIFE.cheer - DT)) < 1e-9 && life.cheer[1] === 0 && life.flashes === LIFE.flashes);
  s.score[1] += 3; stepLife(life, s, DT);
  assert.ok(life.cheer[1] > LIFE.cheer, 'a three is cheered longer');
  for (let t = 0; t < LIFE.cheerThree + 0.1; t += DT) stepLife(life, s, DT);
  assert.deepEqual(life.cheer, [0, 0]);
});

test('the home crowd boos a foul called on its team, cheers one on the visitors, and says nothing of a violation', () => {
  const call = (kind, team) => ({ kind, team, ball: 1 - team, number: null, shots: 0 });
  const mood = c => { const s = live(1, 5), life = createLife(); stepLife(life, s, DT); s.call = c; stepLife(life, s, DT); return life; };
  assert.ok(Math.abs(mood(call('block', 0)).boo - (LIFE.boo - DT)) < 1e-9);
  assert.deepEqual([mood(call('block', 1)).boo, mood(call('block', 1)).cheer[0] > 0], [0, true]);
  assert.deepEqual([mood(call('travel', 0)).boo, mood(call('out', 0)).boo], [0, 0]);
  const once = mood(call('reach', 0));
  for (let t = 0; t < LIFE.boo + 0.1; t += DT) stepLife(once, { ...live(1, 5), call: once.seen.call }, DT);
  assert.equal(once.boo, 0, 'the same call is booed once');
});

test('a visitor at the free-throw line is put off by the fans behind that hoop and the picture shakes; a home shooter is left alone', () => {
  const at = shooter => { const s = live(1, 5), life = createLife(); s.freeThrow = newFreeThrow(shooter, 2); setupFreeThrow(s); return stepLife(life, s, DT); };
  assert.deepEqual([at(5).distract, at(5).shake], [-1, LIFE.shake]);   // the visitors shoot at the hoop at -x
  assert.deepEqual([at(0).distract, at(0).shake], [0, 0]);
  const live5 = stepLife(createLife(), live(1, 5), DT);
  assert.deepEqual([live5.distract, live5.shake], [0, 0]);
});

test('in a blowout in the last period fans drift out, a few at a time, more when the home team is beaten, and nobody comes back', () => {
  const s = live(1, 5), life = createLife();
  s.quarter = CLOCK.quarters; s.gameClock = 60; s.score = [20, 60];
  stepLife(life, s, 1);
  assert.ok(life.left > 0 && life.left <= LIFE.leaveRate + 1e-9, `${life.left}`);
  for (let i = 0; i < 600; i++) stepLife(life, s, 1);
  const gone = life.left;
  assert.ok(gone > 0.3 && gone <= LIFE.leaveMost);
  s.score = [58, 60]; stepLife(life, s, 1);
  assert.equal(life.left, gone, 'they came back');
  const winning = createLife(); s.score = [60, 20];
  for (let i = 0; i < 600; i++) stepLife(winning, s, 1);
  assert.ok(winning.left < gone, 'as many leave a home win');
  const early = createLife(); s.quarter = 2;
  for (let i = 0; i < 100; i++) stepLife(early, s, 1);
  assert.equal(early.left, 0, 'they left before the last period');
  s.phase = 'start'; stepLife(life, s, 1);
  assert.equal(life.left, 0, 'the house is not full again for a new match');
});

test('the referees: one on the baseline play goes toward, one behind the ball on the near side, one on the far side; all outside the lines; at the tip one is at the centre', () => {
  const s = live(1, 5);
  Object.assign(s.ball, { x: 6, z: 3 });
  const [lead, trail, centre] = refSpots(s);
  assert.ok(lead.x > COURT.halfLength && lead.z >= 3 && lead.z <= 6.5);
  assert.ok(trail.z > COURT.halfWidth && trail.x < 6 && centre.z < -COURT.halfWidth);
  s.possession = 1; Object.assign(s.ball, { x: -6, z: -3 });
  const [lead2, trail2] = refSpots(s);
  assert.ok(lead2.x < -COURT.halfLength && lead2.z <= -3 && trail2.x > -6);
  s.phase = 'jumpBall';
  assert.ok(Math.hypot(refSpots(s)[0].x, refSpots(s)[0].z) < 1.8, 'nobody is at the centre for the tip');
});

test('every call has a sign: an arm goes up first, a fist for a foul, then the call\'s own sign; a made three is two arms up', () => {
  const kinds = ['reach', 'block', 'shooting', 'charge', 'travel', 'doubleDribble', 'threeSeconds', 'fiveSeconds', 'eightSeconds', 'backcourt', 'shotClock', 'out', 'timeout'];
  const seen = new Set();
  for (const kind of kinds) {
    const name = signFor({ kind });
    assert.ok(name, kind);
    const first = armsFor(name, 0.2), then = armsFor(name, REFS.raise + 0.4);
    assert.equal(first.right.lift, Math.PI, `${kind}: the arm is not up first`);
    assert.equal(first.fist, ['reach', 'block', 'shooting', 'charge'].includes(kind), kind);
    for (const arm of [then.right, then.left]) for (const angle of [arm.lift, arm.out, arm.bend]) assert.ok(Number.isFinite(angle) && Math.abs(angle) <= Math.PI + 1e-9, kind);
    seen.add(JSON.stringify([then.right, then.left].map(arm => [arm.lift, arm.out, arm.bend].map(a => Math.round(a * 10)))));
  }
  assert.ok(seen.size >= kinds.length - 1, `only ${seen.size} different signs for ${kinds.length} calls`);   // 5 seconds and the raise share a pose
  assert.equal(signFor(null), null);
  assert.equal(signFor({ kind: 'nothing' }), null);
  const three = armsFor('madeThree', 0.1);
  assert.deepEqual([three.right.lift, three.left.lift], [Math.PI, Math.PI]);
  assert.notDeepEqual(armsFor('out', 2, 1).right, armsFor('out', 2, -1).right, 'out of bounds points one way only');
  assert.equal(armsFor(null, 1).right.lift, 0);
});

test('the boards show invented advertisements, Sugar-Soda among them, each board changing in turn and no two neighbours alike', () => {
  assert.ok(ADS.some(ad => ad.words === 'SUGAR-SODA!'));
  assert.ok(ADS.length >= 6);
  for (let board = 0; board < 12; board++) {
    assert.notEqual(adAt(board, 0), adAt(board + 1, 0));
    assert.notEqual(adAt(board, 0), adAt(board, AD.every));
    assert.equal(adAt(board, 1), adAt(board, AD.every - 1));
  }
});

// ---------- how a referee moves ----------

test('a referee gathers speed, never runs faster than he can, eases into his spot and stands there', async () => {
  const { createRef, stepRef } = await import('../src/render/life.js');
  const ref = createRef(0, 8), spot = { x: 12, z: 8 }, ball = { x: 6, z: 0 };
  let last = 0, top = 0;
  for (let i = 0; i < 60 * 6; i++) {
    stepRef(ref, spot, ball, DT);
    const speed = Math.hypot(ref.vx, ref.vz);
    assert.ok(Math.abs(speed - last) <= REFS.accel * DT + 1e-9, `his speed jumped from ${last} to ${speed}`);
    assert.ok(ref.x <= spot.x + 0.05, `he ran past his spot to ${ref.x}`);
    top = Math.max(top, speed); last = speed;
  }
  assert.ok(top > 4 && top <= REFS.run + 1e-9, `his top speed was ${top}`);
  assert.ok(Math.hypot(ref.x - spot.x, ref.z - spot.z) <= REFS.near + 0.05 && last < 0.05, `he ended at ${ref.x}, ${ref.z} moving at ${last}`);
});

test('he moves the same however often the picture is drawn, and a frame in which no time passes changes nothing', async () => {
  const { createRef, stepRef, refGait } = await import('../src/render/life.js');
  const run = hz => { const ref = createRef(0, 8); for (let i = 0; i < hz * 1.5; i++) stepRef(ref, { x: 12, z: 8 }, { x: 6, z: 0 }, 1 / hz); return ref; };
  const slow = run(60), fast = run(180);
  assert.ok(Math.abs(slow.x - fast.x) < 0.15 && Math.abs(slow.stride - fast.stride) < 0.5, `${slow.x} at 60 a second, ${fast.x} at 180`);
  const before = JSON.stringify([slow, refGait(slow)]);
  stepRef(slow, { x: 12, z: 8 }, { x: 6, z: 0 }, 0);
  assert.equal(JSON.stringify([slow, refGait(slow)]), before, 'his legs moved in a frame with no time in it');
});

test('his stride goes with the ground he covers; running he faces the way he goes, standing he watches the ball; he turns no faster than a man can', async () => {
  const { createRef, stepRef, refGait } = await import('../src/render/life.js');
  const ref = createRef(0, 8), spot = { x: 12, z: 8 }, ball = { x: 0, z: 0 };
  assert.deepEqual([refGait(ref).legR.swing, refGait(ref).dip], [0, 0]);
  let turned = 0, strides = 0, biggest = 0;
  for (let i = 0; i < 60 * 1.5; i++) {
    const [facing, stride] = [ref.facing, ref.stride];
    stepRef(ref, spot, ball, DT);
    turned = Math.max(turned, Math.abs(ref.facing - facing)); strides += ref.stride - stride;
    biggest = Math.max(biggest, Math.abs(refGait(ref).legR.swing));
  }
  assert.ok(turned <= REFS.turn * DT + 1e-9);
  assert.ok(Math.abs(ref.facing - Math.PI / 2) < 0.1, `running toward +x he faces ${ref.facing}`);
  const steps = strides / Math.PI;
  assert.ok(ref.x / steps >= REFS.step[0] - 0.01 && ref.x / steps <= REFS.step[1] + 0.01, `${steps} steps in ${ref.x} m`);
  assert.ok(biggest > 0.5, 'his legs hardly swung');
  assert.ok(Math.abs(refGait(ref).legR.swing + refGait(ref).legL.swing) < 1e-9, 'his legs do not swing against each other');
  const stood = createRef(0, 8);
  for (let i = 0; i < 60; i++) stepRef(stood, { x: 0, z: 8 }, { x: 0, z: 0 }, DT);
  assert.ok(Math.abs(Math.abs(stood.facing) - Math.PI) < 0.05, `standing on the near side he faces ${stood.facing}, not the ball`);
  const still = createRef(0, 8);
  for (let i = 0; i < 60; i++) stepRef(still, spot, ball, DT, true);
  assert.equal(still.x, 0, 'he walked off while making a sign');
});

test('the lead referee changes sides of the hoop only when the ball has gone well past the middle', async () => {
  const { leadSideOf } = await import('../src/render/life.js');
  assert.deepEqual([leadSideOf(1, { z: 0.5 }), leadSideOf(1, { z: -1 }), leadSideOf(1, { z: -2 }), leadSideOf(-1, { z: 1 }), leadSideOf(-1, { z: 2 })], [1, 1, -1, -1, 1]);
  const s = live(1, 5); Object.assign(s.ball, { x: 6, z: -1 });
  assert.ok(refSpots(s, 1)[0].z > 0 && refSpots(s, -1)[0].z < 0);
});

// ---------- big moments ----------

test('a big moment for the home team brings the home crowd to its feet as a three does; one for the visitors makes it groan', () => {
  const life = createLife(), s = createMatch();
  s.phase = 'live';
  stepLife(life, s, 0.016, [{ kind: 'block', moment: true, team: 0 }]);
  assert.ok(life.cheer[0] >= LIFE.cheerThree - 0.02 && life.groan === 0);
  const other = createLife();
  stepLife(other, s, 0.016, [{ kind: 'deep', moment: true, team: 1 }]);
  assert.deepEqual([other.groan, other.cheer[0]], [LIFE.groan, 0]);
  stepLife(other, s, 1, []);
  assert.ok(Math.abs(other.groan - (LIFE.groan - 1)) < 1e-9);
  stepLife(other, s, 1, [{ kind: 'made', moment: false, team: 1 }]);   // a plain basket is no moment
  assert.equal(other.groan, 0);
});
