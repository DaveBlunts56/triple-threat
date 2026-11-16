// The hoop's clock, lights and rim flex (src/render/hoop.js): what they show, from the match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOOP, flexAngle, hoopShows } from '../src/render/hoop.js';
import { createMatch } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';

test('the clock on the board shows the shot clock in whole seconds and the game clock; nothing before a match', () => {
  const s = createMatch(1, 5);
  assert.deepEqual(hoopShows(s), { shot: '', clock: hoopShows(s).clock, red: false });
  startMatch(s); s.phase = 'live'; s.shotClock = 13.2; s.gameClock = 431.4;
  assert.deepEqual(hoopShows(s), { shot: '14', clock: '7:12', red: false });
});

test('the lights go red when the shot clock or the period runs out', () => {
  const s = createMatch(1, 5); startMatch(s); s.phase = 'live';
  s.shotClock = 0; assert.equal(hoopShows(s).red, true);
  s.shotClock = 10; s.gameClock = 0; s.phase = 'quarterEnd'; assert.equal(hoopShows(s).red, true);
  s.gameClock = 30; assert.equal(hoopShows(s).red, false);
});

test('a dunk pulls the rim down at once, and it springs back and settles within a second and a half', () => {
  assert.equal(flexAngle(-0.1), 0);
  assert.equal(flexAngle(0), HOOP.flex.angle);
  assert.ok(flexAngle(1 / (2 * HOOP.flex.hz)) < 0, 'it springs back past level');
  assert.ok(Math.abs(flexAngle(1)) < 0.01 * HOOP.flex.angle * 2, `still ${flexAngle(1)} after a second`);
  assert.equal(flexAngle(2), 0);
});
