import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { giveBall } from '../src/sim/players.js';
import { substitute } from '../src/sim/roster.js';
import { step } from '../src/sim/step.js';
import { manOf, guardOf } from '../src/sim/matchups.js';
import { DT } from '../src/sim/tuning.js';
import { live, at, ai, idle, run } from './helpers.js';

const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const target = p => ({ x: p.ai.targetX, z: p.ai.targetZ });

// Every player's man is an opponent in the match, and every player is the man of exactly one opponent.
function oneToOne(s, what = '') {
  for (const p of s.players) {
    assert.ok(Number.isInteger(p.man) && p.man >= 0 && p.man < s.players.length, `${what}: player ${p.id} has man ${p.man}`);
    assert.notEqual(manOf(s, p).team, p.team, `${what}: player ${p.id} guards a team-mate`);
    assert.equal(s.players.filter(o => o.man === p.id).length, 1, `${what}: player ${p.id} is guarded by other than one`);
    assert.equal(guardOf(s, manOf(s, p)), p);
  }
}
const ownMen = (s, what = '') => { for (const p of s.players) assert.equal(manOf(s, p).slot, p.slot, `${what}: player ${p.id}`); };

test("at the start each player's man is the opponent in his place of the order, three a side and five", () => {
  for (const size of [3, 5]) {
    const s = createMatch(1, size);
    oneToOne(s, `${size} a side`); ownMen(s, `${size} a side`);
  }
});

test('a substitute has the man of the player he replaced and is guarded by the same defender', () => {
  const s = createMatch(1, 5), player = s.players[1];
  const [man, guard] = [manOf(s, player), guardOf(s, player)];
  assert.equal(substitute(s, 1, 6), true);
  assert.equal(manOf(s, player), man);
  assert.equal(guardOf(s, player), guard);
  oneToOne(s);
});

test('every stoppage puts everyone back on his own man', () => {
  const swapped = () => { const s = live(1, 5); s.players[0].man = 6; s.players[1].man = 5; return s; };
  const out = swapped();
  at(out, 0, 5, 9);   // the handler steps out of bounds
  assert.ok(run(out, 1, idle(10), s => s.phase === 'dead'), 'no whistle');
  oneToOne(out, 'out of bounds'); ownMen(out, 'out of bounds');
  const over = swapped();
  over.gameClock = 0;
  assert.ok(run(over, 1, idle(10), s => s.phase === 'quarterEnd'), 'the period did not end');
  ownMen(over, 'the end of a period');
});

test('the defence guards by the matchup: a defender whose man was changed goes to the new one', () => {
  const s = live(1, 5);
  giveBall(s, s.players[5]);
  s.players[1].man = 7; s.players[2].man = 6;
  ai(s);
  for (const [id, now, before] of [[1, 7, 6], [2, 6, 7]]) {
    const to = target(s.players[id]);
    assert.ok(apart(to, s.players[now]) < apart(to, s.players[before]), `player ${id} is sent to ${JSON.stringify(to)}`);
  }
});
