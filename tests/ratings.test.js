import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { KEYS, lift, drop, rated, overall, starOf, heatOf } from '../src/sim/ratings.js';
import { zoneOf } from '../src/sim/players.js';
import { RIM, ROSTER } from '../src/sim/tuning.js';
import { at } from './helpers.js';

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what ?? ''}: ${a} is not ${b}`);

// The design's table: each player's role, his eight ratings in the order of KEYS, and his overall.
const TABLE = [[
  ['Jalen Cross', 'Playmaker', [78, 88, 84, 94, 90, 72, 48, 84], 88], ['Theo Marsh', 'Slasher', [90, 70, 58, 80, 88, 74, 64, 78], 82],
  ['Darius Stone', 'Rim protector', [86, 74, 42, 50, 62, 92, 90, 78], 84], ['Sam Okoro', 'Sharpshooter', [60, 88, 94, 78, 75, 58, 62, 80], 83],
  ['Andre Volkov', 'Stretch big', [80, 78, 84, 58, 56, 74, 84, 70], 80], ['Marcus Bell', 'Shot creator', [68, 86, 76, 84, 76, 52, 58, 66], 78],
  ['Noah Vance', 'Lockdown wing', [63, 55, 70, 60, 76, 90, 60, 86], 77], ['Idris Kane', 'Rebounder', [82, 62, 40, 54, 50, 76, 92, 68], 76],
], [
  ['Kai Mercer', 'Shot creator', [83, 94, 90, 92, 86, 58, 62, 78], 89], ['Luca Reyes', 'Two-way wing', [78, 72, 84, 60, 80, 88, 66, 80], 82],
  ['Viktor Lund', 'Post scorer', [94, 80, 45, 55, 52, 78, 88, 75], 83], ['Devon Hale', 'Sharpshooter', [62, 84, 92, 73, 76, 62, 44, 90], 83],
  ['Emeka Bright', 'Glass cleaner', [80, 60, 44, 52, 70, 84, 92, 74], 80], ['Rafael Ortiz', 'Lockdown guard', [62, 64, 52, 76, 86, 90, 58, 74], 78],
  ['Jamal Whitaker', 'Slasher', [86, 62, 50, 74, 84, 69, 62, 72], 77], ['Bogdan Ilic', 'Rim protector', [76, 62, 50, 44, 48, 88, 86, 68], 76],
]];

test('every player has eight ratings from 40 to 99, a role, and the overall the design gives him', () => {
  assert.deepEqual(KEYS, ['inside', 'mid', 'three', 'handle', 'speed', 'defence', 'rebound', 'stamina']);
  const s = createMatch(1, 5);
  TABLE.forEach((team, t) => team.forEach(([name, role, ratings, ovr], row) => {
    const person = s.rosters[t][row];
    assert.deepEqual([person.name, person.role, KEYS.map(key => person.ratings[key]), overall(person), person.streak], [name, role, ratings, ovr, 0]);
    assert.ok(ratings.every(r => r >= 40 && r <= 99), name);
  }));
  assert.equal(rated(s, s.players[6], 'defence'), 88);   // Luca Reyes, in the second place of team 1
});

test('the two teams are level: the starting three, the starting five and the bench total the same', () => {
  const s = createMatch(1, 5), total = (team, rows) => rows.reduce((sum, row) => sum + overall(s.rosters[team][row]), 0);
  for (const [rows, sum] of [[[0, 1, 2], 254], [[0, 1, 2, 3, 4], 417], [[5, 6, 7], 231]]) assert.deepEqual([total(0, rows), total(1, rows)], [sum, sum]);
});

test('each team\'s star is its best player', () => {
  const s = createMatch(1, 5);
  assert.deepEqual([starOf(s, 0), starOf(s, 1)], [0, 0]);
  s.rosters[0][3].ratings = { ...s.rosters[0][3].ratings, inside: 99, handle: 99, speed: 99 };
  assert.equal(starOf(s, 0), 3);
});

test('a rating of 70 changes nothing, and each 10 points changes a thing by its share', () => {
  near(lift(70, 0.07), 1); near(drop(70, 0.08), 1);
  near(lift(80, 0.07), 1.07); near(lift(50, 0.07), 0.86);
  near(drop(80, 0.08), 0.92); near(drop(40, 0.1), 1.3);
});

test('a shot is inside within three metres, a three behind the line, and mid-range between', () => {
  const s = createMatch(1, 5), zone = (id, x, z) => { at(s, id, x, z); return zoneOf(s.players[id]); };
  assert.deepEqual([zone(0, RIM.x - 2, 0), zone(0, RIM.x - 4.5, 0), zone(0, RIM.x - 7.2, 0), zone(0, RIM.x - 1, 6.9)], ['inside', 'mid', 'three', 'three']);
  assert.deepEqual([zone(5, -RIM.x + 2, 0), zone(5, -RIM.x + 7.2, 0), zone(5, RIM.x - 2, 0)], ['inside', 'three', 'three']);   // team 1 shoots at the other hoop
});

test('hot is three makes in a row and cold three misses', () => {
  assert.deepEqual([0, 2, 3, 5, -2, -3].map(streak => heatOf({ streak })), [null, null, 'hot', 'hot', null, 'cold']);
});
