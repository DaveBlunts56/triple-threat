import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, addPoints } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { RIM } from '../src/sim/tuning.js';
import { live, run, shotAt } from './helpers.js';

test('points are kept by quarter as well as in total', () => {
  const s = createMatch();
  assert.deepEqual(s.byQuarter, [[], []]);
  addPoints(s, 0, 2); addPoints(s, 1, 3);
  s.quarter = 3;
  addPoints(s, 0, 1);
  assert.deepEqual([s.score, s.byQuarter], [[3, 3], [[2, 0, 1], [3]]]);
  s.quarter = 5;                                                          // overtime is one more period
  addPoints(s, 1, 2);
  assert.deepEqual(s.byQuarter[1], [3, 0, 0, 0, 2]);
});

test('a basket in play and a new match both keep the record right', () => {
  const s = live(); s.quarter = 2;
  shotAt(s, { x: RIM.x, y: 3.5, z: 0 }, 3);
  run(s, 1);
  assert.deepEqual([s.score, s.byQuarter[0]], [[3, 0], [0, 3]]);
  startMatch(s);
  assert.deepEqual([s.score, s.byQuarter], [[0, 0], [[], []]]);
});

// ---------- the length of a match ----------

test('a match is of three-minute quarters unless it is made longer; a longer one allows more fouls, and every quarter is the length chosen', async () => {
  const { createMatch: make, setLength } = await import('../src/sim/state.js');
  const { startMatch: start } = await import('../src/sim/rules.js');
  const { step: go } = await import('../src/sim/step.js');
  const { CLOCK: clock, DT: dt, FOUL: foul, MATCH: match } = await import('../src/sim/tuning.js');
  const usual = make(1, 5);
  assert.deepEqual([usual.quarterLength, usual.gameClock, usual.foulLimit, usual.bonus], [clock.quarter, clock.quarter, foul.limit, foul.bonus]);
  assert.deepEqual(match.minutes, [3, 5, 8, 12]);
  for (const [minutes, fouls, bonus] of [[3, 3, 3], [5, 4, 4], [8, 5, 5], [12, 6, 5]]) {
    const s = make(1, 5); setLength(s, minutes); start(s);
    assert.deepEqual([s.gameClock, s.foulLimit, s.bonus], [minutes * 60, fouls, bonus], `${minutes} minutes`);
  }
  const odd = make(1, 5); setLength(odd, 7);
  assert.equal(odd.quarterLength, clock.quarter, 'a length the game does not have');
  // The second quarter is as long as the first.
  const s = make(1, 3); setLength(s, 5); start(s);
  s.phase = 'live'; s.gameClock = 0.01;
  const idle = s.players.map(() => ({ moveX: 0, moveZ: 0, sprint: false, shoot: false, pass: false, steal: false, switch: false, hold: false, foul: false }));
  for (let i = 0; i < 600 && s.quarter === 1; i++) go(s, idle, dt);
  assert.deepEqual([s.quarter, s.gameClock], [2, 300]);
});

test('in a longer match a player fouls out later and the bonus comes later', async () => {
  const { createMatch: make, setLength } = await import('../src/sim/state.js');
  const { benchOf } = await import('../src/sim/roster.js');
  const { recordFoul } = await import('../src/sim/fouls.js');
  const s = make(1, 5); setLength(s, 12);
  s.rosters[0][6].fouls = 5;
  assert.ok(benchOf(s, 0).includes(6), 'five fouls put him out of a twelve-minute-quarter match');
  s.rosters[0][6].fouls = 6;
  assert.ok(!benchOf(s, 0).includes(6));
  s.teamFouls = [3, 0];
  assert.equal(recordFoul(s, { kind: 'reach', by: 0, on: 5 }).shots, 0, 'the fourth team foul was shot');
  assert.equal(recordFoul(s, { kind: 'reach', by: 0, on: 5 }).shots, 2, 'the fifth was not');
});

test('the start menu\'s quarter length is the match\'s: Play makes a match of that length', async () => {
  const { createMatch: make } = await import('../src/sim/state.js');
  const { createMenu, startFromMenu } = await import('../src/menu.js');
  const game = { state: make(1, 3), menu: createMenu() };
  game.menu.minutes = 8;
  startFromMenu(game, { drop() {} }, size => make(2, size));
  assert.deepEqual([game.state.quarterLength, game.state.gameClock, game.state.foulLimit], [480, 480, 5]);
});
