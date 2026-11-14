import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, isJumper, lineUp } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { spots, aiIntents } from '../src/sim/ai.js';
import { setupFreeThrow } from '../src/sim/freethrow.js';
import { step } from '../src/sim/step.js';
import { COURT, DT, PLAYER, RIM, VIOLATION } from '../src/sim/tuning.js';

const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('a match is three a side unless it is made five a side, and no other size exists', () => {
  assert.deepEqual([createMatch().size, createMatch(1, 3).size, createMatch(1, 5).size, createMatch(1, 4).size, createMatch(1, 0).size], [3, 3, 5, 3, 3]);
  const three = createMatch(7), five = createMatch(7, 5);
  assert.deepEqual(three.players.map(p => [p.team, p.slot, p.person]), [[0, 0, 0], [0, 1, 1], [0, 2, 2], [1, 0, 0], [1, 1, 1], [1, 2, 2]]);
  assert.equal(five.players.length, 10);
  assert.deepEqual(five.players.map(p => p.team), [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  assert.deepEqual(five.players.map(p => p.slot), [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
  assert.deepEqual(five.players.map(p => p.person), [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
  assert.deepEqual(five.players.map(p => p.id), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('five line up either side of the centre line, apart from each other, as three always have', () => {
  const three = createMatch(), five = createMatch(1, 5);
  assert.deepEqual(three.players.map(p => [p.x, p.z]), [[-2, -3], [-2, 0], [-2, 3], [2, -3], [2, 0], [2, 3]]);
  assert.deepEqual(five.players.slice(0, 5).map(p => [p.x, Math.round(p.z * 10) / 10]), [[-2, -4.8], [-2, -2.4], [-2, 0], [-2, 2.4], [-2, 4.8]]);
  assert.ok(five.players.slice(5).every(p => p.x === 2));
  for (const a of five.players) for (const b of five.players) if (a !== b) assert.ok(apart(a, b) >= 2 * PLAYER.radius);
  lineUp(five);
  assert.ok(five.players.every(p => Math.abs(p.z) <= COURT.halfWidth));
});

test('the centres jump the tip in five a side; in three a side the jumper is who he was', () => {
  const three = createMatch(), five = createMatch(1, 5);
  startMatch(three); startMatch(five);
  assert.deepEqual(three.players.filter(p => isJumper(three, p)).map(p => p.id), [1, 4]);
  assert.deepEqual(five.players.filter(p => isJumper(five, p)).map(p => p.id), [2, 7]);
  assert.deepEqual([three.controlled, five.controlled], [1, 2]);
  assert.equal(five.phase, 'jumpBall');
});

test('five have five spots: in the front court, inside the lines, apart, and mirrored for the other team', () => {
  assert.deepEqual(spots(1), spots(1, 3));
  assert.equal(spots(1).length, 3);
  const mine = spots(1, 5), theirs = spots(-1, 5);
  assert.equal(mine.length, 5);
  for (const [i, s] of mine.entries()) {
    assert.ok(s.x > 0 && s.x <= COURT.halfLength - PLAYER.radius && Math.abs(s.z) <= COURT.halfWidth - PLAYER.radius, JSON.stringify(s));
    assert.deepEqual([theirs[i].x, theirs[i].z], [-s.x, s.z]);
    for (const other of mine) if (other !== s) assert.ok(apart(s, other) >= 3, `${JSON.stringify(s)} and ${JSON.stringify(other)}`);
  }
});

test('a free throw in five a side gives all ten a place: nobody in the lane, nobody on top of another, at either hoop', () => {
  for (const shooter of [0, 7]) {
    const s = createMatch(1, 5); startMatch(s);
    s.freeThrow = { shooter, left: 2, total: 2 };
    setupFreeThrow(s);
    const sign = shooter < 5 ? 1 : -1, hoopX = sign * RIM.x;
    for (const p of s.players) {
      assert.ok(Math.abs(p.x) <= COURT.halfLength && Math.abs(p.z) <= COURT.halfWidth, `player ${p.id} is off the court`);
      const fromBaseline = COURT.halfLength - sign * p.x, inLane = Math.abs(p.z) < VIOLATION.keyHalfWidth && fromBaseline < VIOLATION.keyDepth;
      if (p.id !== shooter) assert.ok(!inLane, `player ${p.id} stands in the lane`);
      for (const q of s.players) if (q !== p) assert.ok(apart(p, q) >= 2 * PLAYER.radius, `players ${p.id} and ${q.id} overlap`);
      assert.ok(Math.cos(Math.atan2(-p.z, hoopX - p.x) - p.facing) > 1 - 1e-9);   // all face the hoop (a half turn is the same either way round)
    }
    assert.equal(s.phase, 'freeThrow');
  }
});

test('the computer plays whole five-a-side matches against itself: they end, both score, nobody leaves, calls are sane', () => {
  for (const seed of [1, 2, 3]) {
    const s = createMatch(seed, 5); startMatch(s);
    const calls = {}; let last = null, steps = 0;
    while (s.phase !== 'final' && steps < 400000) {
      step(s, aiIntents(s, DT), DT); steps++;
      if (s.call && s.call !== last) calls[s.call.kind] = (calls[s.call.kind] ?? 0) + 1;
      last = s.call;
      if (steps % 30 === 0) for (const p of s.players)
        assert.ok(Math.abs(p.x) <= COURT.halfLength + COURT.margin + 1 && Math.abs(p.z) <= COURT.halfWidth + COURT.margin + 1 && Number.isFinite(p.x + p.z + p.y), `seed ${seed}: player ${p.id} at ${p.x}, ${p.z}`);
    }
    assert.equal(s.phase, 'final', `seed ${seed} never ended`);
    assert.ok(s.score[0] >= 10 && s.score[1] >= 10, `seed ${seed}: ${s.score}`);
    assert.ok(s.score[0] + s.score[1] <= 260, `seed ${seed}: ${s.score}`);
    for (const [kind, count] of Object.entries(calls)) assert.ok(count <= 60, `seed ${seed}: ${count} calls of ${kind}`);
    assert.equal(s.players.length, 10);
  }
});
