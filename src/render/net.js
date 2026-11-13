// A hoop's net as knots on strings: gravity and drag move the knots, the ball pushes them, the strings and the ties
// between them hold them. No Three.js here, so it can be tested in Node; the scene draws a sleeve through the knots.
import { BALL, DT, RIM } from '../sim/tuning.js';

// strings: strings round the rim. knots: knots below the rim on each string. length: metres from the rim to the bottom
// row at rest. bottom: the bottom row's radius at rest, less than the ball's, so every make opens it. stretch: the most a
// string's segment (from one knot to the next one down) may be of its rest length: the strings stretch as a real net's
// mesh does, so the ball can drag the net down, and spring back. give: the most a tie (between neighbouring strings in
// one row) may be of its rest length: the ties are elastic, which is what lets the ball open a net narrower than itself,
// even a make that falls 10 cm off-centre. skin: metres added to the ball's radius where it pushes knots. jump: metres: a
// ball that moved farther than this in one call was placed, not thrown.
// drag: how quickly a knot loses its speed, per second (it keeps e^-drag of it after a second). pull: how hard a tie
// pulls back for each metre it is stretched past its rest length, per unit mass of a knot (1/s²); it pushes back as
// hard if it is squeezed. spring: the same for a string segment, firmer, so that it springs back quickly and throws the
// bottom of the net up past where it hangs; a string pushes nothing, and goes slack. grip: the share of the ball's
// downward speed a knot it touches takes, so a make drags the net down with it. passes: rounds of the ties, the ball and
// the strings in each sub-step. jolt: m/s: a change in the ball's velocity, beyond what gravity explains, larger than
// this while it touches the rim is a rim hit. shake: the share of that change the free knots are given as velocity.
// kick: m/s: the most a rim hit gives them, enough that a miss shivers the net (about 1.5 cm) where a make drags it 10 to
// 23 cm. side: the share of the sideways part of that the knots keep: pushed up, the net only lifts against its strings
// and drops back, but pushed sideways the whole of it swings like a pendulum, and a miss must not look like a make.
export const NET = Object.freeze({
  strings: 12, knots: 5, length: 0.40, bottom: 0.09, stretch: 1.5, give: 3.5, skin: 0.01, jump: 2,
  drag: 4, pull: 2500, spring: 3000, grip: 0.65, passes: 12, jolt: 1, shake: 0.1, kick: 0.25, side: 0.4,
});

const N = NET.strings, K = NET.knots, COUNT = (K + 1) * N, FREE = 3 * N, END = 3 * COUNT;
const REACH = BALL.radius + NET.skin;
// Limits are kept this share short of themselves, so rounding the places to 32-bit floats never carries a length over.
const HAIR = 1e-4;
const radius = row => RIM.radius + (NET.bottom - RIM.radius) * row / K;
// Rest lengths: every string segment is the same; TIE[row] is a tie in that row (row 0, on the rim, has none).
const SEG = Math.hypot(NET.length / K, (RIM.radius - NET.bottom) / K), SEG_MOST = SEG * NET.stretch * (1 - HAIR);
const TIE = Array.from({ length: K + 1 }, (_, row) => 2 * radius(row) * Math.sin(Math.PI / N));
const TIE_MOST = TIE.map(l => l * NET.give * (1 - HAIR));
// The strings slope inward, so gravity swings every knot outward and the ties must hold each row in. At rest every tie
// pulls this hard (per unit mass), on top of its elastic pull, so the net hangs still in the shape it was made in.
const HOLD = BALL.gravity * (RIM.radius - NET.bottom) / NET.length / (2 * Math.sin(Math.PI / N));
// Each string segment carries the knots below it, so at rest it pulls this hard (per unit mass), on top of its elastic
// pull. Shorter than SLACK[row] it has let go of all of that and is slack.
const TENSION = Array.from({ length: K + 1 }, (_, row) => (K - row + 1) * BALL.gravity * SEG / (NET.length / K));
const SLACK = TENSION.map(t => SEG - t / NET.spring);
const COS = Array.from({ length: N }, (_, s) => Math.cos(2 * Math.PI * s / N));
const SIN = Array.from({ length: N }, (_, s) => Math.sin(2 * Math.PI * s / N));

// The net of the hoop at x = sign * RIM.x. `points` and `rest` hold three world coordinates per knot, row by row from
// the rim down: knot `row * NET.strings + string`. Row 0 is on the rim and never moves. The work is done in 64-bit
// `at` (where the knots are) and `last` (where they were a sub-step ago); `h` is that sub-step's length, and `pulled`
// and `strung` are room for each tie's and each string segment's elastic pull through the passes of one sub-step.
export function createNet(sign) {
  const rest = new Float32Array(END);
  for (let row = 0; row <= K; row++) for (let s = 0; s < N; s++) {
    const i = 3 * (row * N + s);
    rest[i] = sign * RIM.x + radius(row) * COS[s]; rest[i + 1] = RIM.height - NET.length * row / K; rest[i + 2] = radius(row) * SIN[s];
  }
  return { x: sign * RIM.x, points: Float32Array.from(rest), rest, at: Float64Array.from(rest), last: Float64Array.from(rest), h: DT, pulled: new Float64Array(K * N), strung: new Float64Array(K * N) };
}

// Advances the net by `dt` seconds while the ball goes from `from` to `to` (`from` null: the ball stays at `to`), in
// sub-steps no longer than the sim's, the ball moving evenly across them.
export function stepNet(net, from, to, dt) {
  if (!(dt > 0)) return;
  const a = from ?? to, n = Math.ceil(dt / DT - 1e-9), h = dt / n;   // the match time of one frame can come out a hair over DT
  // A ball that moved too far in one call was put there: it is at `to` throughout.
  const placed = Math.hypot(to.x - a.x, to.y - a.y, to.z - a.z) > NET.jump, b = placed ? to : a;
  // A rim hit: the ball touches the rim's ring and its velocity changed by more than gravity explains.
  let kx = 0, ky = 0, kz = 0;
  if (from && !placed) {
    const dx = to.vx - from.vx, dy = to.vy - from.vy + BALL.gravity * dt, dz = to.vz - from.vz, change = Math.hypot(dx, dy, dz);
    if (change > NET.jolt && onRim(net.x, to, dt)) {
      const f = Math.min(NET.shake, NET.kick / change);
      kx = NET.side * f * dx; ky = f * dy; kz = NET.side * f * dz;
    }
  }
  const keep = Math.exp(-NET.drag * h), soft = 1 / (NET.pull * h * h), springy = 1 / (NET.spring * h * h);
  for (let k = 1; k <= n; k++) {
    move(net, keep * h / net.h, h, kx * h, ky * h, kz * h);
    net.h = h; kx = ky = kz = 0;
    const t = k / n, bx = b.x + (to.x - b.x) * t, by = b.y + (to.y - b.y) * t, bz = b.z + (to.z - b.z) * t;
    const drop = placed ? 0 : NET.grip * Math.min(0, (to.y - b.y) / n);   // the gripped share of the ball's fall in this sub-step
    net.pulled.fill(0); net.strung.fill(0);
    for (let pass = 0; pass < NET.passes; pass++) { ties(net, soft); push(net, bx, by, bz, drop); strings(net, springy); }
    follow(net);
    limit(net);
  }
  net.points.set(net.at);
}

// Whether the ball touches the ring of the rim at x = `cx`, or did within the last `dt` seconds at its speed.
function onRim(cx, ball, dt) {
  const across = Math.hypot(ball.x - cx, ball.z) - RIM.radius;
  return Math.hypot(across, ball.y - RIM.height) <= BALL.radius + RIM.tube + Math.hypot(ball.vx, ball.vy, ball.vz) * dt + 1e-6;
}

// Verlet: each free knot goes on as it was going, less drag (`scale` also turns the last sub-step's move into one of
// this sub-step's length), falls, and takes the kick `dx, dy, dz`. Then each tie and each string segment that is not
// slack draws its two knots together by its steady pull at rest: these and gravity cancel in the made shape, so the net
// hangs still in it.
function move(net, scale, h, dx, dy, dz) {
  const { at, last } = net, fall = BALL.gravity * h * h, draw = HOLD * h * h;
  for (let i = FREE; i < END; i += 3) {
    const x = at[i], y = at[i + 1], z = at[i + 2];
    at[i] += (x - last[i]) * scale + dx; at[i + 1] += (y - last[i + 1]) * scale + dy - fall; at[i + 2] += (z - last[i + 2]) * scale + dz;
    last[i] = x; last[i + 1] = y; last[i + 2] = z;
  }
  for (let row = 1; row <= K; row++) for (let s = 0; s < N; s++) {
    const i = 3 * (row * N + s), j = 3 * (row * N + (s + 1) % N);
    const ex = last[j] - last[i], ey = last[j + 1] - last[i + 1], ez = last[j + 2] - last[i + 2], d = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (d < 1e-9) continue;
    const f = draw / d;
    at[i] += ex * f; at[i + 1] += ey * f; at[i + 2] += ez * f;
    at[j] -= ex * f; at[j + 1] -= ey * f; at[j + 2] -= ez * f;
  }
  for (let row = 1; row <= K; row++) for (let s = 0; s < N; s++) {
    const i = 3 * ((row - 1) * N + s), j = 3 * (row * N + s);
    const ex = last[j] - last[i], ey = last[j + 1] - last[i + 1], ez = last[j + 2] - last[i + 2], d = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (d <= SLACK[row]) continue;
    const f = TENSION[row] * h * h / d;
    at[j] -= ex * f; at[j + 1] -= ey * f; at[j + 2] -= ez * f;
    if (row > 1) { at[i] += ex * f; at[i + 1] += ey * f; at[i + 2] += ez * f; }
  }
}

// Each tie pulls its two knots back toward its rest length like a spring: a compliant position constraint, `soft` being
// 1 / (pull * h²) and `pulled` its pull so far in this sub-step. It never ends a pass past `give` times its rest length.
function ties(net, soft) {
  const { at, pulled } = net;
  for (let row = 1; row <= K; row++) for (let s = 0; s < N; s++) {
    const i = 3 * (row * N + s), j = 3 * (row * N + (s + 1) % N), t = (row - 1) * N + s;
    const dx = at[i] - at[j], dy = at[i + 1] - at[j + 1], dz = at[i + 2] - at[j + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-9) continue;
    let step = (TIE[row] - d - soft * pulled[t]) / (2 + soft);
    if (d + 2 * step > TIE_MOST[row]) step = (TIE_MOST[row] - d) / 2;
    pulled[t] += step;
    const f = step / d;
    at[i] += dx * f; at[i + 1] += dy * f; at[i + 2] += dz * f;
    at[j] -= dx * f; at[j + 1] -= dy * f; at[j + 2] -= dz * f;
  }
}

// A free knot inside the ball (its radius plus the skin) goes out to its surface, and its last place goes with it, so it
// keeps none of the push as speed (left with it, the knots flew on past the ball and the ties ran to their limit). It
// keeps only the ball's grip: `drop`, the gripped share of the ball's fall in this sub-step, is its speed downward.
function push(net, bx, by, bz, drop) {
  const { at, last } = net;
  for (let i = FREE; i < END; i += 3) {
    const dx = at[i] - bx, dy = at[i + 1] - by, dz = at[i + 2] - bz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= REACH * REACH) continue;
    const d = Math.sqrt(d2), s = (i / 3) % N;
    if (d > 1e-9) { at[i] = bx + dx * REACH / d; at[i + 1] = by + dy * REACH / d; at[i + 2] = bz + dz * REACH / d; }
    else { at[i] = bx + COS[s] * REACH; at[i + 1] = by; at[i + 2] = bz + SIN[s] * REACH; }   // at its very centre: out the way its string hangs
    last[i] = at[i]; last[i + 1] = at[i + 1] - drop; last[i + 2] = at[i + 2];
  }
}

// Each string segment, from the rim down, pulls its two knots back toward its rest length like a firm spring, as a tie
// does (`springy` being 1 / (spring * h²) and `strung` its pull so far in this sub-step; the knot on the rim does not
// move), unless it is slack. It never ends a pass past `stretch` times its rest length.
function strings(net, springy) {
  const { at, strung } = net;
  for (let row = 1; row <= K; row++) for (let s = 0; s < N; s++) {
    const i = 3 * ((row - 1) * N + s), j = 3 * (row * N + s), t = (row - 1) * N + s, moving = row === 1 ? 1 : 2;
    const dx = at[j] - at[i], dy = at[j + 1] - at[i + 1], dz = at[j + 2] - at[i + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d <= SLACK[row]) continue;
    let step = (SEG - d - springy * strung[t]) / (moving + springy);
    if (d + moving * step > SEG_MOST) step = (SEG_MOST - d) / moving;
    strung[t] += step;
    const f = step / d;
    at[j] += dx * f; at[j + 1] += dy * f; at[j + 2] += dz * f;
    if (row > 1) { at[i] -= dx * f; at[i + 1] -= dy * f; at[i + 2] -= dz * f; }
  }
}

// Last, the strings have their way: from the rim down, a knot still farther from the one above it than its string may
// stretch is drawn up to it, whatever the ball and the ties did.
function follow(net) {
  const { at } = net;
  for (let row = 1; row <= K; row++) for (let s = 0; s < N; s++) {
    const i = 3 * ((row - 1) * N + s), j = 3 * (row * N + s);
    const dx = at[j] - at[i], dy = at[j + 1] - at[i + 1], dz = at[j + 2] - at[i + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d <= SEG_MOST) continue;
    const f = (d - SEG_MOST) / d;
    at[j] -= dx * f; at[j + 1] -= dy * f; at[j + 2] -= dz * f;
  }
}

// Rarely (in about one game make in thirty, all of them 8 to 10 cm off-centre, or a ball driven across the net) a tie is
// still past its limit after all that, the last pass on the strings having stretched it again. Then the whole net goes
// back toward its rest shape by the least share that brings every segment and tie within its limit: a length between
// one within a limit and one at rest is within it too. Its speed shrinks by the same share. A string the last pass left
// exactly at its limit can come out a rounding error over it, which is not counted.
function limit(net) {
  const { at, last, rest } = net;
  let share = 0;
  for (let row = 1; row <= K; row++) for (let s = 0; s < N; s++) for (let tie = 0; tie < 2; tie++) {
    const i = 3 * ((tie ? row : row - 1) * N + s), j = 3 * (row * N + (tie ? (s + 1) % N : s)), most = tie ? TIE_MOST[row] : SEG_MOST;
    let dx = at[i] - at[j], dy = at[i + 1] - at[j + 1], dz = at[i + 2] - at[j + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d <= most * (1 + 1e-9)) continue;
    dx = rest[i] - rest[j]; dy = rest[i + 1] - rest[j + 1]; dz = rest[i + 2] - rest[j + 2];
    share = Math.max(share, (d - most) / (d - Math.sqrt(dx * dx + dy * dy + dz * dz)));
  }
  if (share === 0) return;
  for (let i = FREE; i < END; i++) { at[i] += (rest[i] - at[i]) * share; last[i] += (rest[i] - last[i]) * share; }
}
