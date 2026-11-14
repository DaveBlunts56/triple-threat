import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { giveBall } from '../src/sim/players.js';
import { substitute } from '../src/sim/roster.js';
import { step } from '../src/sim/step.js';
import { startMatch } from '../src/sim/rules.js';
import { manOf, guardOf, screenSwitches } from '../src/sim/matchups.js';
import { aiIntents } from '../src/sim/ai.js';
import { newFreeThrow, setupFreeThrow } from '../src/sim/freethrow.js';
import { DT, MATCHUP } from '../src/sim/tuning.js';
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

// ---------- switching ----------

const men = s => s.players.map(p => p.man);

// Five a side in live play, team 1 with the ball (player 9, away from the rest). Defender 0 has run into attacker 6,
// who stands set; defender 0's own man, player 5, is four metres off, and defender 1 is a metre from that man.
function screened() {
  const s = live(1, 5);
  giveBall(s, s.players[9]);
  at(s, 9, -3, 6);
  at(s, 6, -6, 0); s.players[6].setT = 1;
  at(s, 0, -5.5, 0);
  at(s, 5, -9.5, 0);
  at(s, 1, -8.6, 0);
  return s;
}

test("a screened defender swaps with the screener's defender when that defender is nearer the man being lost", () => {
  const s = screened();
  screenSwitches(s, [[0, 6]], DT);
  assert.equal(s.players[0].man, 6);
  assert.equal(s.players[1].man, 5);
  assert.equal(s.switches, 1);
  oneToOne(s);
});

test("no switch when the screener's defender is farther from the man, when the attacker run into is moving, is the defender's own man, holds the ball or is the inbounder, or when the man is still close", () => {
  const cases = {
    "the screener's defender is farther": s => at(s, 1, 0, 5),
    'the attacker is moving': s => { s.players[6].setT = 0; },
    'the attacker holds the ball': s => giveBall(s, s.players[6]),
    'the attacker is the inbounder': s => { s.players[6].inbounder = true; },
    'the man is still close': s => { at(s, 5, -7, 0); at(s, 1, -7.5, 0.5); },
  };
  for (const [what, change] of Object.entries(cases)) {
    const s = screened(), before = men(s);
    change(s);
    screenSwitches(s, [[0, 6]], DT);
    assert.deepEqual(men(s), before, what);
    assert.equal(s.switches, 0, what);
  }
  const own = screened(), before = men(own);
  own.players[5].setT = 1;
  screenSwitches(own, [[0, 5]], DT);   // he has run into his own man
  assert.deepEqual(men(own), before, 'his own man');
});

test('a pair that has just swapped does not swap back within the wait, and may after it', () => {
  const s = screened();
  screenSwitches(s, [[0, 6]], DT);
  // The mirror of the first screen: now defender 1 is on the set attacker and far from his new man, whom defender 0 is near.
  at(s, 1, -5.5, 0.4); at(s, 0, -8.6, 0);
  const swapped = men(s);
  screenSwitches(s, [[1, 6]], DT);
  assert.deepEqual(men(s), swapped, 'swapped back at once');
  for (let t = 0; t < MATCHUP.wait; t += DT) screenSwitches(s, [], DT);
  screenSwitches(s, [[1, 6]], DT);
  assert.equal(s.players[1].man, 6);
  assert.equal(s.players[0].man, 5);
  assert.equal(s.switches, 2);
});

test('a screen switches in live play, found by the step itself, and not at an inbound, a dead ball or a free throw', () => {
  const liveOne = screened(), own = men(liveOne);
  step(liveOne, idle(10), DT);
  assert.equal(liveOne.players[0].man, 6, 'no switch in live play');
  for (const phase of ['inbound', 'dead']) {
    const s = screened();
    s.phase = phase; s.phaseT = 1;
    step(s, idle(10), DT);
    assert.deepEqual(men(s), own, phase);
  }
  const ft = screened();
  ft.freeThrow = newFreeThrow(9, 2);
  setupFreeThrow(ft);
  at(ft, 6, -6, 0); ft.players[6].setT = 1; at(ft, 0, -5.5, 0); at(ft, 5, -9.5, 0); at(ft, 1, -8.6, 0);
  step(ft, idle(10), DT);
  assert.deepEqual(men(ft), own, 'a free throw');
});

test('a stoppage after a switch leaves everyone on his own man, free to be switched again', () => {
  const s = screened();
  screenSwitches(s, [[0, 6]], DT);
  at(s, 9, -3, 9);   // the handler steps out of bounds
  assert.ok(run(s, 1, idle(10), m => m.phase === 'dead'), 'no whistle');
  ownMen(s);
  assert.ok(s.players.every(p => p.switchWait === 0));
});

// Five a side, live, team 0 with the ball and about to lose it. Team 1's attackers-to-be stand in a row; `place(i)`
// says where defender-to-be i of team 0 stands.
function turnover(place) {
  const s = live(1, 5);
  for (let i = 0; i < 5; i++) { at(s, 5 + i, -5, (i - 2) * 2.4); const [x, z] = place(i); at(s, i, x, z); }
  return s;
}

test('getting back: a team caught far from its own men takes the nearest, and a team near its own men changes nothing', () => {
  // Each stands a metre from the man of the next defender in the order.
  const far = turnover(i => [-4, ((i + 1) % 5 - 2) * 2.4]);
  giveBall(far, far.players[5]);
  for (let i = 0; i < 5; i++) assert.equal(far.players[i].man, 5 + (i + 1) % 5, `defender ${i}`);
  assert.equal(far.switches, 1);
  oneToOne(far);

  const near = turnover(i => [-4, (i - 2) * 2.4]), before = men(near);
  giveBall(near, near.players[5]);
  assert.deepEqual(men(near), before);
  assert.equal(near.switches, 0);
});

test('getting back: a saving under the least worth making, or none at all, changes nothing; one just over it does', () => {
  // Defenders 0 and 1 each stand a metre from the other's man; the men are `gap` apart. The rest are on their own.
  const crossed = gap => {
    const s = turnover(i => [-4, (i - 2) * 2.4]);
    at(s, 5, -5, -20 - gap); at(s, 6, -5, -20);
    at(s, 0, -4, -20); at(s, 1, -4, -20 - gap);
    return s;
  };
  const saving = gap => 2 * (Math.hypot(1, gap) - 1);
  assert.ok(saving(3.82) < MATCHUP.save && saving(3.95) > MATCHUP.save, 'the test is built for the saving in the plan');
  const under = crossed(3.82), before = men(under);
  giveBall(under, under.players[7]);
  assert.deepEqual(men(under), before, 'a saving just under');
  const over = crossed(3.95);
  giveBall(over, over.players[7]);
  assert.deepEqual([over.players[0].man, over.players[1].man], [6, 5], 'a saving just over');
  // Two defenders on one spot between their men: either way round is as far.
  const tie = turnover(i => [-4, (i - 2) * 2.4]);
  at(tie, 0, -4, -3.6); at(tie, 1, -4, -3.6);
  const same = men(tie);
  giveBall(tie, tie.players[7]);
  assert.deepEqual(men(tie), same, 'a tie');
});

test('getting back is not made when the ball is given at an inbound', () => {
  const s = turnover(i => [-4, ((i + 1) % 5 - 2) * 2.4]), before = men(s);
  s.phase = 'inbound';
  giveBall(s, s.players[5]);
  assert.deepEqual(men(s), before);
});

test('whole matches with switching, three a side and five: they end, both score, every attacker always has one defender, switches happen but no more than two a possession', () => {
  for (const size of [3, 5]) {
    let switches = 0, changes = 0;
    for (const seed of [1, 2, 3]) {
      const s = createMatch(seed, size); startMatch(s);
      let steps = 0, had = s.possession;
      while (s.phase !== 'final' && steps < 400000) {
        step(s, aiIntents(s, DT), DT); steps++;
        if (s.possession !== had) { changes++; had = s.possession; }
        if (steps % 30 === 0) oneToOne(s, `${size} a side, seed ${seed}`);
      }
      assert.equal(s.phase, 'final', `${size} a side, seed ${seed} never ended`);
      assert.ok(s.score[0] >= 10 && s.score[1] >= 10, `${size} a side, seed ${seed}: ${s.score}`);
      switches += s.switches;
    }
    assert.ok(switches > 0, `${size} a side: nobody ever switched`);
    assert.ok(switches / changes <= 2, `${size} a side: ${switches} switches in ${changes} possessions`);
  }
});
