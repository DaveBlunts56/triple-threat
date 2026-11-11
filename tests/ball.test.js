import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepBall, solveShot, rimCentre } from '../src/sim/ball.js';
import { DT, RIM, BALL } from '../src/sim/tuning.js';

const makeBall = (x, y, z, v = {}) => ({ x, y, z, vx: 0, vy: 0, vz: 0, holder: null, mode: 'loose', ...v });

// Steps the ball and merges events. `until(events, ball)` may stop the flight early.
function fly(ball, seconds, until) {
  const all = { hitFloor: false, hitRim: false, hitBoard: false, scored: 0, first: null };
  for (let t = 0; t < seconds; t += DT) {
    const e = stepBall(ball, DT);
    for (const k of ['hitRim', 'hitBoard', 'hitFloor']) {
      if (e[k]) { all[k] = true; all.first ??= k; }
    }
    if (e.scored && !all.scored) { all.scored = e.scored; all.first ??= 'scored'; }
    if (until?.(all, ball)) break;
  }
  return all;
}

test('dropped ball bounces to 0.75² of its drop height', () => {
  const b = makeBall(0, 2.12, 0);
  fly(b, 5, e => e.hitFloor);
  let peak = 0;
  fly(b, 5, () => { peak = Math.max(peak, b.y); return b.vy < 0; });
  assert.ok(Math.abs(peak - 1.245) < 0.05, `peak ${peak}`);
});

test('ball settles on the floor and stops bouncing', () => {
  const b = makeBall(0, 2.12, 0, { vx: 1 });
  fly(b, 10);
  assert.equal(b.y, BALL.radius);
  assert.equal(b.vy, 0);
  assert.ok(Math.abs(b.vx) < 0.05, `still rolling at ${b.vx}`);
});

test('solveShot goes in from a grid of positions', () => {
  for (const x of [0, 4, 8, 11]) for (const z of [-6, 0, 6]) for (const y of [2.3, 3.1]) {
    const b = makeBall(x, y, z, solveShot({ x, y, z }, rimCentre(1)));
    const e = fly(b, 4, ev => ev.scored !== 0 || ev.hitFloor);
    assert.equal(e.scored, 1, `from (${x}, ${y}, ${z}): first event ${e.first}`);
    assert.equal(e.first, 'scored', `from (${x}, ${y}, ${z}) touched ${e.first} first`);
  }
});

test('solveShot works for the -x hoop', () => {
  const from = { x: -6, y: 2.5, z: 2 };
  const b = makeBall(from.x, from.y, from.z, solveShot(from, rimCentre(-1)));
  assert.equal(fly(b, 4, e => e.scored !== 0 || e.hitFloor).scored, -1);
});

test('a ball rising through the rim from below does not score', () => {
  const b = makeBall(RIM.x, 2.5, 0, { vy: 6 });
  const e = fly(b, 2, () => b.vy <= 0);
  assert.ok(b.y > RIM.height, 'ball should have risen above the rim');
  assert.equal(e.scored, 0);
});

test('a shot aimed 0.3 m wide of the rim centre hits the rim instead of swishing', () => {
  const from = { x: 6, y: 3, z: 0 };
  const c = rimCentre(1);
  const b = makeBall(from.x, from.y, from.z, solveShot(from, { ...c, z: c.z + 0.3 }));
  const e = fly(b, 4, ev => ev.first !== null);
  assert.equal(e.first, 'hitRim');
});

test('backboard reflects the ball', () => {
  const b = makeBall(12.4, 3.4, 0, { vx: 5 });
  const e = fly(b, 0.2, ev => ev.hitBoard);
  assert.equal(e.hitBoard, true);
  assert.ok(b.vx < 0);
});

test('backboard at the -x end reflects the ball', () => {
  const b = makeBall(-12.4, 3.4, 0, { vx: -5 });
  assert.equal(fly(b, 0.2, ev => ev.hitBoard).hitBoard, true);
  assert.ok(b.vx > 0);
});

test('ball resting on top of the rim rolls off', () => {
  const b = makeBall(RIM.x - RIM.radius, RIM.height + 0.14, 0);
  fly(b, 3);
  assert.ok(b.y < 2.5, `ball still up at y=${b.y}`);
});

test('a ball thrown from behind the backboard bounces off the back of it', () => {
  const b = makeBall(13.4, 3.4, 0, { vx: -5 });
  const e = fly(b, 0.3, ev => ev.hitBoard);
  assert.equal(e.hitBoard, true);
  assert.ok(b.vx > 0 && b.x > 12.8);
});

test('solveShot clears the front of the rim from close range, even released low', () => {
  for (const d of [0.6, 0.8, 1.0]) for (const y of [2.3, 3.1]) for (const [dx, dz] of [[-1, 0], [0, 1], [-0.7, -0.7]]) {
    const from = { x: RIM.x + dx * d, y, z: dz * d };
    const b = makeBall(from.x, from.y, from.z, solveShot(from, rimCentre(1), RIM.radius));
    const e = fly(b, 4, ev => ev.first !== null);
    assert.equal(e.first, 'scored', `from ${d} m at height ${y} (${dx}, ${dz}) touched ${e.first} first`);
  }
});
