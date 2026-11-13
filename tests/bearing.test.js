// tests/bearing.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeFacing, leanOf, lookTarget, headTurn, easeHead, MOTION } from '../src/render/motion.js';
import { chestTip, LEG_CLIPS, ARM_CLIPS } from '../src/render/motion.js';
import { emptyIntent } from '../src/sim/state.js';
import { passBall } from '../src/sim/players.js';
import { PLAYER, RIM } from '../src/sim/tuning.js';
import { live, at } from './helpers.js';

const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;
const deg = r => (r * 180) / Math.PI, rad = d => (d * Math.PI) / 180;

test('the drawn heading turns at 900 degrees a second at most, the short way round', () => {
  assert.ok(near(deg(easeFacing(0, rad(90), 1 / 60)), 15));                // 900 / 60
  assert.ok(near(deg(easeFacing(0, rad(10), 1 / 60)), 10));                // close enough: it arrives
  assert.ok(near(deg(easeFacing(rad(170), rad(-170), 1 / 60)), -175));     // through 180, not back through 0
  let drawn = 0, frames = 0;
  while (Math.abs(drawn - Math.PI) > 1e-9 && frames < 100) { drawn = easeFacing(drawn, Math.PI, 1 / 60); frames++; }
  assert.equal(frames, 12);                                                // a half turn takes 0.2 s
  assert.equal(easeFacing(1, 2, 0), 1);                                    // paused: nothing turns
});

test('the body tips into speeding up, back when stopping and into a turn, and never past its limits', () => {
  const rest = { forward: 0, side: 0 }, from = { vx: 0, vz: 0 };
  const start = leanOf(rest, from, { vx: PLAYER.accel / 60, vz: 0 }, 0, 1 / 60);        // full acceleration, facing +x
  assert.ok(start.forward > 0 && near(start.side, 0) && near(deg(start.forward), 12 * (1 - Math.exp(-1 / 9))), `${deg(start.forward)}`);
  let lean = rest;
  for (let i = 0; i < 120; i++) lean = leanOf(lean, { vx: 0, vz: 0 }, { vx: 5, vz: 0 }, 0, 1 / 60);   // far beyond what a player can do
  assert.ok(near(deg(lean.forward), 12, 1e-3));                            // held at 12 degrees
  for (let i = 0; i < 120; i++) lean = leanOf(lean, { vx: 5, vz: 0 }, { vx: 0, vz: 0 }, 0, 1 / 60);
  assert.ok(near(deg(lean.forward), -12, 1e-3));                           // stopping: tipped back
  for (let i = 0; i < 120; i++) lean = leanOf(lean, { vx: 5, vz: 0 }, { vx: 5, vz: -5 }, 0, 1 / 60);   // pushed toward -z: his left
  assert.ok(near(deg(lean.side), 10, 1e-3) && near(deg(lean.forward), 0, 1e-3));
  for (let i = 0; i < 120; i++) lean = leanOf(lean, { vx: 5, vz: 0 }, { vx: 5, vz: 0 }, 0, 1 / 60);
  assert.ok(Math.abs(deg(lean.side)) < 0.01);                              // steady speed: upright again
  assert.deepEqual(leanOf(start, from, { vx: 3, vz: 0 }, 0, 0), start);    // paused: nothing moves
  assert.ok(leanOf(start, from, { vx: 3, vz: 0 }, 0, 1 / 60, false).forward < start.forward);   // in the air he straightens
});

test('each head has something to look at: the ball, his man, the hoop, the nearest defender or his receiver', () => {
  const s = live();                                      // player 0 has the ball at (5, -3); team 1 stands at x = -5
  const eyes = o => ({ x: o.x, y: MOTION.eye, z: o.z }), hoop = { x: RIM.x, y: RIM.height, z: 0 }, look = id => lookTarget(s, s.players[id]);
  assert.deepEqual(look(0), hoop);                       // nobody within 4 m of the ball handler
  at(s, 3, 7, -3);
  assert.deepEqual(look(0), eyes(s.players[3]));         // his defender is close
  assert.deepEqual(look(3), eyes(s.players[0]));         // a defender within 4 m of his man watches him
  assert.deepEqual(look(4), { x: s.ball.x, y: s.ball.y, z: s.ball.z });   // his man is 10 m away: he watches the ball
  assert.deepEqual(look(1), { x: s.ball.x, y: s.ball.y, z: s.ball.z });   // a team-mate without the ball
  s.players[0].shooting = true;
  assert.deepEqual(look(0), hoop);                       // a shooter looks at the hoop, whoever is near
  s.players[0].shooting = false;
  passBall(s, s.players[0], { ...emptyIntent(), moveZ: 1 });
  assert.deepEqual(look(0), eyes(s.players[1]));         // the passer watches his receiver
  assert.deepEqual(look(1), { x: s.ball.x, y: s.ball.y, z: s.ball.z });   // the receiver watches it in
  s.phase = 'final';
  assert.equal(look(1), null);                           // before and after a match nobody stares at the ball
});

test('the head turns up to 70 degrees sideways and 30 up or down, and eases there', () => {
  const p = { x: 0, y: 0, z: 0 };
  assert.deepEqual(headTurn(p, 0, null), { yaw: 0, pitch: 0 });
  const right = headTurn(p, 0, { x: 3, y: MOTION.eye, z: 3 });
  assert.ok(near(deg(right.yaw), 45) && near(right.pitch, 0));             // +z is to the right of a player facing +x
  assert.ok(near(deg(headTurn(p, 0, { x: -3, y: MOTION.eye, z: -1 }).yaw), -70));       // behind him on the left: as far as the neck goes
  assert.ok(near(deg(headTurn(p, Math.PI / 2, { x: 0, y: MOTION.eye, z: 5 }).yaw), 0));  // measured from where he is drawn facing
  assert.ok(near(deg(headTurn(p, 0, { x: 1, y: 3.05, z: 0 }).pitch), 30));               // under the hoop: 30 at most
  assert.ok(near(deg(headTurn(p, 0, { x: 4, y: 0.12, z: 0 }).pitch), deg(Math.atan2(0.12 - MOTION.eye, 4))));
  assert.ok(near(deg(headTurn({ ...p, y: 0.5 }, 0, { x: 4, y: MOTION.eye + 0.5, z: 0 }).pitch), 0));   // his eyes rise with his jump
  let head = { yaw: 0, pitch: 0 };
  for (let i = 0; i < 15; i++) head = easeHead(head, { yaw: 1, pitch: -0.5 }, 1 / 60);   // a quarter of a second
  assert.ok(near(head.yaw, 1 - Math.exp(-2), 1e-6) && near(head.pitch, -0.5 * (1 - Math.exp(-2)), 1e-6));
  assert.deepEqual(easeHead(head, { yaw: 0, pitch: 0 }, 0), head);
});

// ---- the chest (an addition to the brief) ----

test('the chest bends to a dribble on upright legs and comes up under a hand-made pose on leaning legs, by the share each shows', () => {
  const none = Object.fromEntries([...LEG_CLIPS, ...ARM_CLIPS].map(name => [name, 0]));
  const tip = (pitch, shares) => chestTip(rad(pitch), { ...none, ...shares });
  const dribble = MOTION.chestDribble, made = MOTION.chestMade;
  assert.equal(tip(5, { walk: 1 }), 0);                                    // the arms follow the legs: nothing
  assert.equal(tip(50, { sprint: 0.4, run: 0.6 }), 0);
  assert.ok(near(tip(5, { dribble: 1 }), rad(dribble - 5)));               // upright legs: forward to the dribble's lean
  assert.ok(near(tip(5, { dribbleLeft: 1 }), rad(dribble - 5)));
  assert.equal(tip(dribble + 10, { dribble: 1 }), 0);                      // leaning further already: left alone
  for (const clip of ARM_CLIPS.filter(name => !name.startsWith('dribble'))) {
    assert.ok(near(tip(made + 25, { [clip]: 1 }), rad(-25)), clip);        // leaning legs: back up
    assert.equal(tip(made - 10, { [clip]: 1 }), 0, clip);                  // upright legs: left alone
  }
  assert.ok(near(tip(5, { dribble: 0.5, walk: 0.5 }), rad(dribble - 5) / 2));                 // half shown: half the bend
  assert.ok(near(tip(made + 8, { dribble: 0.25, catch: 0.75 }), 0.25 * rad(dribble - made - 8) - 0.75 * rad(8)));
});
