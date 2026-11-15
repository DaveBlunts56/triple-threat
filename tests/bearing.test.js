// tests/bearing.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeFacing, leanOf, lookTarget, headTurn, easeHead } from '../src/render/bearing.js';
import { MOTION } from '../src/render/motion.js';
import { chestTip } from '../src/render/bearing.js';
import { LEG_CLIPS, ARM_CLIPS, BENT_CLIPS } from '../src/render/motion.js';
import { emptyIntent } from '../src/sim/state.js';
import { passBall } from '../src/sim/players.js';
import { PLAYER, RIM } from '../src/sim/tuning.js';
import { live, at } from './helpers.js';
import { newFreeThrow, setupFreeThrow } from '../src/sim/freethrow.js';

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
  assert.deepEqual(look(4), { x: s.ball.x, y: MOTION.ballHeld, z: s.ball.z });   // his man is 10 m away: he watches the ball (held: at 1.1 m, ruling C)
  assert.deepEqual(look(1), { x: s.ball.x, y: MOTION.ballHeld, z: s.ball.z });   // a team-mate without the ball
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
  assert.ok(near(deg(headTurn(p, 0, { x: -1, y: MOTION.eye, z: -3 }).yaw), -70));       // on his left, a little behind: as far as the neck goes (ruling B)
  assert.deepEqual(headTurn(p, 0, { x: -3, y: MOTION.eye, z: -1 }), { yaw: 0, pitch: 0 });   // behind him on the left: he looks where he is going (ruling B)
  assert.ok(near(deg(headTurn(p, Math.PI / 2, { x: 0, y: MOTION.eye, z: 5 }).yaw), 0));  // measured from where he is drawn facing
  assert.ok(near(deg(headTurn(p, 0, { x: 1, y: 3.05, z: 0 }).pitch), 30));               // under the hoop: 30 at most
  assert.ok(near(deg(headTurn(p, 0, { x: 4, y: 0.12, z: 0 }).pitch), deg(Math.atan2(0.12 - MOTION.eye, 4))));
  assert.ok(near(deg(headTurn({ ...p, y: 0.5 }, 0, { x: 4, y: MOTION.eye + 0.5, z: 0 }).pitch), 0));   // his eyes rise with his jump
  let head = { yaw: 0, pitch: 0 };
  for (let i = 0; i < 15; i++) head = easeHead(head, { yaw: 0.5, pitch: -0.25 }, 1 / 60);   // a quarter of a second (half the turn: ruling B)
  assert.ok(near(head.yaw, 0.5 * (1 - Math.exp(-2)), 1e-6) && near(head.pitch, -0.25 * (1 - Math.exp(-2)), 1e-6));
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
  for (const clip of ARM_CLIPS.filter(name => !name.startsWith('dribble') && !BENT_CLIPS.includes(name))) {
    assert.ok(near(tip(made + 25, { [clip]: 1 }), rad(-25)), clip);        // leaning legs: back up
    assert.equal(tip(made - 10, { [clip]: 1 }), 0, clip);                  // upright legs: left alone
  }
  assert.ok(near(tip(5, { dribble: 0.5, walk: 0.5 }), rad(dribble - 5) / 2));                 // half shown: half the bend
  assert.ok(near(tip(made + 8, { dribble: 0.25, catch: 0.75 }), 0.25 * rad(dribble - made - 8) - 0.75 * rad(8)));
  // A crossover and between the legs are made bent well over: they are let lean to MOTION.chestLow, and brought back only from further.
  assert.deepEqual([...BENT_CLIPS].sort(), ['betweenLegs', 'betweenLegsLeft', 'crossover', 'crossoverLeft']);
  for (const clip of BENT_CLIPS) {
    assert.ok(near(tip(MOTION.chestLow + 20, { [clip]: 1 }), rad(-20)), clip);
    assert.equal(tip(MOTION.chestLow - 5, { [clip]: 1 }), 0, clip);
  }
  assert.ok(MOTION.chestLow > MOTION.chestMade + 20);
  // A motion of the whole body brought its own legs: it is left as it was made, however far over.
  assert.equal(chestTip(rad(made + 25), { ...none, crossover: 1 }, ['crossover']), 0);
  assert.ok(near(chestTip(rad(made + 25), { ...none, crossover: 0.5, catch: 0.5 }, ['crossover']), rad(-25) / 2));
});

// ---- rulings after the first review of Task 11 ----

test('a head never cranes at what is behind him, and never turns faster than 360 degrees a second', () => {
  const p = { x: 0, y: 0, z: 0 }, toward = degrees => ({ x: Math.cos(rad(degrees)) * 4, y: MOTION.eye + 1, z: Math.sin(rad(degrees)) * 4 });
  assert.equal(MOTION.headBehind, 120);
  assert.ok(near(deg(headTurn(p, 0, toward(119)).yaw), 70) && headTurn(p, 0, toward(119)).pitch > 0);   // within 120 degrees: as far as the neck goes
  assert.deepEqual(headTurn(p, 0, toward(121)), { yaw: 0, pitch: 0 });     // further round: he looks where he is going
  assert.ok(near(deg(headTurn(p, rad(90), toward(-10)).yaw), -70));        // measured from where he is drawn facing
  assert.deepEqual(headTurn(p, rad(90), toward(220)), { yaw: 0, pitch: 0 });
  const step = easeHead({ yaw: 0, pitch: 0 }, { yaw: Math.PI / 2, pitch: -1 }, 1 / 60);   // the easing alone would turn 11 and 7 degrees
  assert.ok(near(deg(step.yaw), 6) && near(deg(step.pitch), -6));          // 360 / 60 each, however far there is to go
  const small = easeHead({ yaw: 0, pitch: 0 }, { yaw: 0.1, pitch: 0.05 }, 1 / 60), k = 1 - Math.exp(-MOTION.headEase / 60);
  assert.ok(near(small.yaw, 0.1 * k) && near(small.pitch, 0.05 * k));      // a short way: the easing alone
  let head = { yaw: rad(70), pitch: 0 }, frames = 0;
  while (head.yaw > rad(-70) + 1e-9 && frames < 200) { head = easeHead(head, { yaw: rad(-70), pitch: 0 }, 1 / 60); frames++; }
  assert.ok(frames >= 140 / 6, `${frames} frames from one shoulder to the other`);
});

test('a watcher looks at a held ball at the height of the hands, not at the floor it is bounced on', () => {
  const s = live(), ball = s.ball;
  assert.equal(MOTION.ballHeld, 1.1);
  ball.y = 0.2;                                                            // the rules bounce a dribbled ball at his hip
  assert.deepEqual(lookTarget(s, s.players[1]), { x: ball.x, y: 1.1, z: ball.z });
  ball.y = 0.9;
  assert.deepEqual(lookTarget(s, s.players[1]), { x: ball.x, y: 1.1, z: ball.z });
  passBall(s, s.players[0], { ...emptyIntent(), moveZ: 1 });
  assert.deepEqual(lookTarget(s, s.players[2]), { x: ball.x, y: ball.y, z: ball.z });   // nobody holds it: where it is
});

// ---- review of Task 11 ----

test('a ball handler looks at the nearest opponent only when he is in front of him, otherwise at the rim', () => {
  const hoop = { x: RIM.x, y: RIM.height, z: 0 };
  const ft = live();
  ft.freeThrow = newFreeThrow(0, 2); setupFreeThrow(ft);                   // a defender stands 3.8 m behind the shooter
  assert.deepEqual(lookTarget(ft, ft.players[0]), hoop);                   // so he looks up at the rim for the whole aim
  const s = live(), p = s.players[0];                                      // at (5, -3)
  p.facing = 0;
  at(s, 3, 7, -3);
  assert.deepEqual(lookTarget(s, p), { x: 7, y: MOTION.eye, z: -3 });      // a defender in front: he watches him
  at(s, 3, 3, -3);
  assert.deepEqual(lookTarget(s, p), hoop);                                // a defender trailing him: the rim
  at(s, 3, 5, -1);
  assert.deepEqual(lookTarget(s, p), { x: 5, y: MOTION.eye, z: -1 });      // beside him, within 120 degrees: him
});

test('a held ball is looked at at the height of the hands of its holder, in the air as on the floor', () => {
  const s = live(), holder = s.players[0], look = () => lookTarget(s, s.players[1]).y;
  assert.equal(look(), MOTION.ballHeld);                                   // on the floor: 1.1 m
  holder.y = 0.6;
  assert.ok(Math.abs(look() - (0.6 + MOTION.ballHeld)) < 1e-12);           // rising with a shot: up with him
});
