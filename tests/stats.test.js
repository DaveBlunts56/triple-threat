import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAT_KEYS, emptyLine, gameScore, note, playerOfGame, teamLine } from '../src/sim/stats.js';
import { SHOT_BEST, giveBall, passBall, releaseShot, trySteal } from '../src/sim/players.js';
import { substitute } from '../src/sim/roster.js';
import { createMatch, emptyIntent, personOf } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { rimCentre } from '../src/sim/ball.js';
import { DT } from '../src/sim/tuning.js';
import { live, idle, only, at, run, firstSeed } from './helpers.js';

const line = (s, id) => personOf(s, s.players[id]).stats;
const rim = rimCentre(1);   // team 0 attacks the hoop on +x
// Player 0 `out` metres from the hoop, alone, with everyone else far away and no coach.
function shooter(out, seed = 1) {
  const s = live(seed);
  s.playWait = [Infinity, Infinity]; s.tempo = { clock: Infinity, wait: 0 };
  s.players.forEach((p, i) => { if (i) at(s, i, -11, (i - 3) * 2); });
  at(s, 0, rim.x - out, 0);
  return s;
}
// He shoots, letting go at the best moment, and the ball is followed until it scores, is held again or play stops.
function shoot(s, seconds = 4) {
  for (let t = 0; t < SHOT_BEST - DT / 2; t += DT) step(s, only(0, { shoot: true }), DT);
  const before = [...s.score];
  run(s, seconds, idle(), st => st.score[0] !== before[0] || st.ball.holder !== null || st.phase !== 'live');
  return s.score[0] - before[0];
}

test('everybody starts with an empty line', () => {
  const s = createMatch();
  for (const person of s.rosters.flat()) assert.deepEqual(person.stats, emptyLine());
  assert.deepEqual(Object.keys(emptyLine()), STAT_KEYS);
  assert.deepEqual(s.teamStats, [{ lead: 0, run: 0, tov: 0 }, { lead: 0, run: 0, tov: 0 }]);
});

test('a made two is an attempt, a make and two points; a made three is those and a three made and tried', () => {
  const two = shooter(4);
  assert.equal(shoot(two), 2);                                         // green from 4 m with nobody near
  assert.deepEqual(line(two, 0), { ...emptyLine(), pts: 2, fgm: 1, fga: 1 });
  const three = firstSeed(seed => { const s = shooter(7.5, seed); s.made = shoot(s); return s; }, s => s.made === 3);
  assert.deepEqual(line(three, 0), { ...emptyLine(), pts: 3, fgm: 1, fga: 1, tpm: 1, tpa: 1 });
});

test('the basket is remembered for whoever watches: who, from where, how far, and whether it was green', () => {
  const s = firstSeed(seed => { const t = shooter(7.5, seed); t.made = shoot(t); return t; }, t => t.made === 3);
  const score = s.last.score;
  assert.deepEqual([score.team, score.by, score.row, score.points, score.assist, score.fouled], [0, 0, 0, 3, null, false]);
  assert.ok(Math.abs(score.far - 7.5) < 0.1, `from ${score.far}`);
  assert.equal(score.green, s.shot.green);
  assert.ok(score.at > score.shotAt && score.gap > 10);
  assert.deepEqual([score.tied, score.lead], [false, true]);           // 0-0 became 3-0
});

test('a miss is an attempt only, and the rebound goes to whoever takes it, on either team, offensive if his team missed', () => {
  // He lets go far too early from 6 m; the ball comes off the rim or the board and is loose.
  const missed = seed => { const s = shooter(6, seed); s.rosters[0][0].ratings.mid = 40;
    for (let t = 0; t < 0.12; t += DT) step(s, only(0, { shoot: true }), DT);
    run(s, 5, idle(), st => st.board || st.phase !== 'live'); return s; };
  for (const taker of [4, 1]) {
    const s = firstSeed(missed, st => st.board && st.phase === 'live' && st.score[0] === 0);
    assert.deepEqual(line(s, 0), { ...emptyLine(), fga: 1 });
    giveBall(s, s.players[taker]);
    // Taken by the shooter's own team (player 1) it is an offensive rebound as well.
    assert.deepEqual(line(s, taker), { ...emptyLine(), reb: 1, orb: taker === 1 ? 1 : 0 });
    assert.equal(s.board, false);
    giveBall(s, s.players[2]);                                          // a ball handed on is no second rebound
    assert.equal(line(s, 2).reb, 0);
  }
});

test('a blocked shot is an attempt for the shooter and a block for the blocker', () => {
  const s = firstSeed(seed => {
    const t = shooter(4, seed);
    for (let u = 0; u < SHOT_BEST - DT / 2; u += DT) step(t, only(0, { shoot: true }), DT);
    Object.assign(t.players[3], { x: t.players[0].x + 0.8, z: 0, y: 0.6, vy: 0.1 });
    step(t, idle(), DT);
    return t;
  }, t => t.shot?.blocked);
  assert.deepEqual(line(s, 0), { ...emptyLine(), fga: 1 });
  assert.deepEqual(line(s, 3), { ...emptyLine(), blk: 1 });
  assert.deepEqual([s.last.block.by, s.last.block.on, s.last.block.chase], [3, 0, false]);
  assert.equal(s.board, true);                                         // whoever picks it up has a rebound
});

test('a blocker running at the hoop from behind the shooter makes it a chase-down', () => {
  const s = firstSeed(seed => {
    const t = shooter(3, seed);
    for (let u = 0; u < SHOT_BEST - DT / 2; u += DT) step(t, only(0, { shoot: true }), DT);
    t.players[0].facing = Math.PI;                                     // so the man behind him is in the block's arc
    Object.assign(t.players[3], { x: t.players[0].x - 0.8, z: 0, y: 0.6, vy: 0.1, vx: 5 });
    step(t, idle(), DT);
    return t;
  }, t => t.shot?.blocked);
  assert.equal(s.last.block.chase, true);
});

test('a pass caught and scored off within three seconds is an assist; after that it is not', () => {
  for (const [wait, assists] of [[2, 1], [3.5, 0]]) {
    const s = shooter(4);
    at(s, 0, rim.x - 3.5, 3); at(s, 1, rim.x - 3.5, 6); giveBall(s, s.players[1]);   // outside the key: he may stand there
    passBall(s, s.players[1], { ...emptyIntent(), moveZ: -1 });
    assert.ok(run(s, 2, idle(), st => st.ball.holder === 0), 'caught');
    assert.deepEqual(s.players[0].fed.row, 1);
    run(s, wait - SHOT_BEST, idle());
    assert.equal(shoot(s), 2);
    assert.equal(line(s, 1).ast, assists, `shot ${wait} s after the catch`);
    assert.equal(s.last.score.assist, assists ? 1 : null);
  }
});

test('a reach that wins the ball is a steal and a turnover', () => {
  const s = firstSeed(seed => { const t = shooter(6, seed); at(t, 3, t.players[0].x + 0.9, 0); t.players[0].facing = 0; t.won = trySteal(t, t.players[3]).won; return t; }, t => t.won);
  assert.equal(line(s, 3).stl, 1);
  assert.equal(line(s, 0).tov, 1);
  assert.deepEqual([s.last.steal.by, s.last.steal.on], [3, 0]);
});

test('a pass caught by the other team is a steal for the catcher and a turnover for the passer', () => {
  const s = shooter(6);
  at(s, 1, s.players[0].x, 5); at(s, 3, s.players[0].x, 2.5);          // a defender on the line of the pass
  passBall(s, s.players[0], { ...emptyIntent(), moveZ: 1 });
  assert.ok(run(s, 2, idle(), st => st.ball.holder !== null));
  assert.equal(s.ball.holder, 3);
  assert.equal(line(s, 3).stl, 1);
  assert.equal(line(s, 0).tov, 1);
  assert.equal(s.players[3].fed, null);
  assert.deepEqual([s.last.steal.by, s.last.steal.on], [3, 0]);
});

test('a travel is the traveller\'s turnover; a shot-clock violation is his team\'s', () => {
  const s = shooter(6);
  s.players[0].held = true;
  run(s, 3, only(0, { moveX: 1 }), st => st.call !== null);
  assert.equal(s.call.kind, 'travel');
  assert.equal(line(s, 0).tov, 1);
  const t = shooter(6); t.shotClock = 0.05;
  run(t, 1, idle(), st => st.call !== null);
  assert.equal(t.call.kind, 'shotClock');
  assert.equal(line(t, 0).tov, 0);
  assert.equal(teamLine(t, 0).tov, 1);
});

test('a player taken off keeps his line, and the man who comes on has his own', () => {
  const s = shooter(4);
  shoot(s);
  const row = s.players[0].person;
  assert.ok(substitute(s, 0, 5));
  assert.equal(s.rosters[0][row].stats.pts, 2);
  assert.deepEqual(line(s, 0), emptyLine());
});

test('a team\'s line is the sum of its players\'', () => {
  const s = createMatch();
  note(s, s.players[0], 'pts', 7); note(s, s.players[1], 'pts', 5); note(s, s.players[1], 'reb', 3);
  s.rosters[0][6].stats.ast = 4;                                       // a man on the bench
  assert.deepEqual(teamLine(s, 0), { ...emptyLine(), pts: 12, reb: 3, ast: 4 });
  assert.deepEqual(teamLine(s, 1), emptyLine());
});

test('the player of the game has the best line; level lines go to the team ahead', () => {
  const s = createMatch();
  Object.assign(s.rosters[1][2].stats, { pts: 20, fgm: 8, fga: 12, reb: 9 });
  Object.assign(s.rosters[0][1].stats, { pts: 12, fgm: 5, fga: 14 });
  assert.deepEqual(playerOfGame(s), { team: 1, row: 2 });
  assert.ok(gameScore(s.rosters[1][2].stats) > gameScore(s.rosters[0][1].stats));
  const t = createMatch();
  t.rosters[0][3].stats.pts = 10; t.rosters[1][4].stats.pts = 10; t.score = [50, 60];
  assert.deepEqual(playerOfGame(t), { team: 1, row: 4 });
});

test('through whole matches the box score adds up to the score, and no line is impossible', () => {
  for (const size of [3, 5]) for (const seed of [1, 2, 3, 4]) {
    const s = createMatch(seed, size); startMatch(s);
    let lead = [0, 0], steps = 0;
    while (s.phase !== 'final' && steps++ < 60 * 60 * 40) {
      step(s, aiIntents(s, DT), DT);
      for (const team of [0, 1]) lead[team] = Math.max(lead[team], s.score[team] - s.score[1 - team]);
    }
    assert.equal(s.phase, 'final');
    for (const team of [0, 1]) {
      const total = teamLine(s, team);
      assert.equal(total.pts, s.score[team], `size ${size} seed ${seed} team ${team}`);
      assert.equal(total.pts, 2 * (total.fgm - total.tpm) + 3 * total.tpm + total.ftm);
      assert.equal(s.teamStats[team].lead, lead[team]);
      for (const person of s.rosters[team]) {
        const l = person.stats;
        assert.ok(l.fgm <= l.fga && l.tpm <= l.tpa && l.ftm <= l.fta && l.tpm <= l.fgm && l.tpa <= l.fga, `${person.name}: ${JSON.stringify(l)}`);
      }
    }
    const [a, b] = [teamLine(s, 0), teamLine(s, 1)];
    assert.ok(a.reb + b.reb > 10 && a.reb + b.reb <= (a.fga - a.fgm) + (b.fga - b.fgm) + (a.fta - a.ftm) + (b.fta - b.ftm), `rebounds ${a.reb + b.reb}`);
    assert.equal(a.stl + b.stl <= a.tov + b.tov, true);
    assert.ok(a.ast + b.ast > 0 && a.ast <= a.fgm && b.ast <= b.fgm);
  }
});
