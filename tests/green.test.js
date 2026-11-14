import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/step.js';
import { rimCentre } from '../src/sim/ball.js';
import { SHOT_BEST, boardInWay, contest, giveBall, greenAt, releaseShot, shotWindow } from '../src/sim/players.js';
import { judgeContacts } from '../src/sim/fouls.js';
import { emptyEvents } from '../src/sim/state.js';
import { DT, RIM } from '../src/sim/tuning.js';
import { live, idle, only, run, at } from './helpers.js';

const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;
// Player 0 `far` metres straight out from the hoop he attacks, with the nearest defender `gap` metres from him toward it.
function shot(far, gap, { up = false, seed = 1, energy = 1 } = {}) {
  const s = live(seed);
  at(s, 0, RIM.x - far, 0); at(s, 3, RIM.x - far + gap, 0);
  if (up) s.players[3].y = 0.5;
  s.rosters[0][0].energy = energy;
  return s;
}
const windowOf = (...args) => { const s = shot(...args); return shotWindow(s, s.players[0]); };
// The same shooter in the air at `t` seconds after his press, about to let go.
const inAir = (s, t) => Object.assign(s.players[0], { shooting: true, shotT: t, y: 0.2, vy: 0.5 });
const scores = s => run(s, 4, idle(), st => st.score[0] > 0);

test('the green window is three steps either side of the best moment when open, two guarded, one contested, none smothered', () => {
  const steps = (...args) => { const w = windowOf(...args); return [w.level, Math.round(w.half / DT * 1e6) / 1e6]; };
  assert.deepEqual(steps(3, 2.5), ['Open', 3]);
  assert.deepEqual(steps(3, 1.5), ['Guarded', 2]);
  assert.deepEqual(steps(3, 0.8), ['Contested', 1]);
  assert.deepEqual(steps(3, 1.2, { up: true }), ['Contested', 1]);        // in the air within 1.5 m
  assert.deepEqual(steps(3, 0.65, { up: true }), ['Smothered', 0]);
  assert.equal(windowOf(3, 2.5).best, SHOT_BEST);
});

test('the level comes from the same number the make chance uses for the defender', () => {
  const s = shot(3, 1.5);
  assert.ok(near(contest(s, s.players[0]), 0.875));                       // 0.5 + 0.5 * 1.5 / 2
  s.players[3].y = 0.5; at(s, 3, RIM.x - 3 + 1.2, 0);
  assert.ok(near(contest(s, s.players[0]), 0.64));                        // (0.5 + 0.5 * 1.2 / 2) * 0.8
});

test('range and tiredness narrow the window: full to 4 m, half at 8 m, none from 12 m; a fifth narrower when exhausted', () => {
  const half = (far, options) => windowOf(far, 2.5, options).half / DT;
  assert.ok(near(half(2), 3) && near(half(4), 3) && near(half(6), 2.25) && near(half(8), 1.5) && near(half(10), 0.75), `${half(6)}`);
  assert.deepEqual([windowOf(11.9, 2.5).inRange, windowOf(12, 2.5).inRange, windowOf(13, 2.5).inRange], [true, false, false]);
  assert.ok(near(half(3, { energy: 0 }), 2.4) && near(half(3, { energy: 0.25 }), 2.7) && near(half(3, { energy: 0.5 }), 3));
});

test('a release is green within the window and half a step, and not one step further', () => {
  const open = windowOf(3, 2.5), smothered = windowOf(3, 0.65, { up: true });
  const greens = w => Array.from({ length: 46 }, (_, k) => k).filter(k => greenAt(w, k * DT));
  assert.deepEqual(greens(open), [26, 27, 28, 29, 30, 31, 32]);           // step 29 (0.483 s) is the nearest to the best moment
  assert.deepEqual(greens(windowOf(3, 1.5)), [27, 28, 29, 30, 31]);
  assert.deepEqual(greens(windowOf(3, 0.8)), [28, 29, 30]);
  assert.deepEqual(greens(smothered), [29]);                              // only the best step
  assert.deepEqual(greens(windowOf(12, 2.5)), []);                        // too far out: nothing is green
});

test('a green release goes in, for every seed and from every range', () => {
  for (let seed = 1; seed <= 40; seed++) for (const far of [0.3, 1.5, 4, 6.75, 9, 11.5]) {
    const s = shot(far, 2.5, { seed });
    inAir(s, 29 * DT);
    const report = releaseShot(s, s.players[0]);
    assert.deepEqual([report.blocked, s.shot.green], [false, true]);
    assert.ok(scores(s), `seed ${seed}, ${far} m: a green release missed`);
  }
});

test('a green release goes in from a grid of spots within 12 m of either hoop, for a shooter of each team, and draws no random number', () => {
  let tried = 0;
  for (const [id, mate] of [[0, 3], [3, 0]]) {
    const sign = id === 0 ? 1 : -1, hoop = rimCentre(sign);                // the hoop his team attacks
    for (const out of [2, 4, 6, 8, 10]) for (const side of [-8, -4, 0, 4, 8]) {
      if (Math.hypot(out, side) > 11.5) continue;
      const s = live(5), p = s.players[id], spot = `shooter ${id}, ${out} m out and ${side} m across`;
      giveBall(s, p);
      at(s, id, hoop.x - sign * out, side); at(s, mate, hoop.x - sign * (out - 2.5), side);   // the nearest defender in front of him
      p.facing = sign > 0 ? 0 : Math.PI;
      Object.assign(p, { shooting: true, shotT: 29 * DT, y: 0.2, vy: 0.5 });
      const seed = s.seed;
      const report = releaseShot(s, p);
      assert.deepEqual([report.blocked, s.shot.green], [false, true], spot);
      assert.equal(s.seed, seed, `${spot}: a green release drew a random number`);
      assert.ok(run(s, 4, idle(), st => st.score[id === 0 ? 0 : 1] > 0), `${spot}: a green release missed`);
      tried++;
    }
  }
  assert.ok(tried >= 30, `${tried} spots tried`);
});

test('a release one step outside the window can miss', () => {
  let made = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = shot(6.75, 2.5, { seed });
    inAir(s, 32 * DT);                                                    // open at 6.75 m the window is steps 27 to 31
    releaseShot(s, s.players[0]);
    assert.equal(s.shot.green, false);
    made += scores(s);
  }
  assert.ok(made > 0 && made < 40, `${made} of 40 went in`);
});

test('a block still stops a green release', () => {
  let blocked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = shot(3, 0.8, { seed, up: true });                           // a defender in the air in front of him, in reach
    inAir(s, 29 * DT); s.players[0].facing = 0;
    if (releaseShot(s, s.players[0]).blocked) {
      blocked++;
      assert.deepEqual([s.ball.mode, s.shot.green, s.shot.blocked, scores(s)], ['loose', true, true, false]);
    }
  }
  assert.ok(blocked > 0, 'none of 40 was blocked');
});

test('nothing is green from behind the backboard, where no ball can go in', () => {
  const behind = (x, z) => { const s = shot(3, 2.5); at(s, 0, x, z); return [boardInWay(s.players[0]), shotWindow(s, s.players[0]).inRange]; };
  assert.deepEqual(behind(13.5, 1), [true, false]);
  assert.deepEqual(behind(13.5, 6), [false, true]);                       // the corner: the ball passes beside the board
  assert.deepEqual(behind(12, 0.5), [false, true]);
  const t = shot(3, 2.5); at(t, 3, -13.5, 1);                             // the other team, at the other hoop
  assert.equal(boardInWay(t.players[3]), true);
});

test('the release is recorded as the rules judged it, and the next press clears the record', () => {
  const s = shot(3, 2.5);
  for (let i = 0; i < 29; i++) step(s, only(0, { shoot: true }), DT);
  assert.equal(s.shot, null);
  const { best, half, level, inRange } = shotWindow(s, s.players[0]);
  step(s, idle(), DT);
  const { at: when, clock, ...rest } = s.shot;
  assert.deepEqual(rest, { shooter: 0, t: s.players[0].shotT, best, half, level, inRange, green: true, blocked: false });
  assert.ok(Math.abs(clock - s.gameClock) <= DT + 1e-9);                  // and the game clock then
  assert.ok(near(when, s.time - DT));                                     // the match time of the step he let go on
  const again = shot(3, 2.5);
  again.shot = rest;
  step(again, only(0, { shoot: true }), DT);
  assert.equal(again.shot, null);
});

test('a reach foul on the step the shot leaves is a shooting foul: the green release still goes in, with one free throw', () => {
  let green = 0, fouled = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = live(seed), p = s.players[3];
    at(s, 3, -RIM.x + 3, 0); at(s, 0, -RIM.x + 4, 0);                     // the other team's shooter, a defender a metre behind him on the floor
    giveBall(s, p);
    Object.assign(p, { shooting: true, shotT: 28 * DT, y: 0.2, vy: 0.5, facing: Math.PI });
    step(s, only(0, { steal: true }), DT);                                // the defender acts first: he reaches as the ball leaves
    if (s.ball.holder === 0) continue;                                    // the steal won it
    assert.deepEqual([s.shot.shooter, s.shot.green, s.shot.blocked], [3, true, false]);
    green++;
    const whistle = s.pendingFoul !== null || s.call !== null;
    assert.ok(run(s, 4, idle(), st => st.score[1] > 0), `seed ${seed}: a green release missed, call ${s.call?.kind}`);
    if (!whistle) { assert.deepEqual([s.call, s.freeThrow], [null, null]); continue; }
    fouled++;
    assert.deepEqual([s.score[1], s.call.kind, s.call.team, s.call.shots, s.freeThrow.shooter, s.freeThrow.total], [2, 'shooting', 0, 1, 3, 1]);
  }
  assert.ok(green > 150 && fouled > 20, `${green} green releases, ${fouled} fouled`);
});

test('a reach foul stays a reach foul when the shot was blocked, when another player let go, and when nobody did', () => {
  const kind = release => {
    for (let seed = 1; seed <= 100; seed++) {
      const foul = judgeContacts(live(seed), { ...emptyEvents(), stealMisses: [{ by: 0, on: 3, front: false }], release }, DT);
      if (foul) return foul.kind;
    }
  };
  assert.equal(kind({ shooter: 3, defender: null, blocked: false }), 'shooting');
  assert.equal(kind({ shooter: 3, defender: null, blocked: true }), 'reach');
  assert.equal(kind({ shooter: 4, defender: null, blocked: false }), 'reach');
  assert.equal(kind(null), 'reach');
});
