import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitOps, heightOps, kitColours, paintKit, normalFromHeight, KIT } from '../src/render/kit.js';

const recorder = () => {
  const calls = [];
  return { calls, fillRect: (...a) => calls.push(['rect', calls.style, ...a]), fillText: (...a) => calls.push(['text', calls.style, ...a]),
    set fillStyle(v) { calls.style = v; }, set font(v) { calls.font = v; }, set textAlign(v) {}, set textBaseline(v) {} };
};
const centre = rect => rect[1] + rect[3] / 2;
const inside = (y, [top, bottom]) => y >= top && y <= bottom;

test('a jersey is the team colour, its bindings white, its side panels a darker team colour, its number on the chest and the back', () => {
  const ops = kitOps('jersey', 23);
  const fillAt = region => ops.find(o => o.rect && inside(centre(o.rect), KIT.layout[region])).fill;
  assert.deepEqual(['main', 'trim', 'panel'].map(fillAt), ['team', 'trim', 'panel']);
  assert.deepEqual(ops.filter(o => o.text).map(o => [o.text, o.at[0], o.fill]), [['23', 0.25, 'trim'], ['23', 0.75, 'trim']]);
  for (const o of ops.filter(o => o.text)) assert.ok(inside(o.at[1] - o.height / 2, KIT.layout.main) && inside(o.at[1] + o.height / 2, KIT.layout.main), 'a number leaves the main panels');
});

test('shorts carry white bindings and stripes but no number', () => {
  const ops = kitOps('shorts', 23);
  assert.equal(ops.some(o => o.text), false);
  assert.equal(ops.find(o => o.rect && inside(centre(o.rect), KIT.layout.panel)).fill, 'trim');
});

test('every region is painted edge to edge, a little past its own edges', () => {
  for (const part of ['jersey', 'shorts']) for (const region of ['main', 'trim', 'panel']) {
    const [top, bottom] = KIT.layout[region], op = kitOps(part, 4).find(o => o.rect && inside(centre(o.rect), KIT.layout[region]));
    assert.ok(op.rect[0] === 0 && op.rect[2] === 1 && op.rect[1] < top + 1e-9 && op.rect[1] + op.rect[3] > bottom - 1e-9, `${part} ${region}`);
  }
});

test('the colours: the team\'s, white, and the team\'s darkened for the side panels', () => {
  const c = kitColours(1);
  assert.deepEqual([c.team, c.trim, c.high, c.low], [KIT.team[1], '#ffffff', '#ffffff', '#000000']);
  assert.equal(c.panel, `rgb(${[0xd8, 0x3a, 0x3a].map(v => Math.round(v * KIT.shade)).join(', ')})`);
});

test('painting puts the colours and the number where the layout says, in pixels', () => {
  const c = recorder();
  paintKit(c, 512, kitOps('jersey', 7), kitColours(1));
  assert.equal(c.calls[0][1], KIT.team[1]);
  const texts = c.calls.filter(call => call[0] === 'text');
  assert.deepEqual(texts.map(t => [t[1], t[2], t[3]]), [[KIT.trim, '7', 128], [KIT.trim, '7', 384]]);
  assert.ok(Math.abs(texts[0][5] - KIT.chest.height * 512 * KIT.digit) < 1e-9, `the chest number's maximum width is ${texts[0][5]}`);
});

test('what stands out: the numbers and rows of stitches along the seams, on flat cloth', () => {
  const ops = heightOps('jersey', 12);
  assert.deepEqual(ops[0], { fill: 'low', rect: [0, 0, 1, 1] });
  assert.deepEqual(ops.filter(o => o.text).map(o => o.text), ['12', '12']);
  const rows = new Set(ops.filter(o => o.rect && o.fill === 'high').map(o => centre(o.rect).toFixed(4)));
  assert.equal(rows.size, 3, 'three seams are stitched');
  for (const y of rows) assert.ok(inside(+y, KIT.layout.trim) || inside(+y, KIT.layout.panel), `stitches at ${y} are on no seam`);
  assert.equal(heightOps('shorts', 12).some(o => o.text), false);
});

test('a flat picture of heights makes a flat normal map; a raised square tilts its edges outward', () => {
  const size = 16, flat = new Uint8ClampedArray(size * size * 4);
  for (const [i, v] of normalFromHeight(flat, size).entries()) assert.equal(v, [128, 128, 255, 255][i % 4] === 128 ? v : v, 'never');
  const n = normalFromHeight(flat, size);
  for (let i = 0; i < size * size; i++) assert.deepEqual([...n.slice(i * 4, i * 4 + 4)], [128, 128, 255, 255]);
  const raised = new Uint8ClampedArray(size * size * 4);
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) raised[(y * size + x) * 4] = 255;
  const r = normalFromHeight(raised, size), px = (x, y, c) => r[(y * size + x) * 4 + c];
  assert.ok(px(3, 8, 0) < 128 && px(12, 8, 0) > 128, 'the left and right edges lean out');
  assert.ok(px(8, 3, 1) > 128 && px(8, 12, 1) < 128, 'the top and bottom edges lean out (green points up the picture)');
  assert.deepEqual([px(8, 8, 0), px(8, 8, 1), px(8, 8, 2)], [128, 128, 255], 'its middle is flat');
});
