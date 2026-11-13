import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/step.js';
import { SHOT_BEST, SHOT_LANDS, gathering, makeChance, shotTiming, trySteal } from '../src/sim/players.js';
import { DT, PLAYER, RIM, SHOT } from '../src/sim/tuning.js';
import { live, idle, only, at } from './helpers.js';

const steps = (s, n, intents) => { for (let i = 0; i < n; i++) step(s, intents, DT); };
const hold = only(0, { shoot: true });
const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;

test('pressing shoot with the ball starts a gather: 18 steps on the floor, facing the hoop, braking, deaf to the move keys', () => {
  const s = live(), p = s.players[0];
  steps(s, 30, only(0, { moveZ: 1, sprint: true }));                      // sprinting across the court
  const keys = only(0, { moveZ: 1, sprint: true, shoot: true }), from = { x: p.x, z: p.z };
  step(s, keys, DT);                                                      // the press
  const toHoop = Math.atan2(-p.z, RIM.x - p.x);
  assert.deepEqual([p.shooting, gathering(p), p.shotT, p.facing], [true, true, 0, toHoop]);
  steps(s, 17, keys);
  assert.deepEqual([gathering(p), p.y, p.vy, p.vx, p.vz, p.facing], [true, 0, 0, 0, 0, toHoop]);   // stopped, still on the floor, still facing it
  assert.ok(Math.hypot(p.x - from.x, p.z - from.z) < 0.8, 'he slid more than his braking distance');
  step(s, keys, DT);                                                      // 0.3 s after the press
  assert.deepEqual([gathering(p), p.vy, p.y, s.ball.holder], [false, PLAYER.shotJumpV, 0, 0]);
});

test('the shot jump is small: about 0.25 m high and 0.45 s long; a jump without the ball is as high as ever', () => {
  const s = live(), p = s.players[0], d = s.players[3];
  let peak = 0, air = 0, other = 0;
  for (let i = 0; i < 70; i++) {
    const keys = idle();
    keys[0].shoot = true; keys[3].shoot = i === 0;                        // the shooter holds Space; a defender jumps once
    step(s, keys, DT);
    if (s.ball.holder === 0) { peak = Math.max(peak, p.y); air += p.y > 0; }
    other = Math.max(other, d.y);
  }
  assert.ok(near(peak, PLAYER.shotJumpV ** 2 / (2 * 9.81), 0.01), `peak ${peak}`);     // 0.247 m
  assert.ok(near(air * DT, 0.45, 0.02), `${air} steps in the air`);
  assert.ok(near(other, 0.8155, 0.01), `a defender's jump peaked at ${other}`);
});

test('the best moment is 0.48 s after the press: the full chance there, 60% of it at the press and at the landing', () => {
  assert.ok(near(SHOT_BEST, 0.4794, 0.0005) && near(SHOT_LANDS, 0.7485, 0.0005), `${SHOT_BEST} ${SHOT_LANDS}`);
  assert.equal(shotTiming(SHOT_BEST), 1);
  assert.ok(near(shotTiming(0), SHOT.worstTiming) && near(shotTiming(SHOT_LANDS), SHOT.worstTiming));
  assert.ok(near(shotTiming(SHOT_BEST / 2), 0.8) && near(shotTiming((SHOT_BEST + SHOT_LANDS) / 2), 0.8));   // a straight line each side
  assert.equal(shotTiming(2), SHOT.worstTiming);                                                           // never below the worst
  const s = live(), p = s.players[0];
  p.shotT = SHOT_BEST;
  const full = makeChance(s, p);
  p.shotT = 0;
  assert.ok(near(makeChance(s, p) / full, SHOT.worstTiming));
});

test('letting go in the air releases the ball on that step', () => {
  const s = live(), p = s.players[0];
  steps(s, 29, hold);
  assert.deepEqual([s.ball.holder, p.shooting, p.y > 0], [0, true, true]);
  step(s, idle(), DT);
  assert.deepEqual([s.ball.mode, s.ball.holder, s.ball.shooter, p.shooting], ['shot', null, 0, false]);
  assert.ok(near(p.shotT, 29 * DT), `released ${p.shotT} s after the press`);     // 0.483 s: the step nearest the best moment
});

test('letting go during the gather: the ball leaves on the step his feet leave the floor, with the timing that moment earns', () => {
  const s = live(), p = s.players[0];
  steps(s, 5, hold); steps(s, 3, idle()); steps(s, 10, hold);             // let go early; pressing again changes nothing
  assert.deepEqual([s.ball.holder, p.shooting, p.y, p.vy], [0, true, 0, 0]);   // 18 steps: nothing has left his hand
  step(s, hold, DT);
  assert.deepEqual([s.ball.mode, s.ball.shooter, p.shooting, p.vy], ['shot', 0, false, PLAYER.shotJumpV]);
  assert.ok(near(p.shotT, SHOT.gather) && near(shotTiming(p.shotT), 0.8503, 0.001), `${p.shotT}`);
});

test('landing with the ball is still a travel, 0.75 s after the press', () => {
  const s = live(); let n = 0;
  while (s.phase === 'live' && n < 80) { step(s, hold, DT); n++; }
  assert.deepEqual([s.call?.kind, s.call?.team, n, s.players[0].shooting], ['travel', 0, 46, false]);
});

test('a pass out of the gather is allowed and ends the shot', () => {
  const s = live(), p = s.players[0];
  steps(s, 6, hold);
  step(s, only(0, { shoot: true, pass: true }), DT);
  assert.deepEqual([s.ball.mode, p.shooting, gathering(p)], ['pass', false, false]);
  steps(s, 20, idle());
  assert.deepEqual([p.y, s.call], [0, null]);                             // he never leaves the floor
});

test('a steal during the gather takes the ball and ends the shot', () => {
  const s = live(), p = s.players[0];
  at(s, 3, 5.8, -3);                                                      // a defender within reach
  steps(s, 6, hold);
  let won = false;
  for (let i = 0; i < 200 && !won; i++) { s.players[3].stealCooldown = 0; won = trySteal(s, s.players[3]).won; }
  assert.deepEqual([s.ball.holder, p.shooting, gathering(p)], [3, false, false]);
  steps(s, 20, hold);
  assert.deepEqual([p.y, p.vy, s.ball.holder], [0, 0, 3]);                // no jump follows, and nothing leaves his hands
});

test('a whistle during the gather ends the shot: he is not left planted through the stoppage', () => {
  const s = live(), p = s.players[0];
  s.shotClock = 0.1;
  steps(s, 10, hold);
  assert.deepEqual([s.phase, s.call.kind, p.shooting, gathering(p)], ['dead', 'shotClock', false, false]);
  steps(s, 12, only(0, { moveX: 1 }));
  assert.ok(p.vx > 3, `he could not walk away: vx ${p.vx}`);
});

test('the slide of a gather does not count toward a travel for a player who has picked up his dribble', () => {
  const s = live(), p = s.players[0];
  steps(s, 30, only(0, { moveZ: 1, sprint: true }));
  Object.assign(p, { held: true, steps: 1.2 });
  steps(s, 30, only(0, { moveZ: 1, sprint: true, shoot: true }));
  step(s, idle(), DT);
  assert.deepEqual([s.phase, s.call, s.ball.mode], ['live', null, 'shot']);
  assert.ok(p.steps < 1.5, `${p.steps} m counted`);
});
