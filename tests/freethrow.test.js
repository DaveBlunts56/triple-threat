import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyIntent } from '../src/sim/state.js';
import { newFreeThrow, ftChance, setupFreeThrow } from '../src/sim/freethrow.js';
import { step } from '../src/sim/step.js';
import { COURT, DT, FT } from '../src/sim/tuning.js';

// Metres from the baseline of the +x hoop, as a place on the court.
const X = fromBaseline => COURT.halfLength - fromBaseline;
import { live, idle, only, run, firstSeed, ai, press, pressWhenAiming } from './helpers.js';

// Player 0 (or player 3 for team 1) is on the line with `shots` free throws to come.
function shooting(seed, shots, team = 0) {
  const s = live(seed);
  s.freeThrow = newFreeThrow(team * 3, shots);
  setupFreeThrow(s);
  return s;
}

// Share of 200 single free throws that score with the meter parked at `meter`.
function rate(meter, energy = 1) {
  let made = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = shooting(seed, 1);
    Object.assign(s.freeThrow, { meter, dir: 0 });
    s.rosters[0][0].energy = energy;
    press(s);
    run(s, 8, idle(), st => st.phase !== 'freeThrow');
    made += s.score[0];
  }
  return made / 200;
}

// A single free throw that goes in, played until the whistle.
const madeLast = () => firstSeed(seed => { const st = shooting(seed, 1); Object.assign(st.freeThrow, { meter: 0.5, dir: 0 }); press(st); return st; },
  st => run(st, 8, idle(), x => x.phase !== 'freeThrow') && st.score[0] === 1);

test('the odds run in a straight line from 95% at the centre to 20% at the edges', () => {
  assert.deepEqual([0.5, 0, 1].map(ftChance), [0.95, 0.2, 0.2]);
  assert.ok(Math.abs(ftChance(0.25) - 0.575) < 1e-9);
});

test('setup puts the shooter on the line with the ball and the other five in their spots', () => {
  const s = shooting(1, 2);
  const p = s.players[0];
  assert.deepEqual([s.phase, s.ball.holder, s.shotClock, p.x, p.z], ['freeThrow', 0, 24, X(FT.lineDist), 0]);
  assert.deepEqual([1, 2].map(i => [s.players[i].x, s.players[i].z]), [[X(3.7), -2.75], [X(3.7), 2.75]]);
  assert.deepEqual([3, 4, 5].map(i => [s.players[i].x, s.players[i].z]), [[X(2.3), -2.75], [X(2.3), 2.75], [X(FT.defence[2][0]), 2]]);
  assert.ok(s.players.every(q => !q.inbounder && q.vx === 0 && q.vz === 0));
});

test('for team 1 everything is mirrored', () => {
  const s = shooting(1, 2, 1);
  assert.deepEqual([s.ball.holder, s.players[3].x, s.players[3].z], [3, -X(FT.lineDist), 0]);
  assert.deepEqual([4, 5].map(i => [s.players[i].x, s.players[i].z]), [[-X(3.7), -2.75], [-X(3.7), 2.75]]);
  assert.deepEqual([0, 1, 2].map(i => [s.players[i].x, s.players[i].z]), [[-X(2.3), -2.75], [-X(2.3), 2.75], [-X(FT.defence[2][0]), 2]]);
});

test('the marker crosses the bar 1.5 times a second and turns at the ends', () => {
  const s = shooting(1, 2);
  run(s, 1 / 3);
  assert.ok(Math.abs(s.freeThrow.meter - 0.5) < 0.03);
  run(s, 2 / 3);                                        // one second in all: to the end and half-way back
  assert.ok(Math.abs(s.freeThrow.meter - 0.5) < 0.03);
});

test('nobody else can move before the last attempt is released', () => {
  const s = shooting(1, 2); const before = s.players.map(p => [p.x, p.z]);
  run(s, 1, s.players.map((_, i) => ({ ...emptyIntent(), moveX: i ? 1 : 0, sprint: true })));
  assert.deepEqual(s.players.map(p => [p.x, p.z]), before);
});

test('Space held from before the meter appeared does not shoot; a fresh press does', () => {
  const s = shooting(1, 2);
  run(s, 0.5, only(0, { shoot: true }));
  assert.equal(s.freeThrow.stage, 'aim');
  step(s, idle(), DT);
  step(s, only(0, { shoot: true }), DT);
  assert.equal(s.freeThrow.stage, 'flight');
});

test('dead centre makes about 95%, the edge about 20%', () => {
  assert.ok(Math.abs(rate(0.5) - 0.95) < 0.06, `centre ${rate(0.5)}`);
  assert.ok(Math.abs(rate(0) - 0.2) < 0.1, `edge ${rate(0)}`);
});

test('an exhausted shooter makes 80% as often', () => {
  assert.ok(Math.abs(rate(0.5, 0) - 0.76) < 0.1, `exhausted ${rate(0.5, 0)}`);
});

test('a made free throw is worth 1 point', () => {
  assert.deepEqual(madeLast().score, [1, 0]);
});

test('after the first of two the ball comes back to the shooter', () => {
  const s = shooting(1, 2); press(s);
  run(s, 6, idle(), st => st.freeThrow?.stage === 'aim' && st.freeThrow.left === 1);
  assert.deepEqual([s.freeThrow.left, s.ball.holder, s.phase], [1, 0, 'freeThrow']);
});

test('no press within 5 seconds counts as a miss', () => {
  const s = shooting(1, 1);
  run(s, 4.9);
  assert.equal(s.freeThrow.stage, 'aim');
  run(s, 8, idle(), st => st.phase !== 'freeThrow');
  assert.deepEqual(s.score, [0, 0]);
});

test('the computer shoots after about a second and makes about 75%', () => {
  let made = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = shooting(seed, 1, 1);
    run(s, 1.2);
    assert.equal(s.freeThrow.stage, 'flight');
    run(s, 8, idle(), st => st.phase !== 'freeThrow');
    made += s.score[1];
  }
  assert.ok(Math.abs(made / 200 - FT.aiChance) < 0.08, `made ${made}/200`);
});

test('a computer player shooting for team 0 stops the meter himself, for about the same odds', () => {
  let made = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = shooting(seed, 1);
    run(s, 8, ai, st => st.phase !== 'freeThrow');
    made += s.score[0];
  }
  assert.ok(Math.abs(made / 200 - FT.aiChance) < 0.1, `made ${made}/200`);
});

test('a missed last attempt is a live rebound and the clocks start when someone has the ball', () => {
  const s = firstSeed(seed => { const st = shooting(seed, 1); st.freeThrow.meter = 0; st.freeThrow.dir = 0; press(st); return st; },
    st => run(st, 8, ai, x => x.phase === 'live'));
  assert.deepEqual([s.freeThrow, s.score], [null, [0, 0]]);
  assert.notEqual(s.ball.holder, null);
  const clock = s.gameClock; run(s, 0.5, ai);
  assert.ok(s.gameClock < clock);
});

test('a made last attempt gives the other team the ball under that hoop', () => {
  const s = madeLast();
  assert.deepEqual([s.phase, s.call, s.possession, s.inboundSpot.x, s.score, s.freeThrow], ['dead', null, 1, COURT.halfLength + 0.5, [1, 0], null]);
});

test('with the period clock at zero the free throws are shot and then the period ends', () => {
  const s = shooting(1, 2); s.gameClock = 0;
  const phases = new Set();
  run(s, 30, pressWhenAiming, st => { phases.add(st.phase); return st.phase === 'quarterEnd'; });
  assert.deepEqual([...phases], ['freeThrow', 'quarterEnd']);   // never a live rebound, never an inbound
  assert.equal(s.freeThrow, null);
});
