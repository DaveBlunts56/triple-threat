// What the people round the court do, worked out from the match alone: the crowd's mood, and where the referees stand
// and what they signal. Plain logic, no Three.js, so it can be tested without a browser. Team 0 is the home team.
import { CLOCK, COURT } from '../sim/tuning.js';
import { attackSign } from '../sim/state.js';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const FOULS = ['reach', 'block', 'shooting', 'charge'];

// cheer, cheerThree: seconds a team's fans are on their feet after it scores, and after a three. boo: seconds the home
// fans boo a foul called on their team. blowout: the lead at which fans start to leave in the last period. leaveMost:
// the most of the crowd that goes. leaveRate: the share that can go in a second. flashes: photographers' flashes at a
// basket. shake: how far the picture shakes, in metres, while the fans behind the hoop put off a free-throw shooter.
export const LIFE = Object.freeze({ cheer: 2.2, cheerThree: 3.2, boo: 2.6, blowout: 18, leaveMost: 0.45, leaveRate: 0.012, flashes: 4, shake: 0.05, groan: 1.5 });

// cheer: seconds each team's fans have left on their feet. boo: seconds of booing left. distract: the end (+1 or -1)
// whose fans are waving at a free-throw shooter, or 0. shake: how far the picture shakes now. left: the share of the
// crowd that has gone home. flashes: photographers' flashes still to fire. groan: seconds left of the home crowd's
// groan at a big moment for the visitors.
export const createLife = () => ({ cheer: [0, 0], boo: 0, distract: 0, shake: 0, left: 0, flashes: 0, groan: 0, seen: { score: [0, 0], call: null } });

// Moves the crowd's mood on by dt seconds of real time, from what has happened in the match since the last call.
// `heard` is what the broadcast's watcher heard this frame: a big moment for the home team (team 0) brings the home
// crowd to its feet as a three does; one for the visitors makes it groan.
export function stepLife(life, state, dt, heard = []) {
  life.groan = Math.max(0, life.groan - dt);
  for (const h of heard) if (h.moment) {
    if (h.team === 0) life.cheer[0] = Math.max(life.cheer[0], LIFE.cheerThree + dt); else life.groan = LIFE.groan;
  }
  for (const team of [0, 1]) {
    const gained = state.score[team] - life.seen.score[team];
    if (gained > 0) { life.cheer[team] = gained >= 3 ? LIFE.cheerThree : LIFE.cheer; life.flashes = LIFE.flashes; }
    life.seen.score[team] = state.score[team];
    life.cheer[team] = Math.max(0, life.cheer[team] - dt);
  }
  // A foul on the home team is a bad call to the home crowd, whatever it was; one on the visitors gets a cheer.
  if (state.call && state.call !== life.seen.call && FOULS.includes(state.call.kind)) {
    if (state.call.team === 0) life.boo = LIFE.boo; else life.cheer[0] = Math.max(life.cheer[0], LIFE.cheer / 2);
  }
  life.seen.call = state.call;
  life.boo = Math.max(0, life.boo - dt);
  // A visitor at the line: the fans behind that hoop wave to put him off, and the picture shakes with them.
  const ft = state.phase === 'freeThrow' ? state.freeThrow : null;
  const visitor = ft && ft.stage === 'aim' && state.players[ft.shooter].team === 1;
  life.distract = visitor ? attackSign(1) : 0;
  life.shake = visitor ? LIFE.shake : 0;
  // A blowout in the last period: fans drift out, more of them the bigger the lead and the less time is left, and
  // more again when it is the home team that is beaten. Nobody comes back.
  const lead = Math.abs(state.score[0] - state.score[1]);
  if (state.phase !== 'start' && state.quarter >= CLOCK.quarters && lead >= LIFE.blowout) {
    const want = clamp((lead - LIFE.blowout) / 20 + 0.3 * (1 - state.gameClock / state.quarterLength), 0, 1) * LIFE.leaveMost * (state.score[0] < state.score[1] ? 1 : 0.7);
    life.left = Math.min(Math.max(life.left, want), life.left + LIFE.leaveRate * dt);
  }
  if (state.phase === 'start') life.left = 0;   // a new match: the house is full again
  return life;
}

// ---------- referees ----------

// off: metres outside the lines the referees stand. deep: how far behind the ball the trail referee keeps, and ahead
// the one opposite. long: seconds a signal lasts. raise: seconds of it spent with the arm up before the call's own sign.
// run: a referee's top speed, in metres a second. gain: the speed he wants for each metre he is from his spot, so that
// he eases into it. accel: how fast his speed changes. near: within this of his spot he stands. jog: above this speed
// he faces the way he runs; below it he watches the ball. turn: the most he turns, in radians a second. step: the
// length of his stride at a walk and flat out, in metres. sideHold: how far past the middle of the court the ball
// must go before the lead referee changes sides of the hoop.
export const REFS = Object.freeze({ off: 0.55, deep: 4.5, long: 2.4, raise: 0.8, run: 6, gain: 2.2, accel: 9, near: 0.2, jog: 1.6, turn: 7,
  step: Object.freeze([0.65, 1.25]), sideHold: 1.5 });

// Where the three referees stand: [lead, trail, centre]. The lead is on the baseline the play goes toward, on the
// ball's side of the hoop (`leadSide`, +1 or -1: see leadSideOf); the trail on the near sideline behind the ball; the
// centre on the far sideline. At the tip the first of them is at the centre spot to throw the ball up. All but he
// stand outside the lines.
export function refSpots(state, leadSide = state.ball.z >= 0 ? 1 : -1) {
  const sign = attackSign(state.possession), { x, z } = state.ball;
  const along = v => clamp(v, -COURT.halfLength + 1, COURT.halfLength - 1), side = COURT.halfWidth + REFS.off;
  const lead = state.phase === 'jumpBall' ? { x: 0, z: -1.4 }
    : { x: sign * (COURT.halfLength + REFS.off), z: leadSide * clamp(Math.abs(z) * 0.7, 3, 6.5) };
  return [lead, { x: along(x - sign * REFS.deep), z: side }, { x: along(x + sign * 1.5), z: -side }];
}

// The side of the hoop the lead referee stands on: he crosses only when the ball has gone well past the middle, so
// that he does not run to and fro under the hoop with every pass.
export const leadSideOf = (side, ball) => (ball.z * side < -REFS.sideHold ? -side : side);

// A referee: where he is, how fast he moves, the way he faces (0 looks toward +z, a quarter turn toward +x) and how
// far through his stride he is.
export const createRef = (x, z) => ({ x, z, vx: 0, vz: 0, facing: 0, stride: 0 });

// Moves a referee on by dt seconds toward `spot`: he gathers speed, eases to a stop, turns no faster than a man can,
// runs facing the way he goes and watches `ball` when he walks or stands. `still`: he stands to make a sign.
export function stepRef(ref, spot, ball, dt, still = false) {
  const dx = spot.x - ref.x, dz = spot.z - ref.z, far = Math.hypot(dx, dz);
  const want = still || far < REFS.near ? 0 : Math.min(REFS.run, far * REFS.gain);
  const ax = (far ? (dx / far) * want : 0) - ref.vx, az = (far ? (dz / far) * want : 0) - ref.vz, change = Math.hypot(ax, az), most = REFS.accel * dt;
  const k = change <= most ? 1 : most / change;
  ref.vx += ax * k; ref.vz += az * k;
  const speed = Math.hypot(ref.vx, ref.vz), moved = speed * dt;
  ref.x += ref.vx * dt; ref.z += ref.vz * dt;
  // One stride is two steps; the steps lengthen as he runs faster.
  ref.stride += (moved / (REFS.step[0] + (REFS.step[1] - REFS.step[0]) * Math.min(1, speed / REFS.run))) * Math.PI;
  const to = speed > REFS.jog ? Math.atan2(ref.vx, ref.vz) : Math.atan2(ball.x - ref.x, ball.z - ref.z);
  const round = Math.atan2(Math.sin(to - ref.facing), Math.cos(to - ref.facing));   // the short way round
  ref.facing += clamp(round, -REFS.turn * dt, REFS.turn * dt);
  return ref;
}

// How a moving referee holds himself: his legs ({ swing, knee } each), the swing of his arms, how far he leans and
// how much he dips with each step. It fades to standing as he slows, so he never snaps from a stride to a stand.
export function refGait(ref) {
  const speed = Math.hypot(ref.vx, ref.vz), fast = Math.min(1, speed / REFS.run), on = Math.min(1, speed / 0.8);
  const reach = on * (0.32 + 0.5 * fast), leg = phase => ({ swing: Math.sin(phase) * reach, knee: on * Math.max(0, Math.sin(phase - 1.9)) * (0.5 + 1.1 * fast) });
  return { legR: leg(ref.stride), legL: leg(ref.stride + Math.PI), arm: Math.sin(ref.stride) * reach * 0.9, bend: 0.25 + on * (0.3 + 0.9 * fast),
    lean: on * (0.04 + 0.18 * fast), dip: on * Math.abs(Math.cos(ref.stride)) * (0.02 + 0.03 * fast) };
}

// The sign for a call, by its kind; null for one that has none.
const SIGNS = { reach: 'reach', block: 'block', shooting: 'shooting', charge: 'charge', travel: 'travel', doubleDribble: 'double',
  threeSeconds: 'three', fiveSeconds: 'five', eightSeconds: 'eight', backcourt: 'backcourt', shotClock: 'shotClock', out: 'out', timeout: 'timeout' };
export const signFor = call => SIGNS[call?.kind] ?? null;

// How a referee holds his arms `t` seconds into the sign `name`. Each arm is { lift, out, bend } in radians: lift
// swings it forward and up from hanging (a half turn is straight up), out swings it sideways from the body, bend
// folds the elbow forward, and inward (when given) folds the forearm across the body instead. `fist`: his raised hand is closed (a foul) rather than open (a violation). `toward`: for 'out',
// which way the ball goes as he sees it: 1 to his right, -1 to his left.
export function armsFor(name, t, toward = 1) {
  const down = { lift: 0, out: 0.08, bend: 0.1 }, up = { lift: Math.PI, out: 0, bend: 0 };
  const foul = ['reach', 'block', 'shooting', 'charge'].includes(name), wave = (rate, by) => Math.sin(t * rate) * by;
  if (name === 'madeThree') return { right: up, left: up, fist: false };
  if (!name) return { right: down, left: down, fist: false };
  // First the whistle: one arm straight up, a fist for a foul, an open hand for the rest.
  if (t < REFS.raise) return { right: up, left: down, fist: foul };
  const s = t - REFS.raise;
  const signs = {
    block: { right: { lift: 0, out: 0.8, bend: 0, inward: 2.1 }, left: { lift: 0, out: 0.8, bend: 0, inward: 2.1 } },   // hands on hips
    charge: { right: { lift: 2.6, out: 0.4, bend: 2.4 }, left: { lift: Math.PI / 2, out: 0, bend: 0 } },           // hand behind the head, then the way play goes
    reach: { right: { lift: 1.25 + wave(14, 0.25), out: -0.3, bend: 0.9 }, left: { lift: 1.2, out: -0.2, bend: 0.6 } },   // chopping at the wrist
    shooting: { right: up, left: { lift: 0, out: 0.8, bend: 0, inward: 2.1 } },                                                // the shots to come, held up
    travel: { right: { lift: 1.05 + wave(12, 0.35), out: -0.25, bend: 1.7 }, left: { lift: 1.05 - wave(12, 0.35), out: -0.25, bend: 1.7 } },   // fists rolled over each other
    double: { right: { lift: 1.1 + wave(10, 0.3), out: 0, bend: 0.8 }, left: { lift: 1.1 - wave(10, 0.3), out: 0, bend: 0.8 } },             // patting the ball with both hands
    three: { right: { lift: 0.2, out: 1.2 + wave(8, 0.3), bend: 0 }, left: down },                                 // three fingers swept at the lane
    five: { right: up, left: down },                                                                               // five fingers held up
    eight: { right: up, left: up },
    backcourt: { right: { lift: Math.PI / 2, out: wave(8, 0.5), bend: 0.2 }, left: down },                         // waved across the centre line
    shotClock: { right: { lift: 2.5, out: 0.3, bend: 2.3 + wave(14, 0.2) }, left: down },                          // fingertips tapped on the head
    out: toward > 0 ? { right: { lift: 0.1, out: Math.PI / 2, bend: 0 }, left: down } : { right: down, left: { lift: 0.1, out: Math.PI / 2, bend: 0 } },   // pointing the way the ball goes
    timeout: { right: { lift: 1, out: -0.3, bend: 2 }, left: { lift: 1.35, out: -0.35, bend: 1.5 } },              // a T with the hands
  };
  return { ...(signs[name] ?? { right: down, left: down }), fist: false, s };
}

// The mock advertisements on the boards. Every name is invented.
export const ADS = Object.freeze([
  { words: 'SUGAR-SODA!', back: '#d8232a', ink: '#fff6d8' }, { words: 'VOLT ENERGY', back: '#0b0b0d', ink: '#d7ff2f' },
  { words: 'PIXEL PIZZA', back: '#f5a623', ink: '#3a1d00' }, { words: 'NIMBUS AIR', back: '#e9f2fb', ink: '#0e4c92' },
  { words: 'COMET SNEAKERS', back: '#1b1f3b', ink: '#ff7a59' }, { words: 'BYTE BANK', back: '#0f5132', ink: '#eafff3' },
  { words: 'TRIPLE THREAT', back: '#0e2a66', ink: '#f2f5f8' }, { words: 'HARBOR CITY WAVES', back: '#f2f5f8', ink: '#0e2a66' },
  { words: 'RED ROCK SCORPIONS', back: '#7a1414', ink: '#f2f5f8' },
]);
// every: seconds a board shows one advertisement before it changes.
export const AD = Object.freeze({ every: 9 });
// Which advertisement board `board` shows at `time` seconds: neighbours differ, and each board works through them all.
export const adAt = (board, time) => (board * 2 + Math.floor(time / AD.every)) % ADS.length;
