import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, createQuality, autoQuality, stepQuality } from '../src/render/quality.js';

// `seconds` of frames `ms` long, playing or not. Returns how many times the level changed.
const play = (q, ms, seconds, playing = true) => { let changed = 0; for (let t = 0; t < seconds * 1000; t += ms) changed += autoQuality(q, ms, playing); return changed; }
// Presses G until the level is `level`.
const pressTo = (q, level) => { do stepQuality(q); while (q.level !== level); };

test('the four levels are the ones in the design, and nothing can change them', () => {
  assert.deepEqual(QUALITY.order, ['low', 'medium', 'high', 'ultra']);
  assert.deepEqual(QUALITY.low, { label: 'Low', pixelRatio: 0.75, shadow: 1024, soft: false, textures: 0.5, floor: 1024, crowd: 0.15, aa: 'none', ao: false, bloom: false, mirror: 0 });
  assert.deepEqual(QUALITY.medium, { label: 'Medium', pixelRatio: 1, shadow: 1024, soft: true, textures: 0.5, floor: 1024, crowd: 0.5, aa: 'fxaa', ao: false, bloom: false, mirror: 0 });
  assert.deepEqual(QUALITY.high, { label: 'High', pixelRatio: 2, shadow: 2048, soft: true, textures: 1, floor: 2048, crowd: 1, aa: 'smaa', ao: true, bloom: true, mirror: 0.5 });
  assert.deepEqual(QUALITY.ultra, { label: 'Ultra', pixelRatio: 2, shadow: 4096, soft: true, textures: 1, floor: 2048, crowd: 1, aa: 'smaa', ao: true, bloom: true, mirror: 1 });
  assert.deepEqual([QUALITY.autoAfter, QUALITY.autoBelow, QUALITY.longest], [3, 40, 100]);
  assert.ok([QUALITY, QUALITY.order, ...QUALITY.order.map(level => QUALITY[level])].every(Object.isFrozen));
});

test('the game starts on High with nothing measured', () => {
  assert.deepEqual(createQuality(), { level: 'high', seconds: 0, frames: 0, settled: false });
  assert.notEqual(createQuality(), createQuality());
});

test('under 40 frames a second over the first three seconds of play steps down to Medium and measures again', () => {
  const q = createQuality();
  assert.equal(play(q, 33, 3.1), 1);
  assert.deepEqual([q.level, q.settled, q.frames < 5], ['medium', false, true]);
});

test('the game steps down one level at a time: two slow measurements end on Low, and it never climbs', () => {
  const q = createQuality();
  assert.equal(play(q, 40, 3.1), 1);                       // 25 frames a second
  assert.deepEqual([q.level, q.settled], ['medium', false]);
  assert.equal(play(q, 40, 3.1), 1);
  assert.deepEqual([q.level, q.settled], ['low', true]);
  assert.equal(play(q, 5, 10), 0);                         // fast now, and it stays on Low
  assert.equal(q.level, 'low');
});

test('one slow measurement then a fast one settles on Medium', () => {
  const q = createQuality();
  play(q, 40, 3.1);
  assert.equal(play(q, 16, 3.1), 0);
  assert.deepEqual([q.level, q.settled], ['medium', true]);
  assert.equal(play(q, 40, 10), 0);                        // settled: a slow spell later changes nothing
});

test('40 or more keeps High for good', () => {
  const q = createQuality();
  assert.equal(play(q, 20, 3.1) + play(q, 100, 10), 0);
  assert.equal(q.level, 'high');
});

test('the line is at 40 frames a second: 41 keeps High and 39 does not', () => {
  const fast = createQuality(), slow = createQuality();
  assert.deepEqual([play(fast, 1000 / 41, 3.1), fast.level, fast.settled], [0, 'high', true]);
  assert.deepEqual([play(slow, 1000 / 39, 3.1), slow.level, slow.settled], [1, 'medium', false]);
});

test('time on the start screen or paused does not count toward the three seconds', () => {
  const q = createQuality();
  play(q, 100, 60, false);
  assert.deepEqual([q.seconds, q.settled], [0, false]);
});

test('a pause in the middle of the three seconds neither counts nor starts them again', () => {
  const q = createQuality();
  assert.equal(play(q, 50, 2) + play(q, 50, 60, false), 0);
  assert.deepEqual([q.level, q.settled], ['high', false]);
  assert.equal(play(q, 50, 1.1), 1);
  assert.equal(q.level, 'medium');
});

test('one long stall does not count as a slow computer', () => {
  const q = createQuality();
  autoQuality(q, 10000, true);
  assert.equal(play(q, 10, 3.1), 0);
  assert.equal(q.level, 'high');
});

test('stalls in the middle of fast play do not count as a slow computer either', () => {
  const q = createQuality();
  let changed = 0;
  for (let i = 0; i < 6; i++) changed += autoQuality(q, 5000, true) + play(q, 16, 0.5);
  assert.deepEqual([changed, q.level, q.settled], [0, 'high', true]);
});

test('a computer too slow to draw ten frames a second still ends on Low', () => {
  const q = createQuality();
  assert.equal(play(q, 250, 20), 2);
  assert.deepEqual([q.level, q.settled], ['low', true]);
});

test('G steps Low, Medium, High, Ultra and round again, and only G reaches Ultra', () => {
  const q = createQuality(), seen = [];
  for (let i = 0; i < 5; i++) { stepQuality(q); seen.push(q.level); }
  assert.deepEqual(seen, ['ultra', 'low', 'medium', 'high', 'ultra']);
  assert.equal(q.settled, true);
  assert.equal(play(q, 40, 10), 0);
});

test('once G has been pressed the automatic choice never overrides it', () => {
  const q = createQuality();
  pressTo(q, 'high');
  assert.equal(play(q, 100, 10), 0);
  assert.equal(q.level, 'high');
});

test('G part of the way through the three seconds ends the measuring', () => {
  const q = createQuality();
  assert.equal(play(q, 100, 2), 0);
  pressTo(q, 'high');
  assert.equal(play(q, 100, 10), 0);
  assert.deepEqual([q.level, q.settled], ['high', true]);
});

test('G pressed again and again, paused or playing, is the only thing that moves the level', () => {
  const q = createQuality();
  let changed = 0;
  for (let press = 1; press <= 9; press++) {
    stepQuality(q);
    const level = QUALITY.order[(2 + press) % 4];           // High is the third of the four
    assert.equal(q.level, level);
    changed += play(q, 100, 4, press % 3 > 0);   // slow frames, some of them on the pause screen
    assert.equal(q.level, level);
  }
  assert.equal(changed, 0);
});
