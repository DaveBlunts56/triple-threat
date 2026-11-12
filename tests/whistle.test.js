import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/step.js';
import { COURT, DT, RIM } from '../src/sim/tuning.js';
import { live, idle, run, freeBall, shotAt } from './helpers.js';

const aboveHoop = sign => ({ x: sign * RIM.x, y: 3.5, z: 0 });
const called = (kind, team) => ({ kind, team, ball: 1 - team, number: null, shots: 0 });

// `team` is about to inbound from the sideline at half court.
function toInbound(s, team) {
  s.possession = team;
  s.inboundSpot = { x: 0, z: COURT.halfWidth + 0.5 };
  s.phase = 'dead'; s.phaseT = 0;
  step(s, idle(), DT);
  assert.equal(s.phase, 'inbound');
}

test('out of bounds is recorded as a call against the team that touched it last', () => {
  const s = live(); s.lastTouch = 0;
  freeBall(s, { x: 0, y: 0.12, z: 8 });                // on the floor outside the sideline
  run(s, 0.1);
  assert.deepEqual(s.call, called('out', 0));
});

test('a shot-clock violation is recorded as a call', () => {
  const s = live(); s.shotClock = 0.01;
  step(s, idle(), DT);
  assert.deepEqual(s.call, called('shotClock', 0));
});

test('a basket is not a call, and the shot clock is 24 afterwards whoever had the ball', () => {
  const s = live(); s.call = called('out', 0); s.shotClock = 5;
  freeBall(s, aboveHoop(-1));                          // drops into team 0's own hoop while team 0 has possession
  run(s, 1, idle(), st => st.phase !== 'live');
  assert.deepEqual([s.score, s.possession, s.call, s.shotClock], [[0, 2], 0, null, 24]);
});

test('the shot clock keeps its time when the same team inbounds', () => {
  const s = live(); s.shotClock = 10; s.lastTouch = 1;  // knocked out by the defence
  freeBall(s, { x: 0, y: 0.12, z: 8 });
  run(s, 3, idle(), st => st.phase === 'inbound');
  assert.equal(s.possession, 0);
  assert.ok(Math.abs(s.shotClock - 10) < 0.1, `shot clock ${s.shotClock}`);
});

test('the shot clock is 24 when the other team inbounds', () => {
  const s = live(); s.shotClock = 10; s.lastTouch = 0;
  freeBall(s, { x: 0, y: 0.12, z: 8 });
  run(s, 3, idle(), st => st.phase === 'inbound');
  assert.deepEqual([s.possession, s.shotClock], [1, 24]);
});

test('an inbounder who holds the ball for 5 seconds loses it', () => {
  const s = live(); toInbound(s, 0);
  const spot = { ...s.inboundSpot };
  run(s, 4.9);
  assert.equal(s.phase, 'inbound');
  run(s, 0.2);
  assert.equal(s.phase, 'dead');
  assert.deepEqual(s.call, called('fiveSeconds', 0));
  assert.deepEqual([s.possession, s.inboundSpot], [1, spot]);
});

test('the 5-second count starts again for the next inbounder', () => {
  const s = live(); toInbound(s, 0);
  run(s, 4);
  toInbound(s, 1);
  run(s, 4);
  assert.equal(s.phase, 'inbound');
});
