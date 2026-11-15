import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legMotion, armMotion, newMarks, noteChanges, drawnFacing, legLook, defending, dribbleHand, passArrival, airTime, wholeBody, MOTION } from '../src/render/motion.js';
import { manOf } from '../src/sim/matchups.js';
import { emptyIntent } from '../src/sim/state.js';
import { giveBall, passBall, trySteal } from '../src/sim/players.js';
import { newFreeThrow, setupFreeThrow } from '../src/sim/freethrow.js';
import { step } from '../src/sim/step.js';
import { DT, PLAYER, SHOT } from '../src/sim/tuning.js';
import { live, idle, only, at, press } from './helpers.js';

const facts = { gaits: { walk: 1.8, run: 5.2, sprint: 7.3, strafeLeft: 1.5, strafeRight: 1.5, backpedal: 1.3 },
  clips: { pass: { duration: 0.35 }, follow: { duration: 0.5 }, freeThrow: { duration: 0.9 }, reach: { duration: 0.4 } } };
const still = { vx: 0, vz: 0, y: 0, vy: 0, jumpT: 0, shooting: false, shotT: 0, takeoff: 0 };
const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;
// A match with its marks, seen once so that only what happens next counts as new.
function watched(seed = 1) { const s = live(seed), marks = newMarks(); noteChanges(marks, s, DT); return [s, marks]; }
// One step of the match, then one frame of noticing.
const tick = (s, marks, intents = idle()) => { step(s, intents, DT); noteChanges(marks, s, DT); };
const arms = (s, marks, id) => armMotion(s.players[id], s, marks, facts);

// ---- legs ----

test('a defender within 4 m of his man is drawn facing him; beyond that, or at a run, he faces where he goes', () => {
  const [s, marks] = watched();                         // team 0 has the ball; player 3 guards player 0
  const face = () => { noteChanges(marks, s, MOTION.guardHold); return drawnFacing(s, s.players[3], marks); };   // half a second apart (ruling A after Task 11)
  at(s, 0, 5, 0); at(s, 3, 3, 0); s.players[3].facing = 2;
  assert.ok(near(face(), 0));                           // his man is toward +x
  at(s, 3, 0.5, 0);
  assert.equal(face(), 2);                              // 4.5 m away
  at(s, 3, 3, 0); s.players[3].vx = 3;
  assert.equal(face(), 2);                              // running
  assert.equal(drawnFacing(s, s.players[0], marks), s.players[0].facing);   // his team has the ball
});

test('a defender shuffling near walking pace does not flip between facing his man and facing his run', () => {
  const [s, marks] = watched();
  at(s, 0, 5, 0); at(s, 3, 3, 0);
  const guarding = v => { s.players[3].vx = v; noteChanges(marks, s, MOTION.guardHold); return marks.guard[3]; };   // half a second apart (ruling A after Task 11)
  assert.deepEqual([guarding(2.1), guarding(2.5), guarding(2.7), guarding(2.3), guarding(2.1)], [true, true, false, false, true]);
});

test('guarding, he stands in a stance, side-steps to his own left and right, and back-steps', () => {
  const look = { facing: 0, defending: true, guarding: true, crouch: false, landed: Infinity };
  const moving = (vx, vz, l = look) => legMotion({ ...still, vx, vz }, facts.gaits, null, l);
  assert.deepEqual(legMotion(still, facts.gaits, null, look), { clip: 'stance', rate: 1 });
  assert.deepEqual(moving(0, -1.5), { clip: 'strafeLeft', rate: 1 });     // facing +x, his left is -z
  assert.equal(moving(0, 1.5).clip, 'strafeRight');
  assert.deepEqual(moving(-1.3, 0), { clip: 'backpedal', rate: 1 });
  assert.equal(moving(1.5, 0).clip, 'walk');
  assert.equal(moving(0, 1.5, { ...look, guarding: false }).clip, 'walk');            // not near his man: no side-steps
  assert.equal(legMotion(still, facts.gaits, null, { ...look, guarding: false }).clip, 'stance');
  assert.equal(legMotion(still, facts.gaits, null, { ...look, defending: false, guarding: false }).clip, 'idle');
});

test('a player holding a picked-up ball stands with his knees bent', () => {
  const [s, marks] = watched();
  assert.equal(legLook(s, s.players[0], marks).crouch, true);             // dribbling in live play he crouches too (was false before the ruling after Task 9)
  s.players[0].held = true;
  assert.equal(legLook(s, s.players[0], marks).crouch, true);
  assert.equal(legMotion(still, facts.gaits, null, legLook(s, s.players[0], marks)).clip, 'stance');
  s.players[0].inbounder = true;
  assert.equal(legLook(s, s.players[0], marks).crouch, false);            // an inbounder stands upright
});

test('the gather dips the knees over its 0.3 s, and each jump is drawn over its own time in the air', () => {
  const look = { facing: 0, defending: false, guarding: false, crouch: false, landed: Infinity };
  assert.deepEqual(legMotion({ ...still, shooting: true, shotT: 0.15 }, facts.gaits, null, look), { clip: 'gather', at: 0.5 });
  assert.equal(legMotion({ ...still, shooting: true, shotT: 0.15 }, facts.gaits).clip, 'idle');      // without a look it chooses as it always did
  const shot = { ...still, y: 0.2, vy: 0.5, takeoff: PLAYER.shotJumpV, jumpT: PLAYER.shotJumpV / 9.81 };
  assert.ok(near(airTime(shot), 0.4485, 0.0005));
  assert.deepEqual(legMotion(shot, facts.gaits), { clip: 'jump', at: 0.5 });
  assert.ok(near(legMotion({ ...shot, takeoff: PLAYER.jumpV }, facts.gaits).at, 0.275, 0.001));   // the same moment of a full jump
});

test('the knees give for 0.12 s after a landing, then the legs go back to what his speed calls for', () => {
  const [s, marks] = watched(), p = s.players[3];
  assert.equal(legLook(s, p, marks).landed, Infinity);
  tick(s, marks, only(3, { shoot: true }));              // a defender jumps
  while (p.y > 0 || p.vy !== 0) tick(s, marks);
  assert.equal(marks.land[3], 0);
  assert.deepEqual(legMotion(p, facts.gaits, 'jump', legLook(s, p, marks)), { clip: 'land', at: 0 });
  for (let i = 0; i < 3; i++) tick(s, marks);
  assert.ok(near(legMotion(p, facts.gaits, 'land', legLook(s, p, marks)).at, 0.05 / 0.12));
  for (let i = 0; i < 5; i++) tick(s, marks);
  assert.equal(legMotion(p, facts.gaits, 'land', legLook(s, p, marks)).clip, 'stance');
});

// ---- arms ----

test('the arms show the newest thing: a pass, then the catch that follows at once', () => {
  const [s, marks] = watched();
  passBall(s, s.players[0], emptyIntent()); noteChanges(marks, s, DT);
  assert.deepEqual(arms(s, marks, 0), { clip: 'pass', at: 0 });
  giveBall(s, s.players[1]); noteChanges(marks, s, DT);
  assert.deepEqual(arms(s, marks, 1), { clip: 'catch', at: MOTION.catchReach });
  for (let i = 0; i < 9; i++) noteChanges(marks, s, DT);                  // 0.15 s later the ball is pulled in
  assert.deepEqual(arms(s, marks, 1), { clip: 'dribble', rate: 1 });
  for (let i = 0; i < 12; i++) noteChanges(marks, s, DT);
  assert.equal(arms(s, marks, 0), null);                                  // the pass has played out
});

test('the shot is prepared on the floor: the ball is at the set point as his feet leave it, and held there', () => {
  const [s, marks] = watched(), hold = only(0, { shoot: true });
  tick(s, marks, hold);
  assert.deepEqual(arms(s, marks, 0), { clip: 'shoot', at: 0 });
  for (let i = 0; i < 9; i++) tick(s, marks, hold);
  assert.ok(near(arms(s, marks, 0).at, 0.5));                             // halfway through the gather
  for (let i = 0; i < 9; i++) tick(s, marks, hold);
  assert.deepEqual([s.players[0].vy > 0, arms(s, marks, 0)], [true, { clip: 'shoot', at: 1 }]);
  for (let i = 0; i < 8; i++) tick(s, marks, hold);
  assert.deepEqual(arms(s, marks, 0), { clip: 'shoot', at: 1 });          // held until he lets go
});

test('the follow-through goes up at the release and stays up until he has landed', () => {
  const [s, marks] = watched(), p = s.players[0];
  for (let i = 0; i < 19; i++) tick(s, marks, only(0, { shoot: true }));
  tick(s, marks);                                                         // lets go just after take-off
  assert.deepEqual(arms(s, marks, 0), { clip: 'follow', at: 0 });
  for (let i = 0; i < 6; i++) tick(s, marks);
  assert.ok(near(arms(s, marks, 0).at, 0.2));                             // 0.1 s of a 0.5 s clip
  while (p.y > 0 || p.vy !== 0) { assert.ok(arms(s, marks, 0).at <= MOTION.followHold + 1e-9); tick(s, marks); }
  assert.deepEqual(arms(s, marks, 0), { clip: 'follow', at: MOTION.followHold });   // just landed: still up
  for (let i = 0; i < 6; i++) tick(s, marks);
  assert.ok(near(arms(s, marks, 0).at, 0.8));                             // relaxing, 0.1 s after landing
  for (let i = 0; i < 7; i++) tick(s, marks);
  assert.equal(arms(s, marks, 0), null);
  Object.assign(p, { y: 0.4, vy: 1, jumpT: 0.1 });                        // a moment later he jumps for the rebound
  assert.equal(arms(s, marks, 0).clip, 'contest');                        // not a follow-through he has not earned
});

test('a shooter who lands still holding the ball stops shooting, and one who is blocked still follows through', () => {
  const [s, marks] = watched();
  for (let i = 0; i < 46; i++) tick(s, marks, only(0, { shoot: true }));
  assert.deepEqual([s.call.kind, s.players[0].shooting, arms(s, marks, 0)], ['travel', false, { clip: 'hold', rate: 1 }]);   // the whistle has gone: he holds it
  const [t, seen] = watched();
  for (let i = 0; i < 25; i++) tick(t, seen, only(0, { shoot: true }));
  Object.assign(t.ball, { holder: null, mode: 'loose' }); t.players[0].shooting = false;   // swatted out of his hands
  noteChanges(seen, t, DT);
  assert.equal(arms(t, seen, 0).clip, 'follow');
});

test('at the line he waits at the set point, and a free throw is a set shot from there', () => {
  const s = live(), marks = newMarks();
  s.freeThrow = newFreeThrow(0, 2); setupFreeThrow(s);
  noteChanges(marks, s, DT);
  for (let i = 0; i < 12; i++) noteChanges(marks, s, DT);                 // the catch has played out
  assert.deepEqual(arms(s, marks, 0), { clip: 'freeThrow', at: MOTION.freeThrowSet });   // at the set point (was: a hold, after the ruling on Task 10)
  press(s); noteChanges(marks, s, 2 * DT);
  assert.deepEqual([s.ball.mode, arms(s, marks, 0)], ['shot', { clip: 'freeThrow', at: MOTION.freeThrowSet }]);   // (was: at 0)
});

test('after a free throw the arms play on from the set point at the clip\'s own pace, until it ends', () => {
  const s = live(), marks = newMarks();
  s.freeThrow = newFreeThrow(0, 2); setupFreeThrow(s);
  for (let i = 0; i < 13; i++) noteChanges(marks, s, DT);
  press(s); noteChanges(marks, s, 2 * DT);                                 // let go on this frame
  const after = age => { noteChanges(marks, s, age - marks.release[0]); return arms(s, marks, 0); };
  assert.equal(MOTION.freeThrowSet, 0.45);
  const played = after(0.36);
  assert.equal(played.clip, 'freeThrow');
  assert.ok(near(played.at, MOTION.freeThrowSet + 0.36 / 0.9));
  assert.ok(near(after(0.49).at, MOTION.freeThrowSet + 0.49 / 0.9));
  assert.notEqual(after(0.5)?.clip, 'freeThrow');                          // 0.45 + 0.5 / 0.9 is past the end
});

test('an inbounder and a player who has picked up his dribble hold the ball; otherwise he dribbles', () => {
  const [s, marks] = watched();
  for (let i = 0; i < 12; i++) noteChanges(marks, s, DT);
  assert.deepEqual(arms(s, marks, 0), { clip: 'dribble', rate: 1 });
  s.players[0].held = true;
  assert.deepEqual(arms(s, marks, 0), { clip: 'hold', rate: 1 });
  s.players[0].held = false; s.players[0].inbounder = true;
  assert.equal(arms(s, marks, 0).clip, 'hold');
});

test('he dribbles and holds with the hand away from the nearest defender, and does not switch for a defender straight ahead', () => {
  const [s, marks] = watched(), p = s.players[0];
  at(s, 0, 5, 0); p.facing = 0;                          // facing +x: his right is +z
  const hand = (x, z) => { at(s, 3, x, z); noteChanges(marks, s, DT); return marks.hand[0]; };
  assert.equal(hand(6, 1), 'left');                      // defender on his right
  assert.deepEqual([arms(s, marks, 0).clip, marks.switched[0]], ['dribbleLeft', 0]);
  assert.equal(hand(6, 0.2), 'left');                    // nearly straight ahead: he keeps the hand he has
  const settle = () => { for (let t = 0; t < MOTION.handStick; t += DT) noteChanges(marks, s, DT); };   // a hand just changed to is kept for 0.4 s (the ruling after Task 9)
  settle();
  assert.equal(hand(6, -1), 'right');
  assert.equal(hand(10, 3), 'right');                    // nobody within 4 m: no reason to switch
  settle();
  hand(6, 1); p.held = true;
  assert.equal(arms(s, marks, 0).clip, 'holdLeft');
  assert.equal(dribbleHand(s, p), 'left');
});

test('a team-mate raises his hands over the last 0.2 s before a pass arrives, and nobody else does', () => {
  const [s, marks] = watched();
  at(s, 0, 0, 0); at(s, 1, 7, 0); at(s, 2, 3.5, 2.5);
  passBall(s, s.players[0], { ...emptyIntent(), moveX: 1 });             // to player 1, 7 m away: half a second in the air
  noteChanges(marks, s, DT);
  assert.deepEqual([s.ball.target, arms(s, marks, 1), arms(s, marks, 2)], [1, null, null]);
  let reached = [];
  while (s.ball.holder === null) { tick(s, marks); if (s.ball.holder === null) reached.push(arms(s, marks, 1)?.at ?? -1); }
  const up = reached.filter(v => v >= 0);
  assert.ok(up.length >= 10 && up.length <= 13, `${up.length} frames of reaching`);    // about 0.2 s
  assert.ok(up.every((v, i) => i === 0 || v > up[i - 1]) && up.at(-1) > 0.5 && up.at(-1) <= MOTION.catchReach);
  assert.equal(arms(s, marks, 1).clip, 'catch');                          // caught: the same motion carries on
  assert.ok(arms(s, marks, 1).at >= MOTION.catchReach);
  assert.equal(passArrival(s, s.players[1]), Infinity);
});

test('a steal attempt is a reach; if it wins the ball he is shown catching it', () => {
  const [s, marks] = watched();
  at(s, 3, 5.8, -3); s.players[0].facing = 0;
  let won = false;
  for (let i = 0; i < 80 && !won; i++) {
    s.players[3].stealCooldown = 0;
    won = trySteal(s, s.players[3]).won;
    noteChanges(marks, s, DT);
    if (!won) assert.deepEqual(arms(s, marks, 3), { clip: 'reach', at: 0 });
  }
  assert.equal(arms(s, marks, 3).clip, 'catch');
});

test('in the air without the ball the arms go up; the jumpers at the tip reach with one hand', () => {
  const [s, marks] = watched(), p = s.players[4];
  Object.assign(p, { y: 0.5, vy: 1, takeoff: PLAYER.jumpV, jumpT: PLAYER.jumpV / 9.81 });
  assert.deepEqual(arms(s, marks, 4), { clip: 'contest', at: 0.5 });
  s.phase = 'jumpBall';
  assert.equal(arms(s, marks, 4).clip, 'tip');                            // slot 1 is the jumper
  Object.assign(s.players[5], { y: 0.5, vy: 1 });
  assert.equal(arms(s, marks, 5).clip, 'contest');
});

test('a defender on the floor within 2 m of a shooter raises a hand, from the gather on', () => {
  const [s, marks] = watched();
  at(s, 0, 5, 0); at(s, 3, 6.5, 0); at(s, 4, 8, 0);
  assert.equal(arms(s, marks, 3), null);
  tick(s, marks, only(0, { shoot: true }));              // he gathers
  assert.deepEqual([arms(s, marks, 3), arms(s, marks, 4), arms(s, marks, 1)], [{ clip: 'handUp', rate: 1 }, null, null]);
  s.players[3].y = 0.3; s.players[3].vy = 1;
  assert.equal(arms(s, marks, 3).clip, 'contest');       // once he jumps, both arms go up
});

test('standing with nothing to do, the arms follow the legs', () => {
  const [s, marks] = watched();
  assert.deepEqual([arms(s, marks, 1), arms(s, marks, 4), defending(s, s.players[4]), manOf(s, s.players[4]).id], [null, null, true, 1]);
});

// ---- after the plan's tests: a release belongs to the jump it was made on, and a pass is never one ----

test('a shooter who has landed and later jumps without the ball contests, and his landing is not a follow-through', () => {
  const [s, marks] = watched(), p = s.players[0];
  for (let i = 0; i < 19; i++) tick(s, marks, only(0, { shoot: true }));
  tick(s, marks);                                                         // lets go just after take-off
  while (arms(s, marks, 0)) tick(s, marks);                               // the follow-through has played out
  assert.equal(s.ball.holder, null);
  tick(s, marks, only(0, { shoot: true }));                               // he jumps again, without the ball
  assert.ok(p.vy > 0);
  while (p.y > 0 || p.vy !== 0) { assert.equal(arms(s, marks, 0).clip, 'contest'); tick(s, marks); }
  assert.equal(marks.land[0], 0);
  for (let i = 0; i < 15; i++) { assert.notEqual(arms(s, marks, 0)?.clip, 'follow', `${i} frames after landing`); tick(s, marks); }
});

test('a pass thrown out of a shot jump is a pass, and no follow-through comes after it', () => {
  const [s, marks] = watched(), hold = only(0, { shoot: true });
  for (let i = 0; i < 22; i++) tick(s, marks, hold);
  tick(s, marks, only(0, { shoot: true, pass: true }));                   // in the air, he passes instead
  assert.deepEqual([s.players[0].y > 0, s.ball.target !== null, arms(s, marks, 0)], [true, true, { clip: 'pass', at: 0 }]);
  const shown = [];
  for (let i = 0; i < 45; i++) { tick(s, marks, hold); shown.push(arms(s, marks, 0)?.clip ?? null); }   // Space still down: no new jump
  assert.ok(shown.includes('pass') && !shown.includes('follow'), shown.join(' '));
  assert.equal(shown.at(-1), null);
});

test('a shot let go during the gather leaves as his feet do, and still gets its follow-through', () => {
  const [s, marks] = watched();
  tick(s, marks, only(0, { shoot: true }));                               // a tap: the key comes up on the floor
  while (s.ball.holder === 0) tick(s, marks);
  assert.deepEqual([s.ball.mode, s.players[0].vy > 0, arms(s, marks, 0)], ['shot', true, { clip: 'follow', at: 0 }]);
});

// ---- after the review: every take-off forgets the last release, and nobody dribbles in the air ----

import { freeBall } from './helpers.js';

// A match in which player 0 has taken one ordinary shot, landed, let his follow-through play out and got the ball back.
function shotBefore() {
  const [s, marks] = watched();
  for (let i = 0; i < 19; i++) tick(s, marks, only(0, { shoot: true }));
  tick(s, marks);
  while (arms(s, marks, 0)) tick(s, marks);
  giveBall(s, s.players[0]); noteChanges(marks, s, DT);
  return [s, marks];
}
// What player 0's arms show over the next `frames` frames, with Space still down so that he does not jump again.
function shownNext(s, marks, frames) {
  const shown = [];
  for (let i = 0; i < frames; i++) { tick(s, marks, only(0, { shoot: true })); shown.push(arms(s, marks, 0)?.clip ?? null); }
  return shown;
}

test('a shot jump that ends in a pass or a strip shows no follow-through from an earlier shot', () => {
  const hold = only(0, { shoot: true });
  const [s, marks] = shotBefore();
  for (let i = 0; i < 22; i++) tick(s, marks, hold);
  tick(s, marks, only(0, { shoot: true, pass: true }));                   // in the air, he passes instead
  assert.deepEqual([s.players[0].y > 0, arms(s, marks, 0)], [true, { clip: 'pass', at: 0 }]);
  const afterPass = shownNext(s, marks, 45);
  assert.ok(!afterPass.includes('follow') && afterPass.at(-1) === null, afterPass.join(' '));

  const [t, seen] = shotBefore(), p = t.players[0];
  for (let i = 0; i < 22; i++) tick(t, seen, hold);
  at(t, 3, p.x + 0.8, p.z);                                               // a defender in front of him takes it out of his hands
  for (let won = false; !won;) { t.players[3].stealCooldown = 0; won = trySteal(t, t.players[3]).won; }
  noteChanges(seen, t, DT);
  assert.deepEqual([p.y > 0, p.shooting, t.ball.holder, arms(t, seen, 0).clip], [true, false, 3, 'contest']);
  const afterStrip = shownNext(t, seen, 45);
  assert.ok(!afterStrip.includes('follow') && afterStrip.at(-1) === null, afterStrip.join(' '));
});

test('a rebound caught in the air is caught, then held until he lands, then dribbled', () => {
  const [s, marks] = watched(), p = s.players[1];
  freeBall(s, { x: p.x, y: 2.9, z: p.z });                                // a ball falling from just out of his reach
  tick(s, marks, only(1, { shoot: true }));                               // he jumps for it
  while (s.ball.holder !== 1) tick(s, marks);
  assert.deepEqual([p.y > 0, arms(s, marks, 1)], [true, { clip: 'catch', at: MOTION.catchReach }]);
  const inAir = [];
  for (tick(s, marks); p.y > 0 || p.vy !== 0; tick(s, marks)) inAir.push(arms(s, marks, 1).clip);
  assert.match(inAir.join(' '), /^(catch )+(hold ?){10,}$/);
  assert.deepEqual(arms(s, marks, 1), { clip: 'dribble', rate: 1 });      // landed
});

// ---- after Task 9's first look in the browser: a crouch for the dribbler, and sticks on the hand and the guarding steps ----

test('dribbling on the spot he crouches as one holding the ball does; in the air, without the ball or with play stopped he does not', () => {
  const [s, marks] = watched(), p = s.players[0], look = () => legLook(s, p, marks);
  assert.equal(look().crouch, true);
  assert.equal(legMotion(still, facts.gaits, 'idle', look()).clip, 'stance');
  assert.deepEqual([1, 3, 7].map(vx => legMotion({ ...still, vx }, facts.gaits, null, look()).clip), ['walk', 'run', 'sprint']);   // moving legs are as before
  assert.equal(legLook(s, s.players[1], marks).crouch, false);            // a team-mate without the ball
  p.y = 0.3;
  assert.equal(look().crouch, false);
  p.y = 0; s.phase = 'dead';
  assert.equal(look().crouch, false);
  p.held = true;
  assert.equal(look().crouch, true);                                      // a picked-up ball is held low whatever the phase, as before
});

test('the dribbling hand is kept for at least 0.4 s; the first choice is free', () => {
  const [s] = watched(), p = s.players[0], marks = newMarks();
  at(s, 0, 5, 0); p.facing = 0;                          // facing +x: his right is +z
  const hand = (x, z) => { at(s, 3, x, z); noteChanges(marks, s, DT); return marks.hand[0]; };
  assert.equal(hand(6, 1), 'left');                      // the first frame there is: the hand away from the defender at once
  assert.deepEqual([hand(6, -1), marks.switched[0]], ['right', 0]);   // he has never changed hand: nothing to wait for
  let frames = 1;
  while (hand(6, 1) === 'right') frames++;               // the defender crosses back at once
  assert.ok(Math.abs(frames * DT - MOTION.handStick) < DT + 1e-9, `changed back after ${frames} frames`);
  assert.equal(MOTION.handStick, 0.4);
});

test('a guarding step is kept past its edge: a back-step out to 60 degrees from straight back, a side-step in to 40 from straight ahead and back', () => {
  const look = { facing: 0, defending: true, guarding: true, crouch: false, landed: Infinity };
  // Travelling at walking pace `degrees` to the right of the way he is drawn facing (+x; his right is +z).
  const step = (degrees, last) => legMotion({ ...still, vx: 1.4 * Math.cos((degrees * Math.PI) / 180), vz: 1.4 * Math.sin((degrees * Math.PI) / 180) }, facts.gaits, last, look).clip;
  assert.deepEqual([step(125, null), step(125, 'backpedal'), step(-125, 'backpedal'), step(115, 'backpedal')], ['strafeRight', 'backpedal', 'backpedal', 'strafeRight']);
  assert.deepEqual([step(135, null), step(135, 'strafeRight'), step(145, 'strafeRight')], ['backpedal', 'strafeRight', 'backpedal']);
  assert.deepEqual([step(45, null), step(45, 'strafeRight'), step(35, 'strafeRight')], ['walk', 'strafeRight', 'walk']);
  assert.deepEqual([step(-45, 'strafeLeft'), step(-135, 'strafeLeft'), step(90, 'strafeLeft'), step(-90, 'strafeRight')], ['strafeLeft', 'strafeLeft', 'strafeRight', 'strafeLeft']);
  assert.deepEqual([step(55, 'walk'), step(45, 'backpedal'), step(125, 'walk')], ['strafeRight', 'walk', 'strafeRight']);   // nothing else sticks
  assert.deepEqual([MOTION.sideStick, MOTION.guardFar], [10, 0.4]);
});

test('once he guards his man he keeps guarding him out to 4.4 m', () => {
  const [s, marks] = watched();
  at(s, 0, 5, 0);
  const guarding = x => { at(s, 3, x, 0); noteChanges(marks, s, MOTION.guardHold); return marks.guard[3]; };   // half a second apart (ruling A after Task 11)
  // 4.2 m away, 3.8, 4.2 again, 4.5, 4.2, 3.8
  assert.deepEqual([guarding(0.8), guarding(1.2), guarding(0.8), guarding(0.5), guarding(0.8), guarding(1.2)], [false, true, true, false, false, true]);
});

test('a slow side-step may play slower than any other gait, so the feet cover no more ground than he does', () => {
  const look = { facing: 0, defending: true, guarding: true, crouch: false, landed: Infinity };
  const moving = (vx, vz) => legMotion({ ...still, vx, vz }, facts.gaits, null, look);
  assert.deepEqual(moving(0, 0.75), { clip: 'strafeRight', rate: 0.5 });  // 0.75 of 1.5: under the 0.6 of the other gaits
  assert.deepEqual(moving(0, -0.45), { clip: 'strafeLeft', rate: 0.35 }); // 0.3 would be too slow to read as a step
  assert.deepEqual(moving(-0.5, 0), { clip: 'backpedal', rate: 0.6 });    // only the side-steps
  assert.equal(MOTION.minRateStep, 0.35);
});

// ---- rulings after the first review of Task 11 ----

test('a defender keeps guarding, or not guarding, for at least half a second, until his team has the ball', () => {
  const s = live(), marks = newMarks(), p = s.players[3];
  at(s, 0, 5, 0); at(s, 3, 3, 0);                                          // 2 m from his man, standing
  noteChanges(marks, s, DT);
  assert.deepEqual([MOTION.guardHold, marks.guard[3], marks.guarded[3]], [0.5, true, 0]);   // the first decision is free
  const after = (seconds, vx) => { p.vx = vx; for (let t = DT / 2; t < seconds; t += DT) noteChanges(marks, s, DT); return marks.guard[3]; };
  assert.equal(after(0.45, 3), true);                                      // running off: he keeps guarding for now
  assert.equal(after(0.1, 3), false);                                      // half a second on, he turns and runs
  assert.ok(marks.guarded[3] < 0.1);                                       // seconds since it changed
  assert.equal(after(0.45, 0), false);                                     // stopping beside his man: not yet
  assert.equal(after(0.1, 0), true);
  s.possession = 1;                                                        // his team gets the ball: he guards nobody, at once
  assert.equal(after(DT, 0), false);
});

test('in five a side the centres are the jumpers at the tip: the player in place 2 reaches, the one in place 1 does not', () => {
  const s = live(1, 5), marks = newMarks(); noteChanges(marks, s, DT);
  s.phase = 'jumpBall'; s.ball.holder = null;
  for (const id of [1, 2, 7]) Object.assign(s.players[id], { y: 0.4, vy: 1, jumpT: 0.1 });
  noteChanges(marks, s, DT);
  assert.deepEqual([arms(s, marks, 2).clip, arms(s, marks, 7).clip], ['tip', 'tip']);
  assert.notEqual(arms(s, marks, 1)?.clip, 'tip');
});

test('a player calling for the ball has his hand up, and so has a defender closing out', () => {
  const [s, marks] = watched();
  at(s, 0, 5, 0); at(s, 1, 8, 4); at(s, 3, 12, -5);
  assert.deepEqual([arms(s, marks, 1), arms(s, marks, 3)], [null, null]);
  s.players[1].calling = true; s.players[3].closing = true;
  assert.deepEqual([arms(s, marks, 1), arms(s, marks, 3)], [{ clip: 'handUp', rate: 1 }, { clip: 'handUp', rate: 1 }]);
});

// ---------- the five moves ----------

const inMove = (kind, t) => ({ kind, t, dx: 0, dz: 1, cx: 0, cz: 0, push: 1 });

test('a player in a dribble move shows that move, as far through as the move is, for the hand the ball starts in', () => {
  const [s, marks] = watched();
  s.players[0].move = inMove('cross', 0.15);
  assert.deepEqual(arms(s, marks, 0), { clip: marks.hand[0] === 'left' ? 'crossoverLeft' : 'crossover', at: 0.5 });
  marks.hand[0] = 'left';
  assert.deepEqual(arms(s, marks, 0), { clip: 'crossoverLeft', at: 0.5 });
  marks.hand[0] = 'right';
  s.players[0].move = inMove('legs', 0.1);
  assert.deepEqual(arms(s, marks, 0), { clip: 'betweenLegs', at: 0.25 });
  s.players[0].move = inMove('back', 0.5);
  assert.deepEqual(arms(s, marks, 0), { clip: 'behindBack', at: 1 });
  s.players[0].move = inMove('stepBack', 0.175);
  assert.deepEqual(arms(s, marks, 0), { clip: 'stepBack', at: 0.5 });   // one motion for either hand
});

test('as a dribble move ends the ball is in the other hand, and stays there for a moment', () => {
  const [s, marks] = watched();
  for (const p of s.players) if (p.id) at(s, p.id, -10, p.id);          // nobody near enough to choose his hand for him
  noteChanges(marks, s, DT);
  const before = marks.hand[0];
  s.players[0].move = inMove('cross', 0.1); noteChanges(marks, s, DT);
  assert.equal(marks.hand[0], before);                                 // not during the move
  s.players[0].move = null; noteChanges(marks, s, DT);
  assert.notEqual(marks.hand[0], before);
  // The move took the ball across: it does not cross again, as it does when he only changes hands.
  assert.equal(marks.switched[0], MOTION.handSwitch);
  noteChanges(marks, s, DT);
  assert.notEqual(marks.hand[0], before);
});

test('a motion of the whole body is a downloaded clip, or one made by hand that says so', () => {
  const clips = { a: { from: 'clip' }, b: { from: 'hand', whole: true }, c: { from: 'hand' }, d: {} };
  assert.deepEqual(['a', 'b', 'c', 'd', 'e'].map(name => wholeBody(clips, name)), [true, true, false, false, false]);
});

test('a step-back does not change the hand', () => {
  const [s, marks] = watched();
  noteChanges(marks, s, DT);
  const before = marks.hand[0];
  s.players[0].move = inMove('stepBack', 0.1); noteChanges(marks, s, DT);
  s.players[0].move = null; noteChanges(marks, s, DT);
  assert.equal(marks.hand[0], before);
});

test('a fade is shown leaning back, a plain shot is not', () => {
  const [s, marks] = watched();
  Object.assign(s.players[0], { shooting: true, shotT: SHOT.gather / 2 });
  assert.deepEqual(arms(s, marks, 0), { clip: 'shoot', at: 0.5 });
  s.players[0].fading = true;
  assert.deepEqual(arms(s, marks, 0), { clip: 'fade', at: 0.5 });
});

test('a defender put on the floor by a move staggers low; with a stumble in the file he plays it', () => {
  const [s, marks] = watched();
  s.players[3].stumbleT = 0.5;
  assert.deepEqual(legMotion(s.players[3], facts.gaits), { clip: 'stance', rate: 1 });
  assert.notEqual(arms(s, marks, 3)?.clip, 'stumble');                 // the file here has none
  const withClip = { ...facts, clips: { ...facts.clips, stumble: { duration: 1, from: 'clip' } } };
  assert.deepEqual(armMotion(s.players[3], s, marks, withClip), { clip: 'stumble', at: 0.5 });
});

// ---------- after a big basket ----------

test('the scorer the broadcast has celebrating raises an arm, or plays the celebration if the file has one; the beaten man drops his head only with that motion', () => {
  const [s, marks] = watched();
  at(s, 1, 0, 3); at(s, 4, 0, -3);                                    // away from everyone, so nothing else moves their arms
  marks.show = { celebrate: 1, dejected: 4 };
  assert.deepEqual(arms(s, marks, 1), { clip: 'handUp', rate: 1 });
  assert.notEqual(arms(s, marks, 4)?.clip, 'dejected');
  const more = { ...facts, clips: { ...facts.clips, celebrate: { duration: 2, from: 'clip' }, dejected: { duration: 2, from: 'clip' } } };
  assert.deepEqual(armMotion(s.players[1], s, marks, more), { clip: 'celebrate', rate: 1 });
  assert.deepEqual(armMotion(s.players[4], s, marks, more), { clip: 'dejected', rate: 1 });
  marks.show = { celebrate: 0, dejected: null };                      // the man with the ball gets on with it
  assert.notEqual(armMotion(s.players[0], s, marks, more).clip, 'celebrate');
  marks.show = null;
  assert.notEqual(arms(s, marks, 1)?.clip, 'handUp');
});

// ---------- the legs in a move ----------

test('in a move he does not turn to where he goes: across his line he side-steps, at the pace he really travels; back from the hoop he pushes off a planted crouch', () => {
  const gaits = facts.gaits, look = { facing: 0, defending: false, guarding: false, moving: true, crouch: true, landed: Infinity };
  const going = (vx, vz) => legMotion({ ...still, vx, vz }, gaits, 'stance', look);
  assert.deepEqual(going(0, 4), { clip: 'strafeRight', rate: 4 / gaits.strafeRight });            // +z is his right when he faces +x
  assert.deepEqual(going(0, -4), { clip: 'strafeLeft', rate: 4 / gaits.strafeLeft });
  assert.equal(going(0, 4).rate > MOTION.maxRate, true, 'quicker than any step he takes otherwise');
  assert.equal(going(0, 9).rate, MOTION.maxRateMove);
  assert.deepEqual(going(0, 0.6), { clip: 'strafeRight', rate: 0.6 / gaits.strafeRight });        // and as slowly as he is carried, as the push builds
  assert.deepEqual(going(-3, 0), { clip: 'stance', rate: 1 });                                    // a step-back
  assert.equal(going(5, 1).clip, 'run');                                                          // a move in his stride: he runs on
  assert.equal(legMotion({ ...still, vx: 0, vz: 4 }, gaits, 'stance', { ...look, moving: false }).clip, 'run', 'out of a move he turns and runs');
});

test('legLook says when he is in a move', () => {
  const [s, marks] = watched();
  assert.equal(legLook(s, s.players[0], marks).moving, false);
  s.players[0].move = inMove('cross', 0.1);
  assert.equal(legLook(s, s.players[0], marks).moving, true);
});
