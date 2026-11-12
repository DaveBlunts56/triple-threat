import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { DT, FOUL } from '../src/sim/tuning.js';

const LIMIT = 60 * 60 * 30;   // 30 minutes of match time, in steps
const FOULS = ['reach', 'shooting', 'charge', 'block'];

// Two computer teams play a whole match. Returns the final state with every call made,
// the number of trips to the free-throw line, and each team's substitutions.
function playMatch(seed) {
  const s = createMatch(seed);
  startMatch(s);
  const calls = [], subs = [0, 0];
  let steps = 0, freeThrows = 0, lastCall = null, lastPhase = s.phase, people = s.players.map(p => p.person);
  while (s.phase !== 'final' && steps < LIMIT) {
    step(s, aiIntents(s, DT), DT);
    if (s.call && s.call !== lastCall) calls.push(s.call);
    lastCall = s.call;
    if (s.phase === 'freeThrow' && lastPhase !== 'freeThrow') freeThrows++;
    lastPhase = s.phase;
    s.players.forEach((p, i) => { if (p.person !== people[i]) { subs[p.team]++; people[i] = p.person; } });
    if (++steps % 60 === 0) {
      for (const o of [...s.players, s.ball]) {
        assert.ok([o.x, o.y, o.z].every(Number.isFinite), `non-finite position at step ${steps}`);
      }
      assert.ok(Math.abs(s.ball.x) < 30 && Math.abs(s.ball.z) < 30 && s.ball.y < 30, `ball escaped at step ${steps}`);
    }
  }
  return { state: s, calls, freeThrows, subs };
}

test('two AI teams play a whole match', () => {
  const s = playMatch(42).state;
  assert.equal(s.phase, 'final', `stalled in phase ${s.phase}, Q${s.quarter} ${s.gameClock.toFixed(1)}s, shot clock ${s.shotClock.toFixed(1)}`);
  assert.ok(s.score[0] > 0 && s.score[1] > 0, `score ${s.score}`);
  assert.notEqual(s.score[0], s.score[1]);
});

test('the same seed gives the same final score', () => {
  assert.deepEqual(playMatch(7).state.score, playMatch(7).state.score);
});

const games = [1, 2, 3, 4, 5, 6].map(playMatch);
const fouls = games.flatMap(g => g.calls).filter(c => FOULS.includes(c.kind));

test('six computer matches all finish', () => {
  for (const g of games) assert.equal(g.state.phase, 'final');
});

test('fouls, free throws and substitutions all happen', () => {
  assert.ok(fouls.length > 0, 'no fouls in six matches');
  assert.ok(games.some(g => g.freeThrows > 0), 'no free throws in six matches');
  for (const team of [0, 1]) assert.ok(games.some(g => g.subs[team] > 0), `team ${team} never substituted`);
});

test('the whistle blows a sensible amount: 2 to 16 fouls a match on average', () => {
  const perMatch = fouls.length / games.length;
  assert.ok(perMatch >= 2 && perMatch <= 16, `${perMatch} fouls a match`);
});

test('the computer never travels or double dribbles, and rarely commits the timed violations', () => {
  const kinds = games.flatMap(g => g.calls).map(c => c.kind);
  assert.equal(kinds.filter(k => k === 'travel' || k === 'doubleDribble').length, 0);
  const timed = kinds.filter(k => ['backcourt', 'eightSeconds', 'threeSeconds', 'fiveSeconds'].includes(k)).length / games.length;
  assert.ok(timed <= 1.5, `${timed} timed violations a match`);
});

test('energy and foul counts stay in range', () => {
  for (const g of games) for (const p of g.state.rosters.flat()) {
    assert.ok(p.energy >= 0 && p.energy <= 1);
    assert.ok(p.fouls >= 0 && p.fouls <= FOUL.limit + 1);
  }
});
