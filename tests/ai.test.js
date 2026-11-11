import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, emptyIntent } from '../src/sim/state.js';
import { giveBall } from '../src/sim/players.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents, isOpen, laneClear, spots } from '../src/sim/ai.js';
import { DT, RIM, AI } from '../src/sim/tuning.js';

// Live play with everyone parked out of the way; tests then place the players they care about.
function live(holderId = 0) {
  const s = createMatch();
  startMatch(s);
  s.phase = 'live';
  s.players.forEach(p => { p.inbounder = false; p.x = p.team === 0 ? -12 : -13; p.z = -6 + p.slot; });
  giveBall(s, s.players[holderId]);
  return s;
}
const put = (s, id, x, z) => Object.assign(s.players[id], { x, z });
// Runs the match with the AI driving only the players in `ids` (everyone when omitted).
function run(s, seconds, ids, done) {
  for (let t = 0; t < seconds; t += DT) {
    const all = aiIntents(s, DT);
    step(s, ids ? all.map((intent, i) => (ids.includes(i) ? intent : emptyIntent())) : all, DT);
    if (done?.(s)) return true;
  }
  return false;
}

test('isOpen is false with a defender 1 m away, true at 3 m', () => {
  const s = live();
  put(s, 0, 5, 0); put(s, 3, 6, 0);
  assert.equal(isOpen(s, s.players[0]), false);
  put(s, 3, 8, 0);
  assert.equal(isOpen(s, s.players[0]), true);
});

test('laneClear is false with a defender standing on the line to the hoop', () => {
  const s = live();
  put(s, 0, 4, 0); put(s, 3, 8, 0.3);
  assert.equal(laneClear(s, s.players[0]), false);
  put(s, 3, 8, 3);
  assert.equal(laneClear(s, s.players[0]), true);
  put(s, 3, 2, 0);   // behind the handler: not in the way
  assert.equal(laneClear(s, s.players[0]), true);
});

test('spots mirror for each hoop', () => {
  assert.deepEqual(spots(1), [{ x: 6.9, z: -4.5 }, { x: 6.9, z: 4.5 }, { x: 10.9, z: 2.5 }]);
  assert.deepEqual(spots(-1), [{ x: -6.9, z: -4.5 }, { x: -6.9, z: 4.5 }, { x: -10.9, z: 2.5 }]);
});

test('an open handler in range decides to shoot', () => {
  const s = live();
  put(s, 0, 7, 0);
  assert.ok(run(s, 1.2, [0], st => st.players[0].shooting || st.ball.mode === 'shot'));
});

test('an AI shot is released near the top of the jump', () => {
  const s = live();
  put(s, 0, 7, 0);
  assert.ok(run(s, 1.5, [0], st => st.ball.mode === 'shot'), 'never released');
  assert.ok(s.players[0].y > 0.5, `released at height ${s.players[0].y}`);
});

test('a handler with 3 s on the shot clock shoots even when covered and far out', () => {
  const s = live();
  put(s, 0, 2, 0); put(s, 3, 3, 0);
  s.shotClock = 3;
  assert.ok(run(s, 0.6, [0], st => st.players[0].shooting || st.ball.mode === 'shot'));
});

test('a covered handler with an open teammate passes', () => {
  const s = live();
  put(s, 0, 4, 0); put(s, 3, 5, 0); put(s, 1, 8, -4);
  assert.ok(run(s, 1.2, [0], st => st.ball.mode === 'pass'));
  assert.ok(s.ball.vz < 0, 'pass should head toward the open teammate');
});

test('a handler with a clear lane drives to the hoop', () => {
  const s = live();
  put(s, 0, 0, 0);
  run(s, 1, [0]);
  assert.ok(s.players[0].x > 3, `only reached x=${s.players[0].x}`);
});

test('a defender moves to stand between their opponent and the hoop', () => {
  const s = live(4);           // team 1 has the ball; player 0 guards player 3 (same slot), who is off the ball
  put(s, 3, -5, 2); put(s, 4, -8, -5); put(s, 0, 0, 0);
  run(s, 3, [0]);
  const man = s.players[3], d = Math.hypot(-RIM.x - man.x, -man.z);
  const gx = man.x + ((-RIM.x - man.x) / d) * AI.offBallGap, gz = man.z + (-man.z / d) * AI.offBallGap;
  const off = Math.hypot(s.players[0].x - gx, s.players[0].z - gz);
  assert.ok(off < 0.5, `defender is ${off} m from the guard point`);
});

test('a defender jumps when the player they guard shoots', () => {
  const s = live(3);
  put(s, 3, -6, 0); put(s, 0, -7, 0);
  s.players[3].shooting = true; s.players[3].vy = 4;   // their man has just gone up
  let jumped = false;
  run(s, 0.6, [0], st => (jumped ||= st.players[0].y > 0));
  assert.ok(jumped);
});

test('the AI inbounder passes within 2 s', () => {
  const s = createMatch();
  startMatch(s);
  assert.ok(run(s, 2, null, st => st.ball.mode === 'pass' || st.phase === 'live'));
});

test('someone goes and gets a loose ball', () => {
  const s = live();
  put(s, 0, 6, 0); put(s, 3, 6, 2);
  Object.assign(s.ball, { holder: null, mode: 'loose', x: 10, y: 0.12, z: 3, vx: 0, vy: 0, vz: 0 });
  assert.ok(run(s, 3, null, st => st.ball.holder !== null));
});

test('the receiver runs to meet a pass thrown ahead of them', () => {
  const s = live();
  put(s, 0, 4, 0); put(s, 1, 8, -4);
  const d = Math.hypot(6, -4), speed = 14, t = d / speed;
  Object.assign(s.ball, {
    holder: null, mode: 'pass', noPickupId: 0, noPickupT: 0.3,
    x: 4, y: 1.3, z: 0, vx: (6 / d) * speed, vy: (9.81 * t) / 2, vz: (-4 / d) * speed,
  });
  s.lastTouch = 0;
  assert.ok(run(s, 1.5, [1], st => st.ball.holder !== null), 'nobody caught it');
  assert.equal(s.ball.holder, 1);
});

test('a player who grabs a ball near the baseline does not run it out of bounds', () => {
  const s = live();
  put(s, 0, 11, -1);
  Object.assign(s.ball, { holder: null, mode: 'loose', x: 13.7, y: 0.12, z: -3, vx: 0, vy: 0, vz: 0 });
  let carriedOut = false;
  run(s, 3, [0], st => { carriedOut ||= st.ball.holder === 0 && (Math.abs(st.players[0].x) > 14 || Math.abs(st.players[0].z) > 7.5); });
  assert.equal(carriedOut, false);
  assert.ok(s.possession === 0 || s.score[0] > 0, 'team 0 should not have turned it over');
});

test('a handler behind the backboard comes back out instead of shooting through it', () => {
  const s = live();
  put(s, 0, 13.5, -2);
  let shotFromBehind = false;
  run(s, 1.5, [0], st => { shotFromBehind ||= st.players[0].shooting && st.players[0].x > RIM.x; });
  assert.equal(shotFromBehind, false);
  assert.ok(s.players[0].x < RIM.x || s.ball.holder !== 0, `still behind the board at x=${s.players[0].x}`);
});

test('a covered handler in the backcourt does not throw a full-court pass', () => {
  const s = live();
  put(s, 0, -10, 0); put(s, 3, -9, -0.9); put(s, 1, 10, 5);   // defender blocks the lane but not the passing line
  const passed = run(s, 1, [0], st => st.ball.mode === 'pass');
  assert.equal(passed, false);
  assert.ok(s.players[0].x > -10, 'handler should bring the ball up instead');
});

test('team 1 plays the mirror image: an open handler in range of the -x hoop shoots', () => {
  const s = live(3);
  s.players.forEach(p => { if (p.id !== 3) put(s, p.id, 12, -6 + p.slot); });
  put(s, 3, -7, 0);
  assert.ok(run(s, 1.2, [3], st => st.players[3].shooting || st.ball.mode === 'shot'));
});

test('a pass thrown ahead of a running teammate is caught when the human touches nothing', () => {
  const s = live();
  put(s, 0, 0, 0); put(s, 2, -12, 5);
  Object.assign(s.players[1], { x: 6, z: -3, vz: 5 });   // crossing the passer's view at a run
  const frame = human => {
    const all = aiIntents(s, DT);
    all[s.controlled] = { ...emptyIntent(), ...human };
    step(s, all, DT);
  };
  frame({ pass: true });
  assert.equal(s.ball.mode, 'pass');
  for (let t = 0; t < 2 && s.ball.holder === null && s.phase === 'live'; t += DT) frame({});
  assert.equal(s.ball.holder, 1);
});
