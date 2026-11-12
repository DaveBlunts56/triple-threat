import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personOf } from '../src/sim/state.js';
import { speedFactor, shotFactor, tire } from '../src/sim/stamina.js';
import { makeChance } from '../src/sim/players.js';
import { step } from '../src/sim/step.js';
import { DT, PLAYER } from '../src/sim/tuning.js';
import { live, idle, only, run } from './helpers.js';

// Puts player 0 at the given speed and intent, calls tire() for `seconds`, returns his energy.
function drain(velocity, intent, seconds) {
  const s = live();
  Object.assign(s.players[0], velocity);
  for (let t = 0; t < seconds; t += DT) tire(s, only(0, intent), DT);
  return personOf(s, s.players[0]).energy;
}

test('no penalty at half energy or above; 75% speed and 80% shooting at zero', () => {
  assert.deepEqual([1, 0.5, 0.25, 0].map(speedFactor), [1, 1, 0.875, 0.75]);
  assert.equal(shotFactor(0.5), 1);
  assert.ok(Math.abs(shotFactor(0.25) - 0.9) < 1e-9);
  assert.equal(shotFactor(0), 0.8);
});

test('ten seconds of sprinting costs 0.25, of running 0.06', () => {
  assert.ok(Math.abs(drain({ vx: 7 }, { moveX: 1, sprint: true }, 10) - 0.75) < 0.005);
  assert.ok(Math.abs(drain({ vx: 5 }, { moveX: 1 }, 10) - 0.94) < 0.005);
});

test('standing recovers 0.02 a second, the bench 0.03, and energy never passes 1', () => {
  const s = live(); personOf(s, s.players[0]).energy = 0.5; s.rosters[0][3].energy = 0.5;
  for (let i = 0; i < 600; i++) tire(s, idle(), DT);
  assert.ok(Math.abs(s.rosters[0][0].energy - 0.7) < 0.005);
  assert.ok(Math.abs(s.rosters[0][3].energy - 0.8) < 0.005);
  for (let i = 0; i < 6000; i++) tire(s, idle(), DT);
  assert.equal(s.rosters[0][3].energy, 1);
});

test('a jump costs 0.015', () => {
  const s = live();
  step(s, only(3, { shoot: true }), DT);               // a defender jumps
  assert.ok(Math.abs(s.rosters[1][0].energy - (1 - 0.015)) < 0.001);
});

test('an exhausted player sprints at 75% speed', () => {
  const s = live(); s.rosters[0][1].energy = 0;        // player 1, without the ball
  const hold = () => { s.rosters[0][1].energy = 0; return only(1, { moveX: 1, sprint: true }); };
  run(s, 1, hold);
  assert.ok(Math.abs(s.players[1].vx - 0.75 * PLAYER.sprint) < 0.05, `vx ${s.players[1].vx}`);
});

test('an exhausted shooter makes 80% as often', () => {
  const s = live(); const fresh = makeChance(s, s.players[0]);
  s.rosters[0][0].energy = 0;
  assert.ok(Math.abs(makeChance(s, s.players[0]) - 0.8 * fresh) < 1e-9);
});
