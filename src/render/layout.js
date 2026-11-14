// Where things stand in the arena: the seats, the boards, the scorer's table and the hanging scoreboard, and what the
// scoreboard says. Plain logic, no Three.js, so it can be tested without a browser.
import { ROSTER } from '../sim/tuning.js';
import { periodWord } from './hud.js';

const f = Object.freeze;

// clearX, clearZ: nothing stands nearer the middle of the hall than this, along the court and across it: the court,
// its run-off and the hoops' supports are inside. camera: where the game's camera sits and how far it follows the
// ball along the court. seat: a seat's width, the depth of a row and how much each row rises above the one in front.
// far, near, ends: each stand's rows, where its first row is and how high, and how far it runs to each side. The
// near stand, on the camera's side, is low and short so that it never comes between the camera and the court.
// sideBoards, endBoards, table, hanging: the lit boards along the far sideline and behind the baselines, the scorer's
// table, and the scoreboard over centre court: places and sizes in metres.
export const ARENA = f({
  clearX: 16.5, clearZ: 9.6,
  camera: f({ height: 11, back: 18, maxX: 9 }),
  seat: f({ wide: 0.55, deep: 0.9, rise: 0.45 }),
  far: f({ rows: 14, first: 10.7, height: 0.9, half: 19 }),
  near: f({ rows: 4, first: 12.6, height: 0.6, half: 19 }),   // far enough back to be under the bottom of the picture
  ends: f({ rows: 12, first: 17.6, height: 0.9, half: 9.3 }),
  sideBoards: f({ z: -9.95, y: 0.5, wide: 4, high: 1, count: 7 }),
  endBoards: f({ x: 16.4, y: 0.5, wide: 4, high: 1, count: 3 }),
  table: f({ z: -8.9, wide: 6, high: 0.8, deep: 0.6 }),
  hanging: f({ y: 9.6, wide: 5, high: 2.4 }),
});

const WORDS = f(['TRIPLE THREAT', 'HARBOR CITY WAVES', 'RED ROCK SCORPIONS']);

// Every seat: { x, y, z, facing }. y is the height of the seat; facing is the way its occupant looks, as an angle
// round the upright axis: 0 looks toward +z, a quarter turn toward +x. The same list every time.
export function seats() {
  const all = [], { wide, deep, rise } = ARENA.seat;
  const across = half => Array.from({ length: Math.floor(2 * half / wide) + 1 }, (_, i) => -half + i * wide);
  for (let row = 0; row < ARENA.far.rows; row++)
    for (const x of across(ARENA.far.half)) all.push({ x, y: ARENA.far.height + row * rise, z: -(ARENA.far.first + row * deep), facing: 0 });
  for (let row = 0; row < ARENA.near.rows; row++)
    for (const x of across(ARENA.near.half)) all.push({ x, y: ARENA.near.height + row * rise, z: ARENA.near.first + row * deep, facing: Math.PI });
  for (const side of [1, -1]) for (let row = 0; row < ARENA.ends.rows; row++)
    for (const z of across(ARENA.ends.half)) all.push({ x: side * (ARENA.ends.first + row * deep), y: ARENA.ends.height + row * rise, z, facing: -side * Math.PI / 2 });
  return all;
}

// A fixed shuffle of 0 to count - 1: the same every time (a small seeded generator, not Math.random).
function order(count) {
  const list = Array.from({ length: count }, (_, i) => i);
  let seed = 0x2f6fe0;
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = count - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

// The seats that are filled when `share` of them are: the first so many in a fixed shuffled order, so the crowd is
// spread evenly, the same people sit every time, and a fuller crowd keeps everyone a thinner one has.
export const shown = (all, share) => order(all.length).slice(0, Math.round(all.length * share)).map(i => all[i]);

// The box a board `wide` by `high` and `deep` takes up, centred on (x, y, z), its width running along x when it
// faces along z (facing 0 or a half turn) and along z when it faces along x.
function boxOf(x, y, z, wide, high, deep, facing) {
  const alongX = Math.abs(Math.sin(facing)) < 0.5, halfX = (alongX ? wide : deep) / 2, halfZ = (alongX ? deep : wide) / 2;
  return { min: { x: x - halfX, y: y - high / 2, z: z - halfZ }, max: { x: x + halfX, y: y + high / 2, z: z + halfZ } };
}

// The lit boards, the scorer's table and the hanging scoreboard's four faces: { x, y, z, width, height, facing,
// words, box }. (x, y, z) is the middle of the face, `box` the space the thing takes up, `words` what is painted on
// it ('' for the scoreboard, which shows the score).
export function boards() {
  const all = [], add = (x, y, z, width, height, facing, words, deep = 0.12) =>
    all.push({ x, y, z, width, height, facing, words, box: boxOf(x, y, z, width, height, deep, facing) });
  const side = ARENA.sideBoards, end = ARENA.endBoards, table = ARENA.table, hang = ARENA.hanging;
  for (let i = 0; i < side.count; i++) add((i - (side.count - 1) / 2) * side.wide, side.y, side.z, side.wide, side.high, 0, WORDS[i % WORDS.length]);
  for (const s of [1, -1]) for (let i = 0; i < end.count; i++)
    add(s * end.x, end.y, (i - (end.count - 1) / 2) * end.wide, end.wide, end.high, -s * Math.PI / 2, WORDS[(i + (s > 0 ? 1 : 2)) % WORDS.length]);
  add(0, table.high / 2, table.z, table.wide, table.high, 0, WORDS[0], table.deep);
  for (let face = 0; face < 4; face++) {
    const turn = face * Math.PI / 2;
    add(Math.sin(turn) * hang.wide / 2, hang.y, Math.cos(turn) * hang.wide / 2, hang.wide, hang.high, turn, '');
  }
  return all;
}

// Does the straight line from `from` to `to` pass through `box` ({ min, max }, sides along the axes)?
export function blocks(box, from, to) {
  let enter = 0, leave = 1;
  for (const axis of ['x', 'y', 'z']) {
    const start = from[axis], step = to[axis] - start;
    if (Math.abs(step) < 1e-12) { if (start < box.min[axis] || start > box.max[axis]) return false; continue; }
    const a = (box.min[axis] - start) / step, b = (box.max[axis] - start) / step;
    enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return true;
}

// What the hanging scoreboard says: each team's abbreviation and points, and the period.
export const scoreLines = state => ({
  home: `${ROSTER.abbr[0]} ${state.score[0]}`, away: `${ROSTER.abbr[1]} ${state.score[1]}`, period: periodWord(state.quarter),
});
