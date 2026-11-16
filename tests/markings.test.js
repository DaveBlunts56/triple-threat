// The floor's markings (src/render/markings.js) are the NBA's, and the lines drawn are the lines the rules play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKS, courtMarks } from '../src/render/markings.js';
import { isThree } from '../src/sim/players.js';
import { BOARD, COURT, LANE, RIM, THREE_PT } from '../src/sim/tuning.js';

const marks = courtMarks(), near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a} against ${b}`);
const ends = m => (m.kind === 'arc' ? [0, 1].map(k => { const t = k ? m.to : m.from; return [m.at[0] + m.r * Math.cos(t), m.at[1] + m.r * Math.sin(t)]; }) : [m.from, m.to]);

test('the court is the NBA\'s: 28.65 by 15.24 m, the three 7.24 m and 6.71 m in the corners, the lane 4.88 m wide and 5.79 m deep', () => {
  near(2 * COURT.halfLength, 28.65, 'length'); near(2 * COURT.halfWidth, 15.24, 'width');
  near(THREE_PT.radius, 7.24, 'arc'); near(THREE_PT.cornerZ, 6.71, 'corner');
  near(2 * LANE.halfWidth, 4.88, 'lane'); near(LANE.depth, 5.79, 'free-throw line');
  near(COURT.halfLength - RIM.x, 1.6, 'rim from the baseline'); near(COURT.halfLength - BOARD.x, 1.22, 'board from the baseline');
});

test('the three-point line drawn is the one the rules play: its arc round each rim, its corners meeting the arc', () => {
  const arcs = marks.filter(m => m.kind === 'arc' && m.r === THREE_PT.radius);
  assert.equal(arcs.length, 2);
  for (const a of arcs) {
    near(Math.abs(a.at[0]), RIM.x, 'centred on the rim'); near(a.at[1], 0, 'centred across');
    // Every point on it is a three just outside it and a two just inside it.
    for (let t = a.from; t <= a.to; t += (a.to - a.from) / 20) {
      const sign = Math.sign(a.at[0]), [dx, dz] = [Math.cos(t), Math.sin(t)], at = k => [a.at[0] + (a.r + k) * dx, (a.r + k) * dz];
      assert.equal(isThree(...at(0.05), sign), true, `outside at ${t}`);
      assert.equal(isThree(...at(-0.05), sign), false, `inside at ${t}`);
    }
    // The straight corner lines end where the arc does.
    for (const [x, z] of ends(a)) assert.ok(marks.some(m => m.kind === 'line' && ends(m).some(([x2, z2]) => Math.hypot(x - x2, z - z2) < 1e-9)), `nothing meets the arc at ${x}, ${z}`);
  }
});

test('every NBA marking is there: lane and free-throw circle (dashed inside the lane), restricted area, centre circles, blocks, throw-in marks', () => {
  const arcsOf = r => marks.filter(m => m.kind === 'arc' && Math.abs(m.r - r) < 1e-9);
  assert.equal(LANE.circle, LANE.centre);
  assert.equal(arcsOf(LANE.circle).length, 5);   // two halves on each free-throw line, and the centre circle (the same size)
  assert.equal(marks.filter(m => m.dashed).length, 2);
  assert.equal(arcsOf(LANE.restricted).length, 2);
  assert.equal(arcsOf(MARKS.inner).length, 1);
  assert.equal(marks.filter(m => m.kind === 'block').length, 4);
  // Lane lines: from each baseline to its free-throw line, at the lane's edges.
  for (const s of [1, -1]) for (const z of [-LANE.halfWidth, LANE.halfWidth])
    assert.ok(marks.some(m => m.kind === 'line' && m.from[0] === s * COURT.halfLength && m.to[0] === s * (COURT.halfLength - LANE.depth) && m.from[1] === z));
  // Nothing is painted off the floor's run-off.
  for (const m of marks) for (const [x, z] of ends(m)) assert.ok(Math.abs(x) <= COURT.halfLength + 1 && Math.abs(z) <= COURT.halfWidth + 1, JSON.stringify(m));
});
