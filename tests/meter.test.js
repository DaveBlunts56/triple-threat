import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shotMeter, SHOT_METER } from '../src/render/motion.js';
import { SHOT_BEST, giveBall, greenAt, shotWindow } from '../src/sim/players.js';
import { step } from '../src/sim/step.js';
import { DT, RIM } from '../src/sim/tuning.js';
import { live, idle, only, at } from './helpers.js';

const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;
const hold = id => only(id, { shoot: true });
// Player 0, 3 m from the hoop, holds Space for `n` steps and lets go on the next. `gap`: how far his nearest defender stands.
function shoot(n, gap = 2.5) {
  const s = live();
  at(s, 0, RIM.x - 3, 0); at(s, 3, RIM.x - 3 + gap, 0);
  for (let i = 0; i < n; i++) step(s, hold(0), DT);
  return s;
}

test('no meter until someone on your team gathers; then it stands beside him, on the side away from the hoop', () => {
  const s = shoot(0);
  assert.equal(shotMeter(s), null);
  step(s, hold(0), DT);
  const m = shotMeter(s);
  assert.deepEqual([m.player, m.x, m.z, m.fill, m.level, m.frozen], [0, RIM.x - 3 - SHOT_METER.aside, 0, 0, 'Open', null]);
});

test('the fill runs from empty at the press to full at the best moment, and drains after it', () => {
  const fills = [];
  const s = shoot(1);
  for (let i = 1; i < 45; i++) { step(s, hold(0), DT); fills[i] = shotMeter(s).fill; }
  // The axis is eased: a moment sits at the square of its share of the way, so the last part of the travel is drawn larger.
  assert.ok(near(fills[12], (12 * DT / SHOT_BEST) ** 2) && near(fills[29], (1 - (29 * DT - SHOT_BEST) / SHOT_BEST) ** 2), `${fills[12]} ${fills[29]}`);
  assert.equal(Math.max(...fills.slice(1)), fills[29]);                   // fullest on the step nearest the best moment
  for (let i = 2; i < 45; i++) assert.ok(i <= 29 ? fills[i] > fills[i - 1] : fills[i] < fills[i - 1], `step ${i}`);
});

// Stands his defender `gap` metres from player 0, toward the hoop: 2.5 open, 1.5 guarded, 0.8 contested, 0.1 smothered.
const guard = (s, gap) => at(s, 3, s.players[0].x + gap, 0);
const GAPS = [2.5, 1.5, 0.8, 0.1];

test('the band is the green window on the fill\'s own axis: the fill is inside it exactly when a release would be green', () => {
  const levels = new Set();
  for (const gap of GAPS) {
    const s = shoot(1);
    for (let i = 1; i < 45; i++) {
      step(s, hold(0), DT);
      guard(s, gap);                                                      // held there: two players that close push apart
      const m = shotMeter(s), p = s.players[0];
      assert.equal(m.fill >= m.band.from, greenAt(shotWindow(s, p), p.shotT), `gap ${gap}, step ${i}`);
      assert.equal(m.band.to, 1);
      levels.add(m.level);
    }
  }
  assert.deepEqual([...levels], ['Open', 'Guarded', 'Contested', 'Smothered']);
});

test('on the eased bar the band is about a quarter of it open, a sixth guarded, a tenth contested and a sliver smothered', () => {
  const bands = GAPS.map(gap => { const s = shoot(1); guard(s, gap); return shotMeter(s); });
  assert.deepEqual(bands.map(m => m.level), ['Open', 'Guarded', 'Contested', 'Smothered']);
  // Its lower edge is the earliest green moment: `steps` steps before the best one, and the half step greenAt allows.
  const edge = steps => (1 - (steps + 0.5) * DT / SHOT_BEST) ** 2;
  [3, 2, 1, 0].forEach((steps, i) => assert.ok(near(bands[i].band.from, edge(steps)), `${bands[i].level}: ${bands[i].band.from}`));
  assert.deepEqual(bands.map(m => Math.round((1 - m.band.from) * 100)), [23, 17, 10, 3]);
});

test('the label names the contest level, and the band shrinks as a defender closes during the gather', () => {
  const s = shoot(5);
  const before = shotMeter(s);
  at(s, 3, RIM.x - 3 + 0.8, 0);
  const after = shotMeter(s);
  assert.deepEqual([before.level, after.level], ['Open', 'Contested']);
  assert.ok(after.band.from > before.band.from);
});

test('too far out there is no band at all', () => {
  const s = live(); at(s, 0, 0, 0);
  step(s, hold(0), DT);
  assert.equal(shotMeter(s).band, null);
});

test('a release from out of range has no band to be early or late of, so it says so', () => {
  const s = live(); at(s, 0, 0, 0); at(s, 3, 2.5, 0);
  for (let i = 0; i < 29; i++) step(s, hold(0), DT);
  step(s, idle(), DT);
  assert.deepEqual([s.shot.inRange, shotMeter(s).frozen.verdict], [false, 'range']);
});

test('at the release it freezes and says green, early or late, and it stays for 1.2 seconds', () => {
  const verdict = n => { const s = shoot(n); step(s, idle(), DT); return [s, shotMeter(s)]; };
  const [s, green] = verdict(29);
  assert.deepEqual([green.frozen, green.fill >= green.band.from, green.level], [{ verdict: 'green', blocked: false }, true, 'Open']);
  assert.equal(verdict(22)[1].frozen.verdict, 'early');
  assert.equal(verdict(36)[1].frozen.verdict, 'late');
  assert.ok(verdict(22)[1].fill < verdict(22)[1].band.from);
  const fill = green.fill;
  for (let i = 0; i < 70; i++) step(s, idle(), DT);                        // 1.18 s after the release
  assert.equal(shotMeter(s).fill, fill);
  step(s, idle(), DT); step(s, idle(), DT);
  assert.equal(shotMeter(s), null);
});

test('it goes at once on a travel, and when the shot is passed up', () => {
  const s = shoot(45);
  assert.notEqual(shotMeter(s), null);
  step(s, hold(0), DT);                                                   // he lands with the ball
  assert.deepEqual([s.call.kind, shotMeter(s)], ['travel', null]);
  const t = shoot(10);
  step(t, only(0, { shoot: true, pass: true }), DT);
  assert.equal(shotMeter(t), null);
});

test('the other team never gets a meter, and nothing is drawn on the start and final screens', () => {
  const s = live();
  giveBall(s, s.players[3]);
  for (let i = 0; i < 30; i++) { step(s, hold(3), DT); assert.equal(shotMeter(s), null); }
  step(s, idle(), DT);
  assert.deepEqual([s.ball.mode, shotMeter(s)], ['shot', null]);
  const t = shoot(29);
  step(t, idle(), DT);
  t.phase = 'final';
  assert.equal(shotMeter(t), null);
});

test('a blocked release is marked as blocked, whatever its timing', () => {
  const s = shoot(29);
  s.shot = { shooter: 0, t: 29 * DT, at: s.time, ...shotWindow(s, s.players[0]), green: true, blocked: true };
  s.players[0].shooting = false;
  assert.deepEqual(shotMeter(s).frozen, { verdict: 'green', blocked: true });
});
