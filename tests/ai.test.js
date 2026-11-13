import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, emptyIntent } from '../src/sim/state.js';
import { giveBall, SHOT_BEST, SHOT_LANDS } from '../src/sim/players.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents, isOpen, laneClear, spots } from '../src/sim/ai.js';
import { keyContains } from '../src/sim/violations.js';
import { DT, RIM, AI, VIOLATION, SHOT } from '../src/sim/tuning.js';

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
  assert.deepEqual(spots(1), [{ x: 6.9, z: -4.5 }, { x: 6.9, z: 4.5 }, { x: 10.9, z: 3.2 }]);
  assert.deepEqual(spots(-1), [{ x: -6.9, z: -4.5 }, { x: -6.9, z: 4.5 }, { x: -10.9, z: 3.2 }]);
});

test('an open handler in range, with a defender sagging into the lane, decides to shoot', () => {
  const s = live();
  put(s, 0, 7, 0); put(s, 3, 10, 0);
  assert.ok(run(s, 1.2, [0], st => st.players[0].shooting || st.ball.mode === 'shot'));
});

test('a computer shooter lets go around the best moment, in the air, and never lands with the ball', () => {
  const times = [];
  for (let seed = 1; seed <= 30; seed++) {
    const s = live(); s.seed = seed;
    put(s, 0, 7, 0); put(s, 3, 10, 0);
    assert.ok(run(s, 2, [0], st => st.ball.mode === 'shot'), `seed ${seed}: never released`);
    assert.ok(s.players[0].y > 0 || s.players[0].vy > 0, 'released from the floor');
    times.push(s.players[0].shotT);
  }
  for (const t of times) assert.ok(Math.abs(t - SHOT_BEST) <= AI.releaseJitter + DT && t > SHOT.gather && t < SHOT_LANDS - DT, `released at ${t}`);
  assert.ok(new Set(times.map(t => Math.round(t / DT))).size >= 4, 'no spread');
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
  Object.assign(s, { phase: 'quarterEnd', phaseT: 0 });   // the start of quarter 2: an inbound at half court
  step(s, Array.from({ length: 6 }, emptyIntent), DT);
  assert.equal(s.phase, 'inbound');
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
  put(s, 3, -7, 0); put(s, 0, -10, 0);                    // a defender sagging into the lane
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

test('a teammate who has just set off is led: he catches the pass without turning back for it', () => {
  const s = live();
  put(s, 0, -8, 0); put(s, 2, -12, -6);
  put(s, 1, -4, 3);                                        // at rest; his spot is far up the court
  const frame = human => {
    const all = aiIntents(s, DT).map((intent, i) => (i === 1 ? intent : emptyIntent()));
    all[0] = { ...emptyIntent(), ...human };
    step(s, all, DT);
  };
  for (let i = 0; i < 6; i++) frame({});                   // a tenth of a second: he is barely moving yet
  const mate = s.players[1], startX = mate.x;
  let furthest = mate.x, turnedBack = 0;
  frame({ pass: true });
  for (let t = 0; t < 2 && s.ball.holder === null && s.phase === 'live'; t += DT) {
    frame({});
    furthest = Math.max(furthest, mate.x);
    turnedBack = Math.max(turnedBack, furthest - mate.x);
  }
  assert.equal(s.ball.holder, 1);
  assert.ok(mate.x > startX + 1, `caught at x=${mate.x}, started at ${startX}`);
  assert.ok(turnedBack < 0.3, `he came back ${turnedBack} m for the ball`);
});

test('the receiver reacts to a pass the moment it is thrown, not at his next decision', () => {
  const s = live();
  put(s, 0, 0, 4.5); put(s, 2, -12, -6);
  put(s, 1, 6.9, 3.5);                                     // a metre short of his spot, moving across the passer's view
  const frame = human => {
    const all = aiIntents(s, DT).map((intent, i) => (i === 1 ? intent : emptyIntent()));
    all[0] = { ...emptyIntent(), ...human };
    step(s, all, DT);
  };
  for (let i = 0; i < 4; i++) frame({});                   // he has just decided where to go
  frame({ pass: true });
  const { ball } = s, flight = (2 * ball.vy) / 9.81;
  const landing = { x: ball.x + ball.vx * flight, z: ball.z + ball.vz * flight };
  frame({});
  const { ai } = s.players[1];
  const off = Math.hypot(ai.targetX - landing.x, ai.targetZ - landing.z);
  assert.ok(off < 0.5, `he is still heading ${off} m away from where the ball will land`);
  for (let t = 0; t < 2 && s.ball.holder === null && s.phase === 'live'; t += DT) frame({});
  assert.equal(s.ball.holder, 1);
});

test('a covered handler does not pass to a teammate when a defender stands in the passing lane', () => {
  const s = live();
  put(s, 0, 4, 0); put(s, 3, 5, 0);                        // handler and the man covering him
  put(s, 1, 8, -4); put(s, 4, 6.5, -2.5);                  // the only teammate in range is open, but a defender is on the line to him
  assert.ok(!run(s, 1.5, [0], st => st.ball.mode === 'pass'), 'he threw it through the defender');
});

test('a handler with nobody between him and the hoop goes all the way for the lay-up instead of pulling up', () => {
  const s = live();
  put(s, 0, 5, 1);                                         // open, in shooting range, nothing but floor ahead
  assert.ok(run(s, 4, [0], st => st.players[0].shooting));
  const from = Math.hypot(RIM.x - s.players[0].x, s.players[0].z);
  assert.ok(from < AI.layupDist, `he pulled up from ${from} m`);
});

// Team 0 has just scored at the +x hoop: the ball is dead under it and team 1 will inbound from that baseline.
function afterBasket() {
  const s = live();
  [[0, 11, -2], [1, 9, 3], [2, 12, 1], [3, 10, -3], [4, 10, 4], [5, 12.5, -1]].forEach(([id, x, z]) => put(s, id, x, z));
  Object.assign(s.ball, { holder: null, mode: 'loose', x: RIM.x, y: 0.12, z: 0, vx: 0, vy: 0, vz: 0 });
  Object.assign(s, { phase: 'dead', phaseT: 1.5, possession: 1, inboundSpot: { x: 14.5, z: 2 } });
  return s;
}

test('after a basket the team that scored runs back to its own half instead of pressing the inbound', () => {
  const s = afterBasket();
  run(s, 3.5);
  for (const p of s.players.filter(q => q.team === 0)) assert.ok(p.x < 0, `player ${p.id} is still up the court at x=${p.x}`);
});

test('while the ball is dead the player nearest the inbound spot walks to it, so he is there when play restarts', () => {
  const s = afterBasket();
  let before;
  run(s, 2, undefined, st => { if (st.phase === 'dead') before = st.players.map(p => ({ x: p.x, z: p.z })); return st.phase === 'inbound'; });
  const inbounder = s.players.find(p => p.inbounder), was = before[inbounder.id];
  const jumped = Math.hypot(was.x - 14.5, was.z - 2);
  assert.ok(jumped < 1.5, `the inbounder was moved ${jumped} m to the spot`);
});

test('an unpressured handler brings the ball up himself instead of passing it around the backcourt', () => {
  const s = live();
  put(s, 0, -9, 0); put(s, 1, -9, 4);                      // a teammate level with him, both unguarded
  put(s, 3, 4, 0); put(s, 4, 4, 2); put(s, 5, 4, -2);      // the defence waiting in its own half, in his lane
  assert.ok(!run(s, 2, [0], st => st.ball.mode === 'pass'), 'he passed sideways with nobody near him');
  assert.ok(s.players[0].x > -4, `he only got to x=${s.players[0].x}`);
});

test('the computer never picks up its dribble', () => {
  const s = live(); let held = false;
  for (let t = 0; t < 60; t += DT) { const its = aiIntents(s, DT); held ||= its.some(i => i.hold); step(s, its, DT); }
  assert.equal(held, false);
});

// A regression test: it passed before the low spot moved, because no spacing spot was inside the key.
test('a computer player left in the key steps out before 3 seconds', () => {
  const s = live(); put(s, 0, 6, 5); put(s, 1, 11, 0);
  run(s, 4, [1]);
  assert.notEqual(s.call?.kind, 'threeSeconds');
  assert.equal(keyContains(s.players[1].x, s.players[1].z, 1), false);
});

test('the low spacing spot is clear of the key', () => {
  for (const sign of [1, -1]) for (const spot of spots(sign)) assert.equal(keyContains(spot.x, spot.z, sign), false);
  assert.ok(Math.abs(spots(1)[2].z) >= VIOLATION.keyHalfWidth + 0.6);
});

test('with 5 seconds gone in the back court the handler stops looking for a pass and brings it up', () => {
  const s = live(); put(s, 0, -8, 0); put(s, 3, -7, 0); put(s, 1, -4, 4);   // covered, with an open teammate ahead
  s.backcourtT = 5.5; s.controlTeam = 0;
  assert.ok(!run(s, 1.5, [0], st => st.ball.mode === 'pass'));
  assert.ok(s.players[0].x > -8);
});
