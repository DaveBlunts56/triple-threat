// The coach's rotation in Simulation, and Arcade's substitutions as they were (plan Task 3.4). The spread of minutes
// over whole matches is tested with Simulation's fatigue, in tests/simfatigue.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, setLength } from '../src/sim/state.js';
import { setStyle } from '../src/sim/styles.js';
import { applySubs, onCourt, rotationPlan } from '../src/sim/roster.js';

// A five-a-side match of 12-minute quarters at a stoppage, in `style`, nobody playing.
function stopped(style = 'sim') {
  const s = createMatch(1, 5);
  setLength(s, 12);
  setStyle(s, style);
  s.humans = [];
  Object.assign(s, { phase: 'dead', quarter: 1, gameClock: 500 });
  return s;
}
const stop = s => { s.stoppages++; applySubs(s); };

test('a coach\'s plan shares the game\'s minutes: starters most, the bench in turn, all of them adding up', () => {
  const s = stopped(), plan = rotationPlan(s, 0).map(secs => secs / 60);
  assert.ok(Math.abs(plan.reduce((a, b) => a + b, 0) - 240) < 1e-9);
  for (const row of [0, 1, 2, 3, 4]) assert.ok(plan[row] >= 32 && plan[row] <= 38, `starter ${row}: ${plan[row].toFixed(1)}`);
  assert.ok(plan[5] > plan[7] && plan[7] >= 8);
});

test('two fouls in the first quarter sits a starter; in the second he may come back', () => {
  const s = stopped();
  s.rosters[0][0].fouls = 2;
  stop(s);
  assert.ok(!onCourt(s, 0).includes(0), 'Cross sits with two fouls in the first');
  s.quarter = 2; s.rosters[0][5].energy = 0.2;   // the man who came on for him is spent
  stop(s);
  assert.ok(onCourt(s, 0).includes(0), 'and is back in the second');
});

test('the starters start the second half', () => {
  const s = stopped();
  for (const row of [0, 1]) { const p = s.players.find(q => q.team === 0 && q.person === row); p.person = row + 5; }
  Object.assign(s, { phase: 'quarterEnd', quarter: 2, gameClock: 0 });
  stop(s);
  assert.deepEqual([...onCourt(s, 0)].sort(), [0, 1, 2, 3, 4]);
});

test('a 25-point lead with 4 minutes left empties both benches', () => {
  const s = stopped();
  Object.assign(s, { quarter: 4, gameClock: 240, score: [110, 85] });
  stop(s);
  for (const team of [0, 1]) assert.ok(onCourt(s, team).filter(row => row < 5).length <= 2, `team ${team}: ${onCourt(s, team)}`);
});

test('with Auto subs off your team is left to you, and your own picks stand', () => {
  const s = stopped();
  s.autoSubs[0] = false; s.rosters[0][0].fouls = 2; s.rosters[1][0].fouls = 2;
  stop(s);
  assert.ok(onCourt(s, 0).includes(0), 'yours stays');
  assert.ok(!onCourt(s, 1).includes(0), 'theirs sits');
  const mine = stopped();
  mine.rosters[0][0].fouls = 2; mine.rosters[0][0].manual = true;
  stop(mine);
  assert.ok(onCourt(mine, 0).includes(0), 'a man you put on stays');
});

test('in Arcade substitutions are as they were: by energy and the foul limit, not by fouls in a quarter', () => {
  const s = stopped('arcade');
  s.rosters[0][0].fouls = 2;
  stop(s);
  assert.ok(onCourt(s, 0).includes(0), 'two fouls do not sit him in Arcade');
  s.rosters[0][1].energy = 0.2;
  stop(s);
  assert.ok(!onCourt(s, 0).includes(1), 'a spent man comes off');
});
