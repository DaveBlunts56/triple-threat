import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SWEAT, createSweat } from '../src/render/sweat.js';

// A match as sweat.js reads it: who is on court (players' team and roster row), the rosters' numbers and energy, the
// match's seed and time.
const match = (seed = 1) => ({
  seed, time: 0,
  rosters: [[{ number: 4, energy: 1 }, { number: 7, energy: 1 }], [{ number: 5, energy: 1 }, { number: 8, energy: 1 }]],
  players: [{ team: 0, person: 0 }, { team: 1, person: 0 }],
});
const run = (sweat, state, seconds, tired = 0) => {
  for (let i = 0; i < seconds * 10; i++) {
    state.time += 0.1;
    for (const p of state.players) state.rosters[p.team][p.person].energy = Math.max(0, state.rosters[p.team][p.person].energy - tired * 0.1);
    sweat.update(state);
  }
};

test('on court a player sweats more with effort and over time, full after ten minutes of hard play and never more', () => {
  const sweat = createSweat(), state = match();
  run(sweat, state, 120, 0.0004);
  const two = sweat.of('player-0-4');
  assert.ok(two > 0.15 && two < 0.6, `${two} after two minutes`);
  assert.equal(sweat.of('player-0-7'), 0, 'on the bench he stays dry');
  run(sweat, state, 480, 0.0004);
  assert.equal(sweat.of('player-0-4'), 1);
  run(sweat, state, 60, 0.0004);
  assert.equal(sweat.of('player-0-4'), 1);
});

test('on the bench he dries in five minutes', () => {
  const sweat = createSweat(), state = match();
  run(sweat, state, 700, 0.0004);
  assert.equal(sweat.of('player-0-4'), 1);
  state.players[0].person = 1;   // he comes off
  run(sweat, state, 290);
  assert.ok(sweat.of('player-0-4') > 0, 'dry too soon');
  run(sweat, state, 20);
  assert.equal(sweat.of('player-0-4'), 0);
});

test('a new match starts everyone dry; frames whose time does not move on (a pause, a replay) change nothing', () => {
  const sweat = createSweat(), state = match();
  run(sweat, state, 300, 0.0004);
  const was = sweat.of('player-0-4');
  assert.ok(was > 0);
  sweat.update({ ...structuredClone(state), time: state.time - 5 });   // a replay of five seconds ago
  sweat.update(state);
  assert.equal(sweat.of('player-0-4'), was);
  sweat.update(match(2));
  assert.equal(sweat.of('player-0-4'), 0);
  assert.deepEqual(SWEAT, { perEnergy: 3, perSecond: 1 / 600, dry: 1 / 300 });
});
