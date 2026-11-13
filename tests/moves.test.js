import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legMotion, armMotion, newMarks, noteChanges, drawnFacing, legLook, manOf, defending, dribbleHand, passArrival, airTime, MOTION } from '../src/render/motion.js';
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
  const face = () => { noteChanges(marks, s, DT); return drawnFacing(s, s.players[3], marks); };
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
  const guarding = v => { s.players[3].vx = v; noteChanges(marks, s, DT); return marks.guard[3]; };
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
  assert.equal(legLook(s, s.players[0], marks).crouch, false);
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

test('at the line he holds the ball, and a free throw is a set shot', () => {
  const s = live(), marks = newMarks();
  s.freeThrow = newFreeThrow(0, 2); setupFreeThrow(s);
  noteChanges(marks, s, DT);
  for (let i = 0; i < 12; i++) noteChanges(marks, s, DT);                 // the catch has played out
  assert.match(arms(s, marks, 0).clip, /^hold/);
  press(s); noteChanges(marks, s, 2 * DT);
  assert.deepEqual([s.ball.mode, arms(s, marks, 0)], ['shot', { clip: 'freeThrow', at: 0 }]);
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
  assert.equal(hand(6, -1), 'right');
  assert.equal(hand(10, 3), 'right');                    // nobody within 4 m: no reason to switch
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
