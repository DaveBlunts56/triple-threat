import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giveBall } from '../src/sim/players.js';
import { matchupMark, MARK } from '../src/render/mark.js';
import { live, at } from './helpers.js';

// Five a side, live, you (player 0) at the centre spot; team 1 has the ball unless `mine`.
function scene(mine = false) {
  const s = live(1, 5);
  if (!mine) giveBall(s, s.players[9]);
  at(s, 0, 0, 0);
  return s;
}
const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} is not ${b}`);

test('defending: the ring is under your man and the arrow runs from you toward him, stopping short', () => {
  const s = scene();
  at(s, 5, 4, 3);
  const { ring, arrow } = matchupMark(s);
  assert.deepEqual(ring, { x: 4, z: 3 });
  close(arrow.length, 5 - MARK.start - MARK.stop, 'length');
  close(arrow.angle, Math.atan2(3, 4), 'angle');
  close(arrow.x, 0.8 * MARK.start, 'tail x'); close(arrow.z, 0.6 * MARK.start, 'tail z');
});

test('defending within a metre and a half: the ring only', () => {
  const s = scene();
  at(s, 5, 0, MARK.near);
  assert.deepEqual(matchupMark(s), { ring: { x: 0, z: MARK.near }, arrow: null });
  at(s, 5, 0, MARK.near + 0.01);
  assert.ok(matchupMark(s).arrow.length > 0);
});

test('attacking: the ring is under the defender guarding you, and there is no arrow', () => {
  const s = scene(true);
  at(s, 5, -2, 1);
  assert.deepEqual(matchupMark(s), { ring: { x: -2, z: 1 }, arrow: null });
  s.players[5].man = 1; s.players[6].man = 0;   // a switch: player 6 guards you now
  at(s, 6, 3, -1);
  assert.deepEqual(matchupMark(s).ring, { x: 3, z: -1 });
});

test('it follows the player you control, and a switch', () => {
  const s = scene();
  at(s, 5, 4, 3); at(s, 7, -6, 2); at(s, 8, 1, -5);
  s.controlled = 2;
  assert.deepEqual(matchupMark(s).ring, { x: -6, z: 2 });
  s.players[2].man = 8; s.players[3].man = 7;
  assert.deepEqual(matchupMark(s).ring, { x: 1, z: -5 });
});

test('shown in live play and at inbounds only', () => {
  const s = scene();
  for (const phase of ['start', 'jumpBall', 'dead', 'freeThrow', 'quarterEnd', 'final']) { s.phase = phase; assert.equal(matchupMark(s), null, phase); }
  for (const phase of ['live', 'inbound']) { s.phase = phase; assert.ok(matchupMark(s), phase); }
});
