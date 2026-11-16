import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DT, FT, SHOT } from '../src/sim/tuning.js';
import { contestShare, distanceChance, expectedShot, freeThrowChance, greenChance, greenShare, releaseOffset, shotChance, timingShare, windowHalf, zoneFor } from '../src/sim/shooting.js';

test('a defender on the shooter takes about half, none from the contest distance, more in the air close by', () => {
  assert.equal(contestShare({ gap: 0, defence: 70 }), SHOT.maxContest);
  assert.equal(contestShare({ gap: SHOT.contestDist, defence: 70 }), 1);
  assert.ok(contestShare({ gap: 1, defence: 70, airborne: true }) < contestShare({ gap: 1, defence: 70 }));
  assert.ok(contestShare({ gap: 1, defence: 90 }) < contestShare({ gap: 1, defence: 50 }));
  assert.ok(contestShare({ gap: 1, defence: 70, fading: true }) > contestShare({ gap: 1, defence: 70 }));
});

test('Arcade\'s line falls from the rim; a zone table gives each zone its own chance', () => {
  assert.equal(distanceChance('line', 0), SHOT.nearChance);
  assert.equal(distanceChance('line', 100), SHOT.minChance);
  const table = { rim: 0.7, close: 0.5, mid: 0.45, corner3: 0.4, arc3: 0.37 };
  assert.equal(distanceChance(table, 7.3, zoneFor(7.3, true, true, null)), 0.4);
  assert.deepEqual([zoneFor(1, false, false, null), zoneFor(3.5, false, false, 'layup'), zoneFor(2, false, false, null), zoneFor(5, false, false, null), zoneFor(7.5, true, false, null)],
    ['rim', 'rim', 'close', 'mid', 'arc3']);
});

test('timing keeps all of a shot at the best moment and the worst share at the press and the landing', () => {
  assert.equal(timingShare(0.5, 0.6, 0.5, 0.9), 1);
  assert.equal(timingShare(0, 0.6, 0.5, 0.9), 0.6);
  assert.equal(timingShare(0.9, 0.6, 0.5, 0.9), 0.6);
});

test('a chance stays within 0 to 1, the Shooting slider and form multiply it, and a fade costs a little', () => {
  const base = { base: 0.6, timing: 1, contest: 1, energy: 1, levelMake: 1, skill: 1 };
  assert.equal(shotChance(base), 0.6);
  assert.equal(shotChance({ ...base, make: 1.5 }), 0.6 * 1.5);
  assert.equal(shotChance({ ...base, base: 2 }), 1);
  assert.ok(shotChance({ ...base, form: 0.9 }) < 0.6);
  assert.ok(shotChance({ ...base, fading: true }) < 0.6);
});

test('a window narrows with range and tiredness and is wider for a better shooter', () => {
  const w = o => windowHalf({ steps: 3, range: 1, energy: 1, levelGreen: 1, rating: 70, heat: null, ...o });
  assert.equal(w({}), 3 * DT);
  assert.ok(w({ range: 0.5 }) < w({}));
  assert.ok(w({ energy: 0.1 }) < w({}));
  assert.ok(w({ rating: 90 }) > w({}));
  assert.ok(w({ heat: 'hot' }) > w({}));
});

test('expectedShot of a green-sure style counts green releases as makes; a boost style halves the miss', () => {
  assert.equal(expectedShot({ value: 3, chance: 0.4, green: 0 }), 3 * 0.4);
  assert.equal(expectedShot({ value: 3, chance: 0.4, green: 1, rule: 'sure' }), 3);
  assert.equal(greenChance('boost', 0.4, 0.5), 0.7);
  assert.ok(Math.abs(expectedShot({ value: 2, chance: 0.4, green: 1, rule: 'boost', boost: 0.5 }) - 1.4) < 1e-12);
  assert.ok(Math.abs(expectedShot({ value: 2, chance: 0.5, green: 0.5, rule: 'sure' }) - 1.5) < 1e-12);
});

test('a computer\'s releases land in the window as often as its width over its spread', () => {
  assert.equal(greenShare(0.05, 0.16 * 0), 1);
  assert.equal(greenShare(0.05, 0.1, false), 0);
  assert.ok(Math.abs(greenShare(0.05, 0.16) - (0.05 + DT / 2) / 0.16) < 1e-12);
  const offs = Array.from({ length: 1000 }, (_, i) => releaseOffset(() => i / 999, 0.2));
  assert.equal(Math.min(...offs), -0.2); assert.equal(Math.max(...offs), 0.2);
});

test('Arcade\'s computer free throw is the game\'s own', () => {
  assert.equal(freeThrowChance('flat'), FT.aiChance);
});
