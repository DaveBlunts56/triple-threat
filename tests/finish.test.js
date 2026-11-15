// Finishes at the rim: the layup and the dunk (spec: docs/superpowers/specs/2026-11-14-dunks-layups-design.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINISH, RIM, SHOT, BALL } from '../src/sim/tuning.js';
import { finishFor, canDunk, closing, finishHand, takeoffSpot, gatherVelocity, jumpVelocity } from '../src/sim/finish.js';
import { personOf } from '../src/sim/state.js';
import { live, at } from './helpers.js';

const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;
const rate = (s, id, key, value) => { personOf(s, s.players[id]).ratings[key] = value; };
// Player 0 (team 0, attacking the hoop at +RIM.x) `out` metres in front of the rim, `z` across, moving at it at `speed`.
function driving(out, speed, z = 0) {
  const s = live(); at(s, 0, RIM.x - out, z);
  const far = Math.hypot(out, z) || 1;
  s.players[0].vx = (speed * out) / far; s.players[0].vz = (-speed * z) / far;
  return s;
}
const speedOf = v => Math.hypot(v.vx, v.vz);

test('Space is a layup only driving at the rim from layup range', () => {
  const s = driving(3, 4);
  assert.equal(finishFor(s, s.players[0], 'shoot'), 'layup');
  for (const [out, speed] of [[3, 1.5], [3, -4], [1.0, 4], [5, 4]]) { const t = driving(out, speed); assert.equal(finishFor(t, t.players[0], 'shoot'), null, `${out} m at ${speed} m/s`); }
  assert.ok(near(closing(s.players[0], { x: RIM.x, z: 0 }), 4));
});

test('R is a dunk for a finisher with legs left, a layup for anyone else in range, and nothing out of it', () => {
  const s = driving(3, 4); rate(s, 0, 'inside', FINISH.dunkAt);
  assert.equal(canDunk(s, s.players[0]), true);
  assert.equal(finishFor(s, s.players[0], 'dunk'), 'dunk');
  assert.equal(finishFor(s, s.players[0], 'shoot'), 'layup');                 // Space never dunks
  rate(s, 0, 'inside', FINISH.dunkAt - 1); assert.equal(finishFor(s, s.players[0], 'dunk'), 'layup');
  rate(s, 0, 'inside', 90); personOf(s, s.players[0]).energy = FINISH.dunkEnergy - 0.05; assert.equal(finishFor(s, s.players[0], 'dunk'), 'layup');
  const far = driving(6, 4); rate(far, 0, 'inside', 90); assert.equal(finishFor(far, far.players[0], 'dunk'), null);
  const slow = driving(3, 1); rate(slow, 0, 'inside', 90); assert.equal(finishFor(slow, slow.players[0], 'dunk'), null);
});

test('behind the backboard, or past it, there is no finish', () => {
  const s = live(); at(s, 0, RIM.x + 0.9, 0.3); s.players[0].vx = -4; rate(s, 0, 'inside', 90);
  assert.equal(finishFor(s, s.players[0], 'shoot'), null);
  assert.equal(finishFor(s, s.players[0], 'dunk'), null);
  const beside = live(); at(beside, 0, RIM.x + 0.1, 2.5); beside.players[0].vz = -4;   // along the baseline, in front of the board's plane
  assert.equal(finishFor(beside, beside.players[0], 'shoot'), 'layup');
});

test('the hand is the one on his side of the rim; straight on, the right; and the mirror for the other team', () => {
  const s = live();
  at(s, 0, RIM.x - 3, 2); assert.equal(finishHand(s.players[0]), 'right');     // facing +x his right is +z
  at(s, 0, RIM.x - 3, -2); assert.equal(finishHand(s.players[0]), 'left');
  at(s, 0, RIM.x - 3, 0); assert.equal(finishHand(s.players[0]), 'right');
  at(s, 3, -RIM.x + 3, 2); assert.equal(finishHand(s.players[3]), 'left');     // team 1 faces -x: his right is -z
  at(s, 3, -RIM.x + 3, -2); assert.equal(finishHand(s.players[3]), 'right');
});

test('the gather carries him to the take-off spot in FINISH.gather, never faster than FINISH.gatherSpeed, and not at all from inside it', () => {
  const s = driving(3.2, 6), v = gatherVelocity(s.players[0], 'dunk');
  assert.ok(near(speedOf(v), (3.2 - FINISH.takeoff.dunk) / FINISH.gather) && v.vx > 0 && near(v.vz, 0));
  assert.ok(near(speedOf(gatherVelocity(driving(4.5, 6).players[0], 'layup')), FINISH.gatherSpeed));
  assert.deepEqual(gatherVelocity(driving(1.5, 6).players[0], 'dunk'), { vx: 0, vz: 0 });
  const spot = takeoffSpot(driving(3, 4, 1).players[0], 'layup');
  assert.ok(near(Math.hypot(spot.x - RIM.x, spot.z), FINISH.takeoff.layup) && spot.z > 0 && spot.x < RIM.x);
});

test('the jump carries him to FINISH.arrive in front of the rim at the finish\'s moment', () => {
  const dunk = driving(FINISH.takeoff.dunk, 0), t = FINISH.dunkMoment * 2 * FINISH.jump.dunk / BALL.gravity;
  const v = jumpVelocity(dunk.players[0], 'dunk');
  assert.ok(near(v.vx * t, FINISH.takeoff.dunk - FINISH.arrive.dunk) && near(v.vz, 0));
  const layup = driving(FINISH.takeoff.layup, 0), up = SHOT.bestAt * FINISH.jump.layup / BALL.gravity;
  assert.ok(near(jumpVelocity(layup.players[0], 'layup').vx * up, FINISH.takeoff.layup - FINISH.arrive.layup));
  assert.deepEqual(jumpVelocity(driving(0.3, 0).players[0], 'dunk'), { vx: 0, vz: 0 });   // nearer than he would arrive: straight up
});
