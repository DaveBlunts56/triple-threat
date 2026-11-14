import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, emptyIntent } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { CLOCK, DT } from '../src/sim/tuning.js';
import { idle, only, run } from './helpers.js';

function tip(seed = 1) {
  const s = createMatch(seed);
  startMatch(s);
  return s;
}

test('the match starts with the two jumpers either side of the centre spot and the ball held above it', () => {
  const s = tip();
  assert.deepEqual([s.phase, s.controlled, s.ball.holder], ['jumpBall', 1, null]);
  assert.deepEqual([s.players[1].x, s.players[1].z, s.players[4].x, s.players[4].z], [-0.6, 0, 0.6, 0]);
  run(s, 0.9);
  assert.deepEqual([s.ball.x, s.ball.y, s.ball.z, s.gameClock], [0, 1.5, 0, CLOCK.quarter]);
});

test('after a second the ball is tossed to about 3.7 m', () => {
  const s = tip(); let top = 0;
  run(s, 2, idle(), st => { top = Math.max(top, st.ball.y); return false; });
  assert.ok(top > 3.6 && top < 3.8, `peak ${top}`);
});

test('nobody but the jumpers can move during the tip', () => {
  const s = tip(); const before = s.players.map(p => p.x);
  run(s, 0.9, s.players.map(() => ({ ...emptyIntent(), moveX: 1, sprint: true })));
  assert.deepEqual(s.players.map(p => p.x), before);
});

test('a jumper cannot touch the ball while it is still rising', () => {
  const s = tip();
  run(s, 1.05, only(1, { shoot: true }));               // jumps the instant it is tossed
  assert.ok(s.players[1].y > 0, 'he never left the floor');
  run(s, 0.5, idle(), st => st.phase !== 'jumpBall');
  assert.equal(s.phase, 'jumpBall');                    // he is coming down while the ball is still going up
});

test('each jumper gets one jump per tip', () => {
  const s = tip();
  run(s, 1.05, only(1, { shoot: true }));
  run(s, 0.9, idle());                                  // he lands
  assert.equal(s.players[1].y, 0);
  run(s, 0.1, only(1, { shoot: true }));
  assert.equal(s.players[1].y, 0);
});

test('a well-timed jump taps the ball to the nearest teammate and play is live', () => {
  const s = tip();
  run(s, 3, st => only(1, { shoot: st.ball.vy < 0 && st.ball.y < 3.6 }), st => st.phase === 'live');
  assert.equal(s.phase, 'live');
  assert.deepEqual([s.ball.mode, s.lastTouch], ['pass', 0]);
  run(s, 2, idle(), st => st.ball.holder !== null);
  assert.equal(s.players[s.ball.holder].team, 0);
  step(s, idle(), DT);
  assert.equal(s.tipWinner, 0);
});

test('if nobody jumps the ball lands, play is live and the clock starts', () => {
  const s = tip();
  run(s, 4, idle(), st => st.phase === 'live');
  assert.equal(s.phase, 'live');
  run(s, 0.5);
  assert.ok(s.gameClock < CLOCK.quarter);
});

test('the computer jumps for the tip', () => {
  const s = tip();
  assert.ok(run(s, 4, st => aiIntents(st, DT), st => st.phase === 'live' && st.ball.mode === 'pass'));
});

test('the tip loser starts quarters 2 and 4, the winner quarter 3, and overtime keeps alternating', () => {
  for (const [quarter, starts] of [[2, 0], [3, 1], [4, 0], [5, 1], [6, 0]]) {
    const s = tip(); s.tipWinner = 1; s.quarter = quarter - 1; s.phase = 'quarterEnd'; s.phaseT = 0; s.score = [1, 1];
    step(s, idle(), DT);
    assert.deepEqual([s.quarter, s.phase, s.possession], [quarter, 'inbound', starts], `quarter ${quarter}`);
  }
});

// ---------- how the teams stand for the tip ----------

test('at the tip the jumpers meet at the centre and the rest stand round the circle, facing the ball: two pairs on the centre line, and in five a side a guard back and a forward up', async () => {
  const { createMatch: make, attackSign: sign, isJumper: jumps } = await import('../src/sim/state.js');
  const { startMatch: start } = await import('../src/sim/rules.js');
  const { TIP: tip } = await import('../src/sim/tuning.js');
  for (const size of [3, 5]) {
    const s = make(1, size); start(s);
    assert.equal(s.phase, 'jumpBall');
    for (const p of s.players) {
      const own = -sign(p.team), far = Math.hypot(p.x, p.z);
      if (jumps(s, p)) { assert.deepEqual([p.x, p.z], [own * tip.gap, 0]); continue; }
      assert.ok(far >= 1.8 + 0.3, `${size} a side: player ${p.id} stands in the circle`);
      assert.ok(Math.cos(p.facing - Math.atan2(-p.z, -p.x)) > 0.99, `${size} a side: player ${p.id} does not face the ball`);
      for (const o of s.players) if (o !== p) assert.ok(Math.hypot(o.x - p.x, o.z - p.z) >= 0.9, `${size} a side: players ${p.id} and ${o.id} are on top of each other`);
    }
    for (const team of [0, 1]) {
      const round = s.players.filter(p => p.team === team && !jumps(s, p) && Math.hypot(p.x, p.z) < 3);
      assert.equal(round.length, 2, `${size} a side, team ${team}: two on the circle`);
      assert.ok(round.every(p => Math.sign(p.x) === -sign(team) && Math.abs(p.x) < 1), 'each on his own side of the centre line, beside it');
      assert.equal(round[0].z * round[1].z < 0, true, 'one either side of the jumpers');
      if (size === 5) {
        const guard = s.players.find(p => p.team === team && p.slot === 0), forward = s.players.find(p => p.team === team && p.slot === 4);
        assert.ok(-sign(team) * guard.x >= 5, 'the guard stands back in his own half');
        assert.ok(sign(team) * forward.x >= 4, 'a forward stands up the court');
      }
    }
  }
});
