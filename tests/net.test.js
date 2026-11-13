import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NET, createNet, stepNet } from '../src/render/net.js';
import { BALL, DT, RIM } from '../src/sim/tuning.js';

const ball = (x, y, z, vx = 0, vy = 0, vz = 0) => ({ x, y, z, vx, vy, vz });
const far = ball(0, 1, 0);
const count = (NET.knots + 1) * NET.strings;
// The farthest any knot is from where it rests, in metres.
const off = net => Math.max(...Array.from({ length: count }, (_, i) =>
  Math.hypot(net.points[3 * i] - net.rest[3 * i], net.points[3 * i + 1] - net.rest[3 * i + 1], net.points[3 * i + 2] - net.rest[3 * i + 2])));
const p = (net, row, string) => { const i = 3 * (row * NET.strings + (string % NET.strings)); return [net.points[i], net.points[i + 1], net.points[i + 2]]; };
const r = (net, row, string) => { const i = 3 * (row * NET.strings + (string % NET.strings)); return [net.rest[i], net.rest[i + 1], net.rest[i + 2]]; };
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// The most any string segment is stretched, and the most any tie is, each as a share of its rest length.
function stretch(net) {
  let most = 0;
  for (let row = 0; row < NET.knots; row++) for (let s = 0; s < NET.strings; s++)
    most = Math.max(most, gap(p(net, row, s), p(net, row + 1, s)) / gap(r(net, row, s), r(net, row + 1, s)));
  return most;
}
function given(net) {
  let most = 0;
  for (let row = 1; row <= NET.knots; row++) for (let s = 0; s < NET.strings; s++)
    most = Math.max(most, gap(p(net, row, s), p(net, row, s + 1)) / gap(r(net, row, s), r(net, row, s + 1)));
  return most;
}
const firm = net => stretch(net) <= NET.stretch + 1e-6 && given(net) <= NET.give + 1e-6;
// Drops a ball straight down through the middle of the hoop at `speed`, one frame at a time, and returns the farthest a knot got.
function swish(net, sign, speed = 5) {
  let most = 0, held = true, last = ball(sign * RIM.x, RIM.height + 0.3, 0, 0, -speed, 0);
  for (let y = last.y; y > RIM.height - 1; y -= speed * DT) {
    const now = ball(sign * RIM.x, y, 0, 0, -speed, 0);
    stepNet(net, last, now, DT); last = now;
    most = Math.max(most, off(net)); held &&= firm(net);
  }
  return { most, held };
}

test('the net hangs from the rim as a sleeve that narrows to less than the ball, at either hoop', () => {
  for (const sign of [1, -1]) {
    const net = createNet(sign);
    assert.equal(net.points.length, 3 * count);
    for (let s = 0; s < NET.strings; s++) {
      const top = p(net, 0, s), low = p(net, NET.knots, s);
      assert.ok(Math.abs(Math.hypot(top[0] - sign * RIM.x, top[2]) - RIM.radius) < 1e-6 && Math.abs(top[1] - RIM.height) < 1e-6);
      assert.ok(Math.abs(Math.hypot(low[0] - sign * RIM.x, low[2]) - NET.bottom) < 1e-6 && Math.abs(low[1] - (RIM.height - NET.length)) < 1e-6);
    }
    assert.ok(NET.bottom < BALL.radius);
  }
});

test('left alone the net hangs where it was made and is still', () => {
  const net = createNet(1);
  for (let i = 0; i < 120; i++) stepNet(net, far, far, DT);
  assert.ok(off(net) < 0.01, `${off(net)} m from its shape`);                          // gravity may settle it a little
  const then = Float32Array.from(net.points);
  for (let i = 0; i < 30; i++) stepNet(net, far, far, DT);
  const moved = Math.max(...then.map((v, i) => Math.abs(v - net.points[i])));
  assert.ok(moved < 0.001, `still moving ${moved} m`);
});

test('a ball falling through pushes the net out, never stretches a string to more than one and a half times or a tie to more than three and a half times, and the net settles within two seconds', () => {
  for (const sign of [1, -1]) {
    const net = createNet(sign), { most, held } = swish(net, sign);
    assert.ok(most >= 0.03, `pushed ${most} m`);
    assert.ok(held, 'a string or a tie stretched too far');
    for (let i = 0; i < 120; i++) { stepNet(net, far, far, DT); assert.ok(firm(net)); }
    assert.ok(off(net) < 0.01, `${off(net)} m from rest after two seconds`);
  }
});

test('the rim row never moves', () => {
  const net = createNet(1); swish(net, 1);
  for (let s = 0; s < NET.strings; s++) assert.deepEqual(p(net, 0, s), r(net, 0, s));
});

test('a ball that passes half a metre away moves nothing', () => {
  const net = createNet(1);
  for (let y = 4; y > 2; y -= 5 * DT) stepNet(net, ball(RIM.x - RIM.radius - 0.5 - BALL.radius, y + 5 * DT, 0), ball(RIM.x - RIM.radius - 0.5 - BALL.radius, y, 0), DT);
  assert.ok(off(net) < 0.001);
});

test('a ball that bounces off the rim shakes the net without touching it', () => {
  const net = createNet(1), x = RIM.x - RIM.radius, y = RIM.height + BALL.radius + RIM.tube;   // resting on the front of the rim
  stepNet(net, ball(x, y + 0.05, 0, 0, -3, 0), ball(x, y, 0, 0, 2, 0), DT);                       // it came down and went back up
  let most = 0;
  for (let i = 0; i < 12; i++) { stepNet(net, far, far, DT); most = Math.max(most, off(net)); }
  assert.ok(most >= 0.005, `shaken ${most} m`);
});

test('a ball that is placed somewhere new is not swept through the net', () => {
  const net = createNet(1);
  stepNet(net, ball(RIM.x, RIM.height + 1.5, 0), ball(RIM.x, RIM.height - 1.5, 0), DT);          // 3 m in one frame: a placement
  assert.ok(off(net) < 0.001);
});

test('a stalled frame and a paused one are safe', () => {
  const net = createNet(1), before = Float32Array.from(net.points);
  stepNet(net, ball(RIM.x, RIM.height + 0.1, 0), ball(RIM.x, RIM.height - 0.2, 0), 0);
  assert.deepEqual(net.points, before);                                                          // no time, no change
  stepNet(net, ball(RIM.x, RIM.height + 0.3, 0, 0, -5, 0), ball(RIM.x, RIM.height - 0.2, 0, 0, -5, 0), 0.1);
  stepNet(net, null, ball(RIM.x, RIM.height - 0.2, 0), 0.1);
  assert.ok(net.points.every(Number.isFinite));
  assert.ok(firm(net));
});

// A ball going in a straight line from `a` to `b` at `speed`, one frame at a time.
const path = (a, b, speed) => { const n = Math.ceil(gap(a, b) / (speed * DT)); return Array.from({ length: n + 1 }, (_, k) => ball(...a.map((v, i) => v + (b[i] - v) * k / n))); };

test('a ball held in the net, rising up through it, driven sideways through it or resting against it never takes a string or a tie past its limit, and the net comes back', () => {
  const x = RIM.x, y = RIM.height, still = (at, frames) => Array(frames).fill(ball(...at));
  const ways = {
    held: [...path([x, y + 0.3, 0], [x + 0.05, y - 0.3, 0], 3), ...still([x + 0.05, y - 0.3, 0], 300)],
    rising: path([x, y - 1, 0], [x, y + 0.5, 0], 4),
    sideways: path([x - 1, y - 0.2, 0], [x + 1, y - 0.2, 0], 5),
    resting: [...path([x - 0.6, y - 0.2, 0], [x - 0.25, y - 0.2, 0], 2), ...still([x - 0.25, y - 0.2, 0], 300)],
  };
  for (const [way, balls] of Object.entries(ways)) {
    const net = createNet(1);
    balls.reduce((last, now) => { stepNet(net, last, now, DT); assert.ok(net.points.every(Number.isFinite) && firm(net), way); return now; });
    for (let i = 0; i < 120; i++) stepNet(net, far, far, DT);
    assert.ok(off(net) < 0.01, `${way}: ${off(net)} m from rest after two seconds`);
  }
});

test('a hard rim hit only shakes the net, and only at its own hoop', () => {
  const x = RIM.x - RIM.radius, y = RIM.height + BALL.radius + RIM.tube;
  for (const [sign, most] of [[1, 0.05], [-1, 0.001]]) {
    const net = createNet(sign);
    stepNet(net, ball(x, y + 0.1, 0, 3, -8, 0), ball(x, y, 0, -2, 5, 0), DT);                     // a 14 m/s change at the hoop at +x
    let moved = 0;
    for (let i = 0; i < 60; i++) { stepNet(net, far, far, DT); moved = Math.max(moved, off(net)); }
    assert.ok(moved < most, `the net at ${sign * RIM.x} moved ${moved} m`);
  }
});

test('a ball that clangs off the front of the rim and goes back out only shivers the net', () => {
  const net = createNet(1), x = RIM.x - RIM.radius - BALL.radius - RIM.tube, y = RIM.height;   // touching the front of the ring, level with it, clear of every knot
  stepNet(net, ball(x - 0.08, y, 0, 5, 0, 0), ball(x, y, 0, -5 * BALL.rimBounce, 0, 0), DT);     // it came in at 5 m/s and bounced back out
  let most = 0;
  for (let i = 0; i < 60; i++) { stepNet(net, far, far, DT); most = Math.max(most, off(net)); }
  assert.ok(most < 0.03, `swung ${most} m`);
});

test('a make that comes in at an angle carries the net with it but does not fling it', () => {
  const net = createNet(1), vx = 2.5, vy = -5;                                                    // through the middle of the rim, going away from the shooter
  let last = ball(RIM.x - vx * 0.3 / -vy, RIM.height + 0.3, 0, vx, vy, 0);
  while (last.y > RIM.height - 1) { const now = ball(last.x + vx * DT, last.y + vy * DT, 0, vx, vy, 0); stepNet(net, last, now, DT); last = now; }
  let most = 0;
  for (let i = 0; i < 60; i++) { stepNet(net, far, far, DT); most = Math.max(most, off(net)); }
  assert.ok(most < 0.15, `after the ball had gone a knot swung ${most} m from rest`);
});

// A made shot as it falls in the game: once it is in, the ball keeps no sideways speed and drops straight down through the
// middle of the hoop at +x. Returns how far the bottom row was dragged below where it rests while the ball passed, how far
// it then rose above it, whether every string and tie kept within its limit, and how far the net was from rest two
// seconds after the ball had gone (below every knot's reach).
function make(speed) {
  const net = createNet(1), bottom = side => Math.max(...Array.from({ length: NET.strings }, (_, s) => side * (p(net, NET.knots, s)[1] - r(net, NET.knots, s)[1])));
  let last = ball(RIM.x, RIM.height + 0.3, 0, 0, -speed, 0), down = 0, up = 0, held = true;
  while (last.y > RIM.height - 0.8) {
    const now = ball(RIM.x, last.y - speed * DT, 0, 0, -speed, 0);
    stepNet(net, last, now, DT); last = now; down = Math.max(down, bottom(-1)); held &&= firm(net);
  }
  for (let i = 0; i < 120; i++) { stepNet(net, far, far, DT); up = Math.max(up, bottom(1)); held &&= firm(net); }
  return { down, up, held, left: off(net) };
}

test('a make drags the bottom of the net down, and when the ball is through it springs back up past where it hangs', () => {
  const { down, up, held, left } = make(6);
  assert.ok(down >= 0.1, `dragged down ${down} m`);
  assert.ok(up >= 0.05, `sprang up ${up} m`);
  assert.ok(held, 'a string or a tie stretched past its limit');
  assert.ok(left < 0.01, `${left} m from rest two seconds after the ball had gone`);
});

test('a slow make still drags the net down', () => {
  const { down, held, left } = make(3);
  assert.ok(down >= 0.05, `dragged down ${down} m`);
  assert.ok(held, 'a string or a tie stretched past its limit');
  assert.ok(left < 0.01, `${left} m from rest two seconds after the ball had gone`);
});

test('a make that falls well off-centre drags the net down without the strings cutting into the ball or the net jerking', () => {
  const net = createNet(1), x = RIM.x + 0.09, speed = 6;                                         // in the game a make can fall up to 10 cm off-centre
  let last = ball(x, RIM.height + 0.3, 0, 0, -speed, 0), down = 0, inside = 0, jerk = 0;
  while (last.y > RIM.height - 0.8) {
    const now = ball(x, last.y - speed * DT, 0, 0, -speed, 0), before = Float32Array.from(net.points);
    stepNet(net, last, now, DT); last = now;
    for (let i = 0; i < count; i++) {
      jerk = Math.max(jerk, Math.hypot(net.points[3 * i] - before[3 * i], net.points[3 * i + 1] - before[3 * i + 1], net.points[3 * i + 2] - before[3 * i + 2]) - speed * DT);
      if (i >= NET.strings) inside = Math.max(inside, BALL.radius - Math.hypot(net.points[3 * i] - now.x, net.points[3 * i + 1] - now.y, net.points[3 * i + 2] - now.z));
    }
    for (let s = 0; s < NET.strings; s++) down = Math.max(down, r(net, NET.knots, s)[1] - p(net, NET.knots, s)[1]);
  }
  assert.ok(down >= 0.1, `dragged down ${down} m`);
  assert.ok(inside < 0.01, `a knot went ${inside} m into the ball`);
  assert.ok(jerk < 0.02, `a knot moved ${jerk} m farther than the ball in one frame`);
});

test('a frame a hair longer than the sim\'s step is one step', () => {
  const a = createNet(1), b = createNet(1), from = ball(RIM.x, RIM.height - 0.25, 0, 0, -5, 0), to = ball(RIM.x, RIM.height - 0.25 - 5 * DT, 0, 0, -5, 0);
  stepNet(a, from, to, DT); stepNet(b, from, to, DT * (1 + 1e-12));
  assert.ok(b.points.every((v, i) => Math.abs(v - a.points[i]) < 1e-9));                      // the same, but for rounding (two steps differ by millimetres)
});
