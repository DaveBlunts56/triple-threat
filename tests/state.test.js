import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, rand, attackSign, emptyIntent, emptyEvents, personOf, surname } from '../src/sim/state.js';
import { ROSTER } from '../src/sim/tuning.js';

test('createMatch builds six players, three per team', () => {
  const s = createMatch();
  assert.equal(s.players.length, 6);
  assert.deepEqual(s.players.map(p => p.id), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(s.players.map(p => p.team), [0, 0, 0, 1, 1, 1]);
  assert.deepEqual(s.players.map(p => p.slot), [0, 1, 2, 0, 1, 2]);
  assert.equal(s.phase, 'start');
  assert.equal(s.quarter, 1);
  assert.equal(s.gameClock, 180);
  assert.equal(s.shotClock, 24);
  assert.deepEqual(s.score, [0, 0]);
  assert.equal(s.controlled, 0);
  assert.equal(s.ball.holder, null);
});

test('teams start on their own side of centre court', () => {
  const s = createMatch();
  for (const p of s.players) assert.ok(p.team === 0 ? p.x < 0 : p.x > 0);
});

test('rand is deterministic per seed and stays in [0,1)', () => {
  const a = createMatch(7), b = createMatch(7);
  const xs = Array.from({ length: 100 }, () => rand(a));
  assert.deepEqual(xs, Array.from({ length: 100 }, () => rand(b)));
  assert.ok(xs.every(x => x >= 0 && x < 1));
  assert.ok(new Set(xs).size > 90);
});

test('attackSign', () => {
  assert.equal(attackSign(0), 1);
  assert.equal(attackSign(1), -1);
});

test('emptyIntent is all zeros and falses', () => {
  assert.deepEqual(emptyIntent(), { moveX: 0, moveZ: 0, sprint: false, shoot: false, pass: false, steal: false, switch: false, hold: false, foul: false });
});

test('each team has eight people, three of them on court in three a side and five in five a side', () => {
  const s = createMatch();
  assert.deepEqual(s.rosters.map(r => r.map(p => p.number)), [[4, 7, 11, 15, 23, 1, 13, 32], [5, 8, 10, 21, 33, 2, 14, 30]]);
  assert.deepEqual(createMatch(1, 5).players.map(p => p.person), [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
  assert.ok(s.rosters.flat().every(p => p.energy === 1 && p.fouls === 0));
  assert.deepEqual(s.players.map(p => p.person), [0, 1, 2, 0, 1, 2]);
  assert.equal(personOf(s, s.players[4]), s.rosters[1][1]);
});

test('a new match has nothing called, counted or queued', () => {
  const s = createMatch();
  assert.deepEqual([s.teamFouls, s.autoSubs, s.subQueue], [[0, 0], [true, true], []]);
  assert.deepEqual([s.call, s.freeThrow, s.pendingFoul, s.tipWinner, s.controlTeam], [null, null, null, null, null]);
  assert.deepEqual([s.frontcourt, s.backcourtT, s.inboundT], [false, 0, 0]);
  for (const p of s.players) assert.deepEqual([p.held, p.steps, p.keyT, p.setT, p.foulCooldown], [false, 0, 0, 0, 0]);
});

test('an empty intent has hold off, and empty events report nothing', () => {
  assert.equal(emptyIntent().hold, false);
  assert.deepEqual(emptyEvents(), { hitFloor: false, hitRim: false, hitBoard: false, scored: 0,
    travel: null, doubleDribble: null, stealMisses: [], release: null, contacts: [] });
});

test('every player has a name and a position, and the first three are a guard, a forward and a centre', () => {
  const s = createMatch();
  assert.deepEqual(s.rosters.map(r => r.map(p => p.name)), [
    ['Jalen Cross', 'Theo Marsh', 'Darius Stone', 'Sam Okoro', 'Andre Volkov', 'Marcus Bell', 'Noah Vance', 'Idris Kane'],
    ['Kai Mercer', 'Luca Reyes', 'Viktor Lund', 'Devon Hale', 'Emeka Bright', 'Rafael Ortiz', 'Jamal Whitaker', 'Bogdan Ilic']]);
  for (const r of s.rosters) assert.deepEqual(r.map(p => p.position), ['PG', 'SF', 'C', 'SG', 'PF', 'PG', 'SF', 'C']);
  assert.deepEqual(ROSTER.teams, ['Harbor City Waves', 'Red Rock Scorpions']);
  assert.equal(surname(s.rosters[0][4]), 'Volkov');
});
