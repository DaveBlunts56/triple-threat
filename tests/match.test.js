import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { DT } from '../src/sim/tuning.js';

const LIMIT = 60 * 60 * 30;   // 30 minutes of match time, in steps

function playMatch(seed) {
  const s = createMatch(seed);
  startMatch(s);
  let steps = 0;
  while (s.phase !== 'final' && steps < LIMIT) {
    step(s, aiIntents(s, DT), DT);
    if (++steps % 60 === 0) {
      for (const o of [...s.players, s.ball]) {
        assert.ok([o.x, o.y, o.z].every(Number.isFinite), `non-finite position at step ${steps}`);
      }
      assert.ok(Math.abs(s.ball.x) < 30 && Math.abs(s.ball.z) < 30 && s.ball.y < 30, `ball escaped at step ${steps}`);
    }
  }
  return s;
}

test('two AI teams play a whole match', () => {
  const s = playMatch(42);
  assert.equal(s.phase, 'final', `stalled in phase ${s.phase}, Q${s.quarter} ${s.gameClock.toFixed(1)}s, shot clock ${s.shotClock.toFixed(1)}`);
  assert.ok(s.score[0] > 0 && s.score[1] > 0, `score ${s.score}`);
  assert.notEqual(s.score[0], s.score[1]);
});

test('the same seed gives the same final score', () => {
  assert.deepEqual(playMatch(7).score, playMatch(7).score);
});
