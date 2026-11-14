import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/step.js';
import { rimCentre } from '../src/sim/ball.js';
import { giveBall, launchShot, releaseShot } from '../src/sim/players.js';
import { BALL, DT, HOOP_NET, RIM, SHOT } from '../src/sim/tuning.js';
import { live, idle, at } from './helpers.js';

// Did something other than gravity change the ball's velocity over one step from `was`? In the air above the net's
// bottom, before a basket, that can only be the rim or the backboard.
const knocked = (was, ball) => Math.hypot(ball.vx - was.vx, ball.vy - was.vy + BALL.gravity * DT, ball.vz - was.vz) > 0.05;

// A shot by player `id` from `out` metres in front of the hoop he attacks and `side` metres across, launched as the
// rules launch it (`made`, and `how` as releaseShot passes it), then played through the game's own step for three
// seconds with everyone else far away. Returns what the ball did.
function shoot(id, out, side, { made = true, how = 'clean', seed = 3 } = {}) {
  const s = live(seed), p = s.players[id], sign = id < 3 ? 1 : -1, hoop = rimCentre(sign);
  s.players.forEach((q, i) => { if (i !== id) at(s, i, -sign * 11, (i - 2.5) * 2); });
  at(s, id, hoop.x - sign * out, side);
  giveBall(s, p);
  Object.assign(s.ball, { x: p.x, y: 2.5, z: p.z });
  launchShot(s, p, made, 2, how);
  const seen = { scored: false, touched: false, rimGap: Infinity, after: null, off: 0, exit: null, bounced: false, top: 0 };
  const netBottom = RIM.height - HOOP_NET.depth;
  for (let i = 0; i < 180; i++) {
    const before = s.score[id < 3 ? 0 : 1], wasAbove = s.ball.y >= netBottom, vyBefore = s.ball.vy, was = { ...s.ball };
    step(s, idle(), DT);
    const b = s.ball, across = Math.hypot(b.x - hoop.x, b.z);
    if (!seen.scored && s.score[id < 3 ? 0 : 1] === before && knocked(was, b)) seen.touched = true;   // not the net's doing
    seen.rimGap = Math.min(seen.rimGap, Math.hypot(across - RIM.radius, b.y - RIM.height));
    if (!seen.scored && s.score[id < 3 ? 0 : 1] > before) { seen.scored = true; seen.after = Math.hypot(b.vx, b.vz); }
    if (seen.scored && b.y > netBottom && b.y < RIM.height && !seen.bounced) seen.off = Math.max(seen.off, across);
    if (seen.scored && wasAbove && b.y < netBottom && seen.exit === null) seen.exit = -b.vy;
    if (seen.scored && vyBefore < 0 && b.vy > 0) seen.bounced = true;
    if (seen.bounced) seen.top = Math.max(seen.top, b.y + BALL.radius);
  }
  return seen;
}

const TOUCH = BALL.radius + RIM.tube;   // a ball this close to the rim's ring is touching it
const SPOTS = [[1.5, 0], [4.5, 0], [4.5, 3], [7.2, 0], [6, -5], [0.9, 6.4], [9, 2]];

test('a made shot swishes: it never touches the rim, and it keeps going through the net instead of stopping dead', () => {
  for (const id of [0, 3]) for (const [out, side] of SPOTS) {
    const f = shoot(id, out, side), where = `player ${id} from ${out} m out, ${side} m across`;
    assert.ok(f.scored, `${where}: did not score`);
    assert.ok(!f.touched && f.rimGap > TOUCH + 0.005, `${where}: touched the rim (${f.rimGap.toFixed(3)} m from it)`);
    assert.ok(f.after > 0.2, `${where}: stopped dead as it scored (${f.after.toFixed(2)} m/s sideways)`);
  }
});

test('the net slows the ball: it stays inside the net, drops out of it gently, and its bounce does not come back up to the net', () => {
  for (const id of [0, 3]) for (const [out, side] of SPOTS) {
    const f = shoot(id, out, side), where = `player ${id} from ${out} m out, ${side} m across`;
    assert.ok(f.off <= 0.12, `${where}: carried ${f.off.toFixed(3)} m off the hoop's centre inside the net`);
    assert.ok(f.exit !== null && f.exit <= HOOP_NET.exit + 0.6, `${where}: left the net at ${f.exit} m/s`);
    assert.ok(f.bounced && f.top < RIM.height - HOOP_NET.depth, `${where}: bounced back up to ${f.top.toFixed(2)} m`);
  }
});

test('a make that is asked to rattle in always scores, and bounces on the rim first at least a third of the time', () => {
  let rattled = 0, tried = 0;
  for (let seed = 1; seed <= 30; seed++) for (const [out, side] of [[4.5, 0], [7.2, 0], [6, -5], [2, 1]]) {
    const f = shoot(seed % 2 ? 0 : 3, out, side, { how: 'rattle', seed });
    assert.ok(f.scored, `seed ${seed} from ${out} m out, ${side} m across: a made shot missed`);
    tried++; rattled += f.touched;
  }
  assert.ok(rattled >= tried / 3, `${rattled} of ${tried} came off the rim`);   // few aims rattle in, fewer from far out
});

// Player 0, open, 5 m straight out, in the air `steps` steps after his press, lets go; the flight is then watched.
function release(steps, seed) {
  const s = live(seed), p = s.players[0], hoop = rimCentre(1);
  s.players.forEach((q, i) => { if (i) at(s, i, -11, (i - 2.5) * 2); });
  at(s, 0, hoop.x - 5, 0);
  Object.assign(p, { shooting: true, shotT: steps * DT, y: 0.2, vy: 0.5 });
  const before = s.seed;
  releaseShot(s, p);
  const flight = { green: s.shot.green, drew: s.seed !== before, scored: false, touched: false };
  for (let i = 0; i < 180; i++) {
    const was = { ...s.ball };
    step(s, idle(), DT);
    if (!flight.scored && s.score[0] === 0 && knocked(was, s.ball)) flight.touched = true;   // not the net's doing
    flight.scored ||= s.score[0] > 0;
  }
  return flight;
}

test('a green release always swishes and draws no random number; other makes go in off the rim or the glass more often than not', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const f = release(29, seed);
    assert.deepEqual([f.green, f.drew, f.scored, f.touched], [true, false, true, false], `seed ${seed}`);
  }
  let made = 0, rattled = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const f = release(34, seed);                                           // late: outside the green window
    assert.equal(f.green, false);
    if (f.scored) { made++; rattled += f.touched; }
  }
  const share = rattled / made;
  assert.ok(made >= 40, `${made} of 200 went in`);
  // Seven in ten are asked to come off something; a few of those find no such shot from there and swish after all.
  assert.ok(share > 0.3 && share < 1 - SHOT.ways[0] + 0.1, `${rattled} of ${made} makes came off the rim; ${1 - SHOT.ways[0]} asked for`);
});

// ---------- no two shots alike ----------

// A shot by player 0 from `out` metres in front of the hoop and `side` across, launched at match time `time`, and
// its flight played ahead with the ball's own physics: the angle it left at, and what it touched.
async function flown(out, side, { made = true, how = 'clean', seed = 3, time = 0 } = {}) {
  const { stepBall } = await import('../src/sim/ball.js');
  const s = live(seed), p = s.players[0], hoop = rimCentre(1);
  s.players.forEach((q, i) => { if (i) at(s, i, -11, (i - 2.5) * 2); });
  at(s, 0, hoop.x - out, side);
  giveBall(s, p);
  Object.assign(s.ball, { x: p.x, y: 2.5, z: p.z });
  s.time = time;
  launchShot(s, p, made, 2, how);
  const flight = { ...s.ball }, seen = { angle: Math.atan2(flight.vy, Math.hypot(flight.vx, flight.vz)), bounces: 0, board: false, scored: false };
  for (let step = 0, last = -9; step < 400 && flight.y > RIM.height - 1; step++) {
    const events = stepBall(flight, DT);
    if (events.hitBoard) seen.board = true;
    if (events.hitRim) { if (step - last > 2) seen.bounces++; last = step; }
    if (events.scored) { seen.scored = events.scored === 1; break; }
  }
  return seen;
}

test('no two shots from one spot fly alike: each is thrown a little flatter or higher, and a clean make still drops without touching anything', async () => {
  const angles = [];
  for (const time of [0.4, 1.7, 3.1, 5.9, 8.2, 11.6, 14.3, 19.9]) {
    const f = await flown(6.5, 1, { time });
    assert.deepEqual([f.scored, f.bounces, f.board], [true, 0, false], `at ${time} s`);
    angles.push(f.angle);
  }
  const sorted = [...angles].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] > 1e-4, 'two shots left at the same angle');
  assert.ok(sorted.at(-1) - sorted[0] > 0.08, `the arcs differ by only ${sorted.at(-1) - sorted[0]} rad`);
  assert.ok(sorted.at(-1) - sorted[0] <= SHOT.loft + 1e-9);
  // A lay-up is thrown as it must be: no higher.
  const close = await Promise.all([0.4, 5.9, 11.6].map(time => flown(1.2, 0.3, { time })));
  assert.ok(close.every(f => f.scored && Math.abs(f.angle - close[0].angle) < 1e-9));
});

test('a make asked to roll bounces on the rim twice or more before it drops, and one asked to bank goes in off the glass, when such a shot is there', async () => {
  let rolled = 0, banked = 0, tried = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const [out, side] = [[4.5, 2.5], [6, -3], [3.5, 3], [5.5, 0.5]][seed % 4];
    const roll = await flown(out, side, { how: 'roll', seed }), bank = await flown(out, side, { how: 'bank', seed });
    assert.ok(roll.scored && bank.scored, `seed ${seed}: a make did not go in`);
    tried++; rolled += roll.bounces >= SHOT.rollBounces; banked += bank.board;
  }
  assert.ok(rolled >= tried / 3, `${rolled} of ${tried} rolled on the rim`);
  assert.ok(banked >= tried / 3, `${banked} of ${tried} went in off the glass`);
});

test('a miss asked to tease sits on the rim, bouncing twice or more, and falls out', async () => {
  let teased = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const f = await flown(5, (seed % 5) - 2, { made: false, how: 'tease', seed });
    if (f.bounces >= SHOT.rollBounces) { teased++; assert.equal(f.scored, false, `seed ${seed}: it went in`); }
  }
  assert.ok(teased >= 8, `${teased} of 24 sat on the rim`);
});
