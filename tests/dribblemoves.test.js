import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIBBLES, canMove, lateBy, startMove } from '../src/sim/moves.js';
import { SHOT_BEST, contest, greenAt, isThree, makeChance, shotWindow, trySteal } from '../src/sim/players.js';
import { rimCentre } from '../src/sim/ball.js';
import { attackSign, emptyIntent, personOf } from '../src/sim/state.js';
import { step } from '../src/sim/step.js';
import { BLOCK, DT, MOVES, PLAYER } from '../src/sim/tuning.js';
import { live, idle, only, at, run } from './helpers.js';

// Live play with player 0 holding the ball at (x, z), everybody else far from him, no coach and no waiting.
function scene(seed = 1, x = 5, z = 0) {
  const s = live(seed);
  s.playWait = [Infinity, Infinity]; s.tempo = { clock: Infinity, wait: 0 };
  at(s, 0, x, z);
  s.players.forEach((p, i) => { if (i) at(s, i, -11, (i - 3) * 2); });
  return s;
}
const hoop = s => rimCentre(attackSign(0));
const far = (s, p) => Math.hypot(p.x - hoop(s).x, p.z - hoop(s).z);
// Presses `kind` with the move keys held as `keys`, then steps for the rest of `seconds` with them still held.
function press(s, kind, keys = {}, seconds = 0) {
  step(s, only(0, { ...keys, [kind]: true }), DT);
  for (let t = DT; t < seconds - DT / 2; t += DT) step(s, only(0, keys), DT);
}
const near = (a, b, by) => Math.abs(a - b) <= by;
const setRating = (s, id, key, value) => { personOf(s, s.players[id]).ratings[key] = value; };

// Player 0 at (5, 0) attacks the hoop on +x, so across his line to it is along z.

for (const kind of DRIBBLES) {
  test(`${kind}: from a standstill he is carried its push across, to the side the keys point`, () => {
    for (const side of [1, -1]) {
      const s = scene(), p = s.players[0];
      step(s, only(0, { moveZ: side, [kind]: true }), DT);            // the keys point across; the move begins
      const from = p.z, carried = p.move.cz * MOVES[kind].keep * MOVES[kind].time;   // what the step he had begun adds
      run(s, 1, idle(), st => st.players[0].move === null);          // to the step on which it ends
      assert.ok(near((p.z - from) * side, MOVES[kind].push + carried * side, 0.02), `${kind} moved ${p.z - from}`);
      assert.ok(Math.abs(carried) < 0.3);
      assert.ok(near(p.x, 5, 0.05));
      assert.equal(p.move, null);
    }
  });
}

test('with no key held a move goes away from a defender beside him, and with nobody near toward the middle of the court', () => {
  for (const side of [1, -1]) {
    const s = scene(); at(s, 3, 5, side);
    press(s, 'cross', {}, MOVES.cross.time + DT);
    assert.equal(Math.sign(s.players[0].z), -side);
  }
  const s = scene(1, 5, 4);
  press(s, 'cross', {}, MOVES.cross.time + DT);
  assert.ok(s.players[0].z < 4);
});

test('a crossover keeps half his speed toward the hoop and behind the back keeps all of it', () => {
  for (const [kind, kept] of [['cross', 0.5], ['legs', 0.5], ['back', 1]]) {
    const s = scene(), p = s.players[0];
    run(s, 1, only(0, { moveX: 1 }));                                   // up to his running speed with the ball
    const pace = p.vx;
    assert.ok(pace > 3);
    press(s, kind, { moveX: 1 }, 0.1);
    assert.ok(p.move, kind);
    assert.ok(near(p.vx, pace * kept, 0.01), `${kind}: ${p.vx} of ${pace}`);
  }
});

test('a move does not start without the ball, in the air, with the dribble picked up, during a shot, for an inbounder or in dead play', () => {
  const cases = {
    'no ball': s => { s.ball.holder = 1; },
    'in the air': s => { s.players[0].y = 0.3; s.players[0].vy = 1; },
    'dribble picked up': s => { s.players[0].held = true; },
    shooting: s => { s.players[0].shooting = true; },
    inbounder: s => { s.players[0].inbounder = true; },
    'dead play': s => { s.phase = 'dead'; },
  };
  for (const [name, spoil] of Object.entries(cases)) for (const kind of [...DRIBBLES, 'stepBack']) {
    const s = scene(); spoil(s);
    assert.equal(canMove(s, s.players[0]), false, name);
    assert.equal(startMove(s, s.players[0], kind, emptyIntent()), false, `${name} ${kind}`);
    assert.equal(s.players[0].move, null);
  }
});

test('pressing a move with the dribble picked up is no double dribble and no travel', () => {
  const s = scene(); s.players[0].held = true;
  press(s, 'cross', {}, 0.5);
  assert.equal(s.call, null);
  assert.equal(s.phase, 'live');
  assert.equal(s.players[0].move, null);
});

test('a second move cannot start during one, nor for 0.3 s after it; then it can', () => {
  const s = scene(), p = s.players[0];
  press(s, 'cross', { moveZ: 1 }, 0.1);
  step(s, only(0, { legs: true }), DT);
  assert.equal(p.move.kind, 'cross');                                  // still the first
  run(s, MOVES.cross.time, idle());
  assert.equal(p.move, null);
  const ended = p.moved;
  while (s.time - ended < MOVES.gap - 2 * DT) { step(s, only(0, { legs: true }), DT); step(s, idle(), DT); }
  assert.equal(p.move, null, 'within the gap');
  run(s, 3 * DT, idle());
  step(s, only(0, { legs: true }), DT);
  assert.equal(p.move?.kind, 'legs');
});

test('a move takes a little energy, and a tired player is carried less far', () => {
  const s = scene(), person = personOf(s, s.players[0]);
  const before = person.energy;
  startMove(s, s.players[0], 'cross', emptyIntent());
  assert.ok(near(before - person.energy, MOVES.cost, 1e-9));
  const t = scene(); personOf(t, t.players[0]).energy = 0;
  startMove(t, t.players[0], 'cross', emptyIntent());
  assert.ok(near(t.players[0].move.push, 0.6 * MOVES.cross.push, 1e-9));
});

test('how late a defender is follows the handler\'s Handle against his Defence', () => {
  const late = (handle, defence) => { const s = scene(); setRating(s, 0, 'handle', handle); setRating(s, 3, 'defence', defence); return lateBy(s, s.players[0], s.players[3]); };
  assert.ok(near(late(70, 70), 0.25, 1e-9));
  assert.ok(near(late(90, 70), 0.45, 1e-9));
  assert.equal(late(45, 70), 0);
  assert.equal(late(99, 40), 0.6);
});

test('a defender standing close is late and cannot move until it has passed; one going the same way, or further off, is not', () => {
  const s = scene(); at(s, 3, 6.2, 0);                                  // 1.2 m in front
  const chase = () => { const intents = idle(); intents[3] = { ...emptyIntent(), moveZ: 1, sprint: true }; return intents; };
  const first = chase(); first[0] = { ...emptyIntent(), moveZ: 1, cross: true };
  step(s, first, DT);
  assert.equal(s.players[3].lateT, 0.25);
  run(s, 0.25 - 2 * DT, chase);
  assert.ok(Math.abs(s.players[3].z) < 0.05, `he moved ${s.players[3].z}`);
  run(s, 0.3, chase);
  assert.ok(s.players[3].z > 0.3);                                      // and then he follows

  const same = scene(); at(same, 3, 6.2, 0); same.players[3].vz = 1;    // already sliding that way
  startMove(same, same.players[0], 'cross', { ...emptyIntent(), moveZ: 1 });
  assert.equal(same.players[3].lateT, 0);
  const off = scene(); at(off, 3, 7, 0);                                // 2 m away
  startMove(off, off.players[0], 'cross', { ...emptyIntent(), moveZ: 1 });
  assert.equal(off.players[3].lateT, 0);
});

test('a far better handler sometimes puts a defender going the wrong way on the floor; an ordinary edge never does and draws no number', () => {
  let down = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const s = scene(seed); setRating(s, 0, 'handle', 90);
    at(s, 3, 6.2, 0); s.players[3].vz = -1.5;
    startMove(s, s.players[0], 'cross', { ...emptyIntent(), moveZ: 1 });
    if (s.players[3].stumbleT > 0) {
      down++;
      assert.deepEqual([s.players[3].stumbleT, s.players[3].lateT], [1, 1]);
      assert.deepEqual(s.last.stumble, { by: 0, on: 3, at: s.time });
    }
  }
  assert.ok(down >= 80 && down <= 120, `${down} of 400`);
  for (let seed = 1; seed <= 50; seed++) {
    const s = scene(seed); setRating(s, 0, 'handle', 80);                // an edge of 10
    at(s, 3, 6.2, 0); s.players[3].vz = -1.5;
    const before = s.seed;
    startMove(s, s.players[0], 'cross', { ...emptyIntent(), moveZ: 1 });
    assert.equal(s.players[3].stumbleT, 0);
    assert.equal(s.seed, before);
    assert.equal(s.last.stumble, null);
  }
});

test('a reach wins the ball more often against a crossover, less often between the legs, and never from in front behind the back', () => {
  // The defender at 6 m is in front of a handler facing the hoop; at 4 m he is behind him.
  const wins = (kind, x) => {
    let won = 0;
    for (let seed = 1; seed <= 4000; seed++) {
      const s = scene(seed); at(s, 3, x, 0); s.players[0].facing = 0;
      if (kind) s.players[0].move = { kind, t: 0.1, dx: 0, dz: 1, cx: 0, cz: 0, push: 1 };
      if (trySteal(s, s.players[3]).won) won++;
    }
    return won;
  };
  const plain = wins(null, 6), behind = wins(null, 4);
  assert.ok(near(wins('cross', 6) / plain, 1.5, 0.15));
  assert.ok(near(wins('legs', 6) / plain, 0.5, 0.1));
  assert.equal(wins('back', 6), 0);
  assert.ok(near(wins('back', 4) / behind, 1, 0.1));
});

test('a whistle, or losing the ball, ends a move', () => {
  const s = scene();
  press(s, 'back', { moveZ: 1 }, 0.1);
  s.phase = 'dead'; step(s, idle(), DT);
  assert.equal(s.players[0].move, null);
  const t = scene();
  press(t, 'back', { moveZ: 1 }, 0.1);
  step(t, only(0, { pass: true }), DT); step(t, idle(), DT);
  assert.equal(t.players[0].move, null);
});

// ---------- the step-back ----------

test('a step-back hops 1.3 m straight away from the hoop, stops him facing it, and keeps his dribble', () => {
  const s = scene(1, 13.2 - 6.2, 0), p = s.players[0];                 // 6.2 m out, if the rim is at 13.2
  const from = far(s, p);
  p.vx = 3;                                                           // coming forward
  press(s, 'stepBack', {}, MOVES.stepBack.time + DT);
  assert.ok(near(far(s, p) - from, 1.3, 0.05), `went ${far(s, p) - from}`);
  assert.deepEqual([p.vx, p.vz, p.held, p.move], [0, 0, false, null]);
  assert.ok(near(p.facing, 0, 1e-9));
  assert.equal(s.call, null);
});

test('a step-back behind the line makes the shot a three', () => {
  const s = scene(), p = s.players[0], rim = hoop(s);
  at(s, 0, rim.x - 6.3, 0);
  assert.equal(isThree(p.x, p.z, 1), false);
  press(s, 'stepBack', {}, MOVES.stepBack.time + DT);
  assert.equal(isThree(p.x, p.z, 1), true);
});

test('a step-back leaves a close defender late, and never on the floor', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = scene(seed); setRating(s, 0, 'handle', 99);
    at(s, 3, 6, 0); s.players[3].vx = 2;                               // coming at him, the wrong way for a step back
    startMove(s, s.players[0], 'stepBack', emptyIntent());
    assert.ok(s.players[3].lateT > 0.25);
    assert.equal(s.players[3].stumbleT, 0);
  }
});

// ---------- the post fade ----------

// Player 0 `out` metres from the hoop, on the floor, holding the ball.
function post(out, seed = 1) { const s = scene(seed); at(s, 0, hoop(s).x - out, 0); return s; }
// Holds `key` for a shot and lets go at the best moment. Returns the state at the release.
function shoot(s, key) {
  for (let t = 0; t < SHOT_BEST - DT / 2; t += DT) step(s, only(0, { [key]: true }), DT);
  return s;
}

test('inside 5.5 m the fade key starts a fade; further out it is a plain shot', () => {
  const s = post(4);
  step(s, only(0, { fade: true }), DT);
  assert.deepEqual([s.players[0].shooting, s.players[0].fading], [true, true]);
  const t = post(7);
  step(t, only(0, { fade: true }), DT);
  assert.deepEqual([t.players[0].shooting, t.players[0].fading], [true, false]);
  const u = post(4);
  step(u, only(0, { shoot: true }), DT);
  assert.deepEqual([u.players[0].shooting, u.players[0].fading], [true, false]);
});

test('a defender takes 40% less off a fade, and the fade itself goes in 8% less often', () => {
  const plain = post(4), fade = post(4);
  at(plain, 3, plain.players[0].x + 0.6, 0); at(fade, 3, fade.players[0].x + 0.6, 0);
  fade.players[0].fading = true;
  const c = contest(plain, plain.players[0]);
  assert.ok(c < 1);
  assert.ok(near(contest(fade, fade.players[0]), 1 - (1 - c) * 0.6, 1e-9));
  const open = post(4), openFade = post(4);
  open.players[0].shotT = openFade.players[0].shotT = SHOT_BEST; openFade.players[0].fading = true;
  assert.ok(near(makeChance(openFade, openFade.players[0]) / makeChance(open, open.players[0]), 0.92, 1e-9));
});

test('a fade floats him 0.8 m back from where he took off', () => {
  const s = post(4), p = s.players[0];
  const from = far(s, p);
  run(s, 2, st => (st.players[0].shooting || st.time < DT ? only(0, { fade: true }) : idle()), st => st.time > 0.5 && st.players[0].y === 0 && !st.players[0].shooting);
  assert.ok(near(far(s, p) - from, 0.8, 0.12), `drifted ${far(s, p) - from}`);
});

test('the fade key held from 7 m is held like the shoot key: the same shot, let go when the key is', () => {
  const a = post(7), b = post(7);
  shoot(a, 'fade'); shoot(b, 'shoot');
  assert.deepEqual([a.players[0].shooting, a.players[0].fading, a.players[0].shotT], [b.players[0].shooting, false, b.players[0].shotT]);
  assert.equal(a.players[0].shooting, true);                          // still in his hands: the key is still down
  step(a, idle(), DT); step(b, idle(), DT);
  assert.equal(a.ball.mode, 'shot');
  assert.deepEqual([a.ball.vx, a.ball.vy, a.ball.vz], [b.ball.vx, b.ball.vy, b.ball.vz]);
  assert.ok(near(a.players[0].x, b.players[0].x, 1e-9));              // no drift
});

test('a fade let go at the best moment is green just when a plain shot against that contest would be', () => {
  const s = post(4);
  shoot(s, 'fade');
  const window = shotWindow(s, s.players[0]);
  assert.equal(greenAt(window, s.players[0].shotT), true);
  step(s, idle(), DT);
  assert.equal(s.shot.green, true);
  assert.equal(s.players[0].fading, false);                           // the shot has left his hand
});

test('a jumper a metre in front can block a plain shot and cannot reach a fade', () => {
  const blocked = key => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = post(4, seed);
      shoot(s, key);
      Object.assign(s.players[3], { x: s.players[0].x + 1.0, z: s.players[0].z, y: 0.5, vy: 0.1 });   // up, a metre toward the hoop
      step(s, idle(), DT);
      if (s.shot?.blocked) n++;
    }
    return n;
  };
  assert.ok(blocked('shoot') > 30);
  assert.equal(blocked('fade'), 0);
  assert.ok(BLOCK.reach * MOVES.fade.block < 1);
});

test('a fade that comes down with the ball is a travel and is over', () => {
  const s = post(4);
  run(s, 2, only(0, { fade: true }), st => st.call !== null);
  assert.equal(s.call?.kind, 'travel');
  assert.equal(s.players[0].fading, false);
});
