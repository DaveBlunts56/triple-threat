import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/step.js';
import { DT } from '../src/sim/tuning.js';
import { live, idle, only, run } from './helpers.js';

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
  run(s, 0.3, only(0, { shoot: true }));
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
