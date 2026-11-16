import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COACHES, DEFENCES, PLAYBOOKS, ROLES, TEAMS } from '../src/sim/teams.js';
import { ROSTER } from '../src/sim/tuning.js';
import { createMatch } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { DT } from '../src/sim/tuning.js';
import { PLAYS } from '../src/sim/plays.js';
import { THIRD_TEAM } from './third.js';

test('the two teams are today\'s: names, numbers, positions, roles and ratings unchanged', () => {
  assert.equal(ROSTER.teams[0], 'Harbor City Waves'); assert.equal(ROSTER.teams[1], 'Red Rock Scorpions');
  assert.deepEqual(ROSTER.numbers, [[4, 7, 11, 15, 23, 1, 13, 32], [5, 8, 10, 21, 33, 2, 14, 30]]);
  assert.deepEqual(ROSTER.ratings[1][0], [83, 94, 90, 92, 86, 58, 62, 78]);
  const s = createMatch(1, 5);
  assert.equal(s.rosters[1][2].name, 'Viktor Lund');
  assert.deepEqual(s.rosters[1][2].ratings, { inside: 94, mid: 80, three: 45, handle: 55, speed: 52, defence: 78, rebound: 88, stamina: 75 });
});

test('every role in use has an entry, and every team names a playbook, a defence and a coach that exist', () => {
  for (const team of TEAMS) {
    assert.ok(PLAYBOOKS[team.playbook], team.playbook); assert.ok(DEFENCES[team.defence], team.defence); assert.ok(COACHES[team.coach], team.coach);
    for (const p of team.players) assert.ok(ROLES[p.role], p.role);
  }
  for (const book of Object.values(PLAYBOOKS)) for (const key of Object.keys(book.plays)) assert.ok(PLAYS[key], key);
});

test('a third team defined in a test plays a whole match against each of the two', () => {
  for (const other of [0, 1]) for (const size of [3, 5]) {
    const s = createMatch(3, size, [THIRD_TEAM, other]);
    startMatch(s);
    for (let i = 0; s.phase !== 'final' && i < 60 * 60 * 30; i++) step(s, aiIntents(s, DT), DT);
    assert.equal(s.phase, 'final', `against ${other}, ${size} a side`);
    assert.ok(s.score[0] > 0 && s.score[1] > 0);
    assert.equal(s.rosters[0][0].name, 'Ezra Pike');
  }
});

test('a third team plays fast games against each of the two, home and away: they end, and the box scores add up', async () => {
  const { quickMatch } = await import('../src/sim/quick/engine.js');
  const { teamLine } = await import('../src/sim/stats.js');
  for (const teams of [[THIRD_TEAM, 0], [1, THIRD_TEAM], [THIRD_TEAM, 1], [0, THIRD_TEAM]]) for (let seed = 1; seed <= 5; seed++) {
    const s = quickMatch({ seed, teams });
    assert.equal(s.phase, 'final');
    for (const t of [0, 1]) { const l = teamLine(s, t); assert.equal(l.pts, s.score[t]); assert.equal(l.pts, 2 * l.fgm + l.tpm + l.ftm); assert.ok(l.pts > 60, `${l.pts}`); }
  }
});
