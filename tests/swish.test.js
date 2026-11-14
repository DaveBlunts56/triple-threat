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
// rules launch it (`made`, and `rattle` as releaseShot passes it), then played through the game's own step for three
// seconds with everyone else far away. Returns what the ball did.
function shoot(id, out, side, { made = true, rattle = false, seed = 3 } = {}) {
  const s = live(seed), p = s.players[id], sign = id < 3 ? 1 : -1, hoop = rimCentre(sign);
  s.players.forEach((q, i) => { if (i !== id) at(s, i, -sign * 11, (i - 2.5) * 2); });
  at(s, id, hoop.x - sign * out, side);
  giveBall(s, p);
  Object.assign(s.ball, { x: p.x, y: 2.5, z: p.z });
  launchShot(s, p, made, 2, rattle);
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
    const f = shoot(seed % 2 ? 0 : 3, out, side, { rattle: true, seed });
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

test('a green release always swishes and draws no random number; other makes sometimes rattle in', () => {
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
  assert.ok(share > 0.1 && share < SHOT.rattle + 0.1, `${rattled} of ${made} makes came off the rim; ${SHOT.rattle} asked for`);
});
