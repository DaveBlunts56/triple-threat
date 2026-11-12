import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitOps, paintKit, KIT } from '../src/render/kit.js';

const recorder = () => {
  const calls = [];
  return { calls, fillRect: (...a) => calls.push(['rect', calls.style, ...a]), fillText: (...a) => calls.push(['text', calls.style, ...a]),
    set fillStyle(v) { calls.style = v; }, set font(v) { calls.font = v; }, set textAlign(v) {}, set textBaseline(v) {} };
};

test('a jersey is the team colour with white trim and its number on the chest and the back', () => {
  const ops = kitOps('jersey', 23);
  assert.deepEqual(ops[0], { fill: 'team', rect: [0, 0, 1, 1] });
  assert.deepEqual(ops.filter(o => o.text).map(o => [o.text, o.at[0], o.fill]), [['23', 0.25, 'trim'], ['23', 0.75, 'trim']]);
  assert.ok(ops.filter(o => o.rect && o.fill === 'trim').length >= 4);
});

test('shorts carry the trim but no number', () => {
  assert.equal(kitOps('shorts', 23).some(o => o.text), false);
});

test('painting puts the colours and the number where the layout says, in pixels', () => {
  const c = recorder();
  paintKit(c, 512, kitOps('jersey', 7), 1);
  assert.deepEqual(c.calls[0], ['rect', KIT.team[1], 0, 0, 512, 512]);
  const texts = c.calls.filter(call => call[0] === 'text');
  assert.deepEqual(texts.map(t => [t[1], t[2], t[3]]), [[KIT.trim, '7', 128], [KIT.trim, '7', 384]]);
  // The chest number may be no wider than a digit's share of its height, so it never reaches the side bands.
  assert.ok(Math.abs(texts[0][5] - 0.26 * 512 * 0.45) < 1e-9, `the chest number's maximum width is ${texts[0][5]}`);
});
