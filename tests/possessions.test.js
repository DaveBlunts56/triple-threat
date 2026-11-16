// Possessions are counted where they end (plan Task 2.3, Review Focus 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginPossession, endPossession, handOver } from '../src/sim/possessions.js';
import { SHOT_BEST, giveBall } from '../src/sim/players.js';
import { createMatch, setLength } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { rimCentre } from '../src/sim/ball.js';
import { DT } from '../src/sim/tuning.js';
import { live, idle, only, at, run } from './helpers.js';

// A bare state with a clock, for the counting alone.
const bare = () => ({ gameClock: 100, quarter: 1, possessions: [0, 0], lengths: [[0, 0], [0, 0]], owner: null, ownerClock: 0, ownerQuarter: 1, lastEnded: null });
const tick = (s, seconds) => { s.gameClock -= seconds; };

test('the tip begins the first possession and counts nothing', () => {
  const s = bare();
  beginPossession(s, 1);
  assert.deepEqual(s.possessions, [0, 0]);
  assert.equal(s.owner, 1);
});

test('an and-one ends the possession after the free throw; a defensive foul with no shots ends nothing', () => {
  const s = bare();
  handOver(s, 0); tick(s, 9);
  handOver(s, 0);            // the basket counts and the whistle gives the ball back to the shooter's team for the free throw
  assert.deepEqual(s.possessions, [0, 0]);
  handOver(s, 1);            // the free throw is in: the other team inbounds
  assert.deepEqual(s.possessions, [1, 0]);
  assert.deepEqual(s.lengths[0], [9, 1]);
});

test('free throws missed and rebounded by the defence end it; rebounded by the offence they do not', () => {
  const s = bare();
  handOver(s, 0); tick(s, 5);
  handOver(s, 0);            // the offence takes its own miss
  assert.deepEqual(s.possessions, [0, 0]);
  tick(s, 3); handOver(s, 1);
  assert.deepEqual(s.possessions, [1, 0]);
});

test('a fouled miss picked up by the defence as the whistle goes is still one possession', () => {
  const s = bare();
  handOver(s, 0); tick(s, 8);
  handOver(s, 1);            // the defence has the rebound...
  handOver(s, 0);            // ...and in the same step the foul on the shot gives it back
  assert.deepEqual(s.possessions, [0, 0]);
  assert.equal(s.owner, 0); assert.equal(s.ownerClock, 100);
  tick(s, 1); handOver(s, 1);
  assert.deepEqual(s.possessions, [1, 0]);
  assert.deepEqual(s.lengths[0], [9, 1]);
});

test('the end of a period ends the possession; a ball handed over with no time left is nobody\'s', () => {
  const s = bare();
  handOver(s, 0); s.gameClock = 0;
  handOver(s, 1);            // a basket as the period ends: the other team would inbound with nothing left
  endPossession(s);
  assert.deepEqual(s.possessions, [1, 0]);
  const t = bare();
  handOver(t, 1); t.gameClock = 0; endPossession(t);
  assert.deepEqual(t.possessions, [0, 1]);
  endPossession(t);          // a possession ends once only
  assert.deepEqual(t.possessions, [0, 1]);
});

// Player 0 alone `out` metres from the hoop, with nobody near and no coach.
function shooter(out) {
  const s = live(1);
  s.playWait = [Infinity, Infinity]; s.tempo = { clock: Infinity, wait: 0 };
  s.players.forEach((p, i) => { if (i) at(s, i, -11, (i - 3) * 2); });
  at(s, 0, rimCentre(1).x - out, 0);
  return s;
}

test('in a match: a made basket, a defensive rebound and a shot-clock violation each end a possession', () => {
  const made = shooter(4);
  for (let t = 0; t < SHOT_BEST - DT / 2; t += DT) step(made, only(0, { shoot: true }), DT);
  run(made, 4, idle(), st => st.score[0] > 0);
  assert.equal(made.score[0], 2);
  assert.deepEqual(made.possessions, [1, 0]);

  const board = live(1);
  giveBall(board, board.players[4]);       // team 1 takes the ball
  assert.deepEqual(board.possessions, [1, 0]);
  step(board, idle(), DT);
  giveBall(board, board.players[1]);       // and loses it straight back, a step later (in the same step it would be no possession)
  assert.deepEqual(board.possessions, [1, 1]);

  const clock = live(1);
  clock.shotClock = 0.5;
  run(clock, 1, idle(), st => st.phase !== 'live');
  assert.equal(clock.call.kind, 'shotClock');
  assert.deepEqual(clock.possessions, [1, 0]);
});

test('over whole matches the two teams\' counts differ by at most one in every period', () => {
  for (const [seed, size, minutes] of [[1, 3, 3], [2, 5, 3], [3, 5, 5], [4, 3, 3], [5, 5, 3]]) {
    const s = createMatch(seed, size);
    setLength(s, minutes);
    startMatch(s);
    let before = [0, 0], phase = s.phase;
    for (let i = 0; s.phase !== 'final' && i < 60 * 60 * 40; i++) {
      step(s, aiIntents(s, DT), DT);
      if (s.phase === 'quarterEnd' && phase !== 'quarterEnd') {
        const inPeriod = [s.possessions[0] - before[0], s.possessions[1] - before[1]];
        assert.ok(Math.abs(inPeriod[0] - inPeriod[1]) <= 1, `seed ${seed}, period ${s.quarter}: ${inPeriod}`);
        before = [...s.possessions];
      }
      phase = s.phase;
    }
    assert.ok(s.possessions[0] > 10 && s.possessions[1] > 10);
  }
});
