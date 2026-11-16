// The NBA's floor markings, in court metres, from the rules' own numbers (tuning.js), so the lines drawn and the lines
// played can never disagree. Each mark is the middle of a painted line MARKS.line wide: a straight line, an arc (some
// dashed), or a filled block. Plain logic, no Three.js: floor.js paints them, and tests check them.
import { BOARD, COURT, LANE, RIM, THREE_PT } from '../sim/tuning.js';

const f = Object.freeze;

// line: the width of every painted line (2 inches). inner: the radius of the circle inside the centre circle.
// spaces: the lane-space marks along each side of the lane, metres from the baseline (7 ft to 8 ft is the block,
// filled; the rest are lines); out: how far they stand out from the lane. dash: the length of a dash, and of the gap
// after it, on the free-throw circle inside the lane. throwIn: the marks 28 ft from each baseline on both sidelines,
// standing out of bounds this far.
export const MARKS = f({ line: 0.05, inner: 0.61, block: f([2.13, 2.44]), spaces: f([3.35, 4.27, 5.18]), out: 0.2, dash: 0.38,
  throwInAt: 8.53, throwIn: 0.91 });

// Every mark: { kind: 'line', from: [x, z], to: [x, z] }, { kind: 'arc', at: [x, z], r, from, to, dashed } (angles
// in radians, measured from +x toward +z), or { kind: 'block', from: [x, z], to: [x, z] } (a filled rectangle).
export function courtMarks() {
  const L = COURT.halfLength, W = COURT.halfWidth, marks = [];
  const line = (x1, z1, x2, z2) => marks.push({ kind: 'line', from: [x1, z1], to: [x2, z2] });
  const arc = (x, z, r, from, to, dashed = false) => marks.push({ kind: 'arc', at: [x, z], r, from, to, dashed });
  const block = (x1, z1, x2, z2) => marks.push({ kind: 'block', from: [x1, z1], to: [x2, z2] });

  // The boundary, the half-court line, and the centre circle with the small one inside it.
  line(-L, -W, L, -W); line(L, -W, L, W); line(L, W, -L, W); line(-L, W, -L, -W);
  line(0, -W, 0, W);
  arc(0, 0, LANE.centre, 0, 2 * Math.PI);
  arc(0, 0, MARKS.inner, 0, 2 * Math.PI);

  for (const s of [1, -1]) {
    const base = s * L, rim = s * RIM.x, line15 = s * (L - LANE.depth), toCentre = s === 1 ? Math.PI : 0;
    // The three-point line: the arc round the rim, and straight in the corners from the baseline to where it meets them.
    const reach = Math.asin(THREE_PT.cornerZ / THREE_PT.radius);
    arc(rim, 0, THREE_PT.radius, toCentre - reach, toCentre + reach);
    const joins = s * (RIM.x - Math.sqrt(THREE_PT.radius ** 2 - THREE_PT.cornerZ ** 2));
    for (const z of [-THREE_PT.cornerZ, THREE_PT.cornerZ]) line(base, z, joins, z);
    // The lane: its sides, the free-throw line, and the circle on it, whole outside the lane and dashed inside it.
    for (const z of [-LANE.halfWidth, LANE.halfWidth]) line(base, z, line15, z);
    line(line15, -LANE.halfWidth, line15, LANE.halfWidth);
    arc(line15, 0, LANE.circle, toCentre - Math.PI / 2, toCentre + Math.PI / 2);
    arc(line15, 0, LANE.circle, toCentre + Math.PI / 2, toCentre + 3 * Math.PI / 2, true);
    // The restricted area: a half circle round the rim, toward centre court, and straight on to the backboard's face.
    arc(rim, 0, LANE.restricted, toCentre - Math.PI / 2, toCentre + Math.PI / 2);
    for (const z of [-LANE.restricted, LANE.restricted]) line(rim, z, s * BOARD.x, z);
    // The lane-space marks, standing out from either side of the lane.
    for (const side of [-1, 1]) {
      const edge = side * LANE.halfWidth, beyond = side * (LANE.halfWidth + MARKS.out);
      block(s * (L - MARKS.block[0]), edge, s * (L - MARKS.block[1]), beyond);
      for (const d of MARKS.spaces) line(s * (L - d), edge, s * (L - d), beyond);
    }
    // The throw-in marks, 28 ft from the baseline, out of bounds from both sidelines.
    const x = s * (L - MARKS.throwInAt);
    line(x, W, x, W + MARKS.throwIn); line(x, -W, x, -W - MARKS.throwIn);
  }
  return marks;
}
