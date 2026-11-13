import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/step.js';
import { giveBall } from '../src/sim/players.js';
import { keyContains } from '../src/sim/violations.js';
import { DT } from '../src/sim/tuning.js';
import { live, idle, only, run, at } from './helpers.js';

const called = (kind, team) => ({ kind, team, ball: 1 - team, number: null, shots: 0 });

test('two steps are allowed after picking up; a third is a travel', () => {
  const s = live(); const p = s.players[0]; Object.assign(p, { held: true, steps: 1.4 });
  step(s, idle(), DT);
  assert.equal(s.phase, 'live');
  p.steps = 1.51;
  step(s, idle(), DT);
  assert.equal(s.phase, 'dead');
  assert.deepEqual(s.call, called('travel', 0));
  assert.equal(s.possession, 1);
});

test('holding Space until you land is a travel', () => {
  const s = live();
  assert.ok(run(s, 1.2, only(0, { shoot: true }), st => st.phase === 'dead'), 'no whistle');
  assert.deepEqual(s.call, called('travel', 0));
});

test('dribbling again after picking up is a double dribble', () => {
  const s = live();
  step(s, only(0, { hold: true }), DT);
  step(s, idle(), DT);
  step(s, only(0, { hold: true }), DT);
  assert.equal(s.phase, 'dead');
  assert.deepEqual(s.call, called('doubleDribble', 0));
  assert.equal(s.possession, 1);
});

// Player 0 picks up his dribble, goes up, and does `last` while still in the air.
function jumpAfterPickup(last) {
  const s = live();
  step(s, only(0, { hold: true }), DT);
  run(s, 0.5, only(0, { shoot: true }));
  step(s, only(0, last), DT);
  return s;
}

test('a shot in the air after picking up is legal', () => {
  const s = jumpAfterPickup({});                       // lets go of Space
  assert.deepEqual([s.ball.mode, s.phase, s.call], ['shot', 'live', null]);
});

test('a pass in the air after picking up is legal', () => {
  const s = jumpAfterPickup({ shoot: true, pass: true });
  assert.deepEqual([s.ball.mode, s.phase, s.call], ['pass', 'live', null]);
});

test('keyContains: 4.9 m wide, 5.8 m deep, at the right end', () => {
  assert.equal(keyContains(10, 0, 1), true);
  assert.equal(keyContains(10, 2.5, 1), false);
  assert.equal(keyContains(8.1, 0, 1), false);         // the free-throw line is at x = 8.2
  assert.equal(keyContains(-10, 0, 1), false);
  assert.equal(keyContains(-10, 0, -1), true);
});

// Team 0 attacks +x, so x < 0 is its back court.
test('once the ball has been in the front court it cannot go back', () => {
  const s = live(); at(s, 0, 1, 0);
  step(s, idle(), DT);
  assert.equal(s.frontcourt, true);
  at(s, 0, -1, 0);
  step(s, idle(), DT);
  assert.deepEqual([s.phase, s.call.kind, s.call.team], ['dead', 'backcourt', 0]);
});

test('a player straddling half court is not called', () => {
  const s = live(); at(s, 0, 1, 0);
  step(s, idle(), DT);
  at(s, 0, -0.2, 0);
  step(s, idle(), DT);
  assert.equal(s.phase, 'live');
});

test('dribbling in the back court before crossing is not a violation', () => {
  const s = live(); at(s, 0, -5, 1.5);
  run(s, 1);
  assert.deepEqual([s.phase, s.frontcourt], ['live', false]);
});

test('a teammate catching a pass in the back court is called', () => {
  const s = live(); at(s, 0, 2, 0); at(s, 1, -3, 0);
  step(s, idle(), DT);
  assert.equal(s.frontcourt, true);
  step(s, only(0, { pass: true, moveX: -1 }), DT);
  assert.equal(s.ball.mode, 'pass');
  assert.ok(run(s, 1, idle(), st => st.phase === 'dead'), 'no whistle');
  assert.deepEqual([s.ball.holder, s.call.kind, s.call.team], [1, 'backcourt', 0]);
});

test('the ball may be recovered in the back court after a defender knocks it loose', () => {
  const s = live(); at(s, 0, 1, 0);
  step(s, idle(), DT);
  Object.assign(s.ball, { holder: null, mode: 'loose', x: -2, y: 0.5, z: 0, vx: 0, vy: 0, vz: 0 });
  step(s, idle(), DT);                                 // the ball is loose for a moment before anyone reaches it
  at(s, 0, -2, 0);
  run(s, 0.5);
  assert.deepEqual([s.ball.holder, s.phase, s.frontcourt], [0, 'live', false]);
});

test('8 seconds to cross half court', () => {
  const s = live(); at(s, 0, -5, 1.5);
  run(s, 7.9);
  assert.equal(s.phase, 'live');
  run(s, 0.2);
  assert.deepEqual([s.phase, s.call.kind, s.call.team], ['dead', 'eightSeconds', 0]);
});

test('the 8-second count restarts when the other team takes the ball', () => {
  const s = live(); at(s, 0, -5, 1.5);
  run(s, 5);
  assert.ok(s.backcourtT > 4.9);
  giveBall(s, s.players[3]);                           // x = -5 is team 1's front court
  step(s, idle(), DT);
  assert.deepEqual([s.backcourtT, s.frontcourt, s.controlTeam], [0, true, 1]);
});

test('3 seconds in the key', () => {
  const s = live(); at(s, 0, 6, 5); at(s, 1, 11, 0);    // the ball is in the front court; a teammate stands in the key
  run(s, 2.9);
  assert.equal(s.phase, 'live');
  run(s, 0.2);
  assert.deepEqual([s.phase, s.call.kind, s.call.team], ['dead', 'threeSeconds', 0]);
});

test('stepping out of the key restarts the count', () => {
  const s = live(); at(s, 0, 6, 5); at(s, 1, 11, 0);
  run(s, 2);
  at(s, 1, 11, 4);
  step(s, idle(), DT);
  at(s, 1, 11, 0);
  run(s, 2);
  assert.equal(s.phase, 'live');
});

test('the count pauses while he is in the air', () => {
  const s = live(); at(s, 0, 6, 5); at(s, 1, 11, 0);
  run(s, 3.5, () => { Object.assign(s.players[1], { y: 0.5, vy: 0 }); return idle(); });
  assert.equal(s.phase, 'live');
});

test('defenders may stand in their own key', () => {
  const s = live(); at(s, 0, 6, 5); at(s, 3, 11, 0);
  run(s, 4);
  assert.equal(s.phase, 'live');
});

test('nobody is counted while the ball is still in the back court', () => {
  const s = live(); at(s, 0, -5, 1.5); at(s, 1, 11, 0);
  run(s, 4);
  assert.deepEqual([s.phase, s.players[1].keyT], ['live', 0]);
});
