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
  assert.equal(ops[0].fill, 'team');
  assert.equal(ops.find(o => o.rect && inside(centre(o.rect), KIT.layout.trim)).fill, 'trim');
  const sides = ops.filter(o => o.fill === 'panel');
  assert.equal(sides.length, 4, 'a side panel at each side edge of the front and of the back');
  for (const o of sides) assert.ok(KIT.sides.at.some(x => o.rect[0] <= x + 1e-9 && o.rect[0] + o.rect[2] >= x - 1e-9), `a side panel at ${o.rect[0]} is at no side edge`);
  assert.deepEqual(ops.filter(o => o.text).map(o => [o.text, o.at[0], o.fill]), [['23', 0.25, 'trim'], ['23', 0.75, 'trim']]);
  for (const o of ops.filter(o => o.text)) {
    assert.ok(inside(o.at[1] - o.height / 2, KIT.layout.main) && inside(o.at[1] + o.height / 2, KIT.layout.main), 'a number leaves the main panels');
    const halfWidth = (o.height * KIT.digit * o.text.length) / 2;
    assert.ok(sides.every(p => o.at[0] + halfWidth <= p.rect[0] + 1e-9 || o.at[0] - halfWidth >= p.rect[0] + p.rect[2] - 1e-9), 'a number reaches a side panel');
  }
});

test('shorts carry white bindings and white stripes down their sides but no number', () => {
  const ops = kitOps('shorts', 23);
  assert.equal(ops.some(o => o.text), false);
  const stripes = ops.filter(o => o.rect && o.rect[3] > 0.5 && o.fill === 'trim');
  assert.equal(stripes.length, 4);
  assert.ok(stripes.every(o => o.rect[2] <= KIT.sides.shorts + 0.03));
});

test('every region is painted edge to edge, a little past its own edges', () => {
  for (const part of ['jersey', 'shorts']) for (const region of ['main', 'trim']) {
    const [top, bottom] = KIT.layout[region], op = kitOps(part, 4).find(o => o.rect && o.rect[2] === 1 && inside(centre(o.rect), KIT.layout[region]));
    assert.ok(op.rect[0] === 0 && op.rect[1] < top + 1e-9 && op.rect[1] + op.rect[3] > bottom - 1e-9, `${part} ${region}`);
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

test('what stands out: the numbers, stitches along the bindings, and down each side panel\'s seams, on flat cloth', () => {
  const ops = heightOps('jersey', 12);
  assert.deepEqual(ops[0], { fill: 'low', rect: [0, 0, 1, 1] });
  assert.deepEqual(ops.filter(o => o.text).map(o => o.text), ['12', '12']);
  const stitched = ops.filter(o => o.rect && o.fill === 'high'), onTrim = o => inside(centre(o.rect), KIT.layout.trim);
  assert.equal(new Set(stitched.filter(onTrim).map(o => centre(o.rect).toFixed(4))).size, 1, 'one row along the bindings');
  assert.ok(stitched.filter(o => !onTrim(o)).every(o => inside(centre(o.rect), KIT.layout.main)), 'stitches off the seams');
  const down = new Set(stitched.filter(o => !onTrim(o)).map(o => (o.rect[0] + o.rect[2] / 2).toFixed(4)));
  assert.equal(down.size, 6, 'two seams down each inner side panel and one down each outer one');
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

test('a player\'s far model wears one picture with a place for each part, none overlapping and all inside it', async () => {
  const { ATLAS, atlasPart, atlasRect, atlasUV } = await import('../src/render/kit.js');
  const parts = Object.keys(ATLAS.cells);
  assert.deepEqual(parts, ['skin', 'jersey', 'shorts', 'hair', 'shoes']);
  for (const part of parts) {
    const [x, y, w, h] = ATLAS.cells[part];
    assert.ok(x >= 0 && y >= 0 && x + w <= 1 && y + h <= 1 && w > 0 && h > 0, part);
    for (const other of parts) if (other !== part) {
      const [ox, oy, ow, oh] = ATLAS.cells[other];
      assert.ok(x + w <= ox || ox + ow <= x || y + h <= oy || oy + oh <= y, `${part} overlaps ${other}`);
    }
    // The picture is drawn a few pixels inside its place, so that neighbours never bleed into it when shrunk.
    const [rx, ry, rw, rh] = atlasRect(part), gutter = ATLAS.gutter / ATLAS.size;
    assert.ok(Math.abs(rx - x - gutter) < 1e-12 && Math.abs(ry - y - gutter) < 1e-12 && Math.abs(rw - w + 2 * gutter) < 1e-12 && Math.abs(rh - h + 2 * gutter) < 1e-12);
    assert.deepEqual(atlasUV(part, 0, 0), [rx, ry]);
    assert.deepEqual(atlasUV(part, 1, 1), [rx + rw, ry + rh]);
    assert.deepEqual(atlasUV(part, -0.2, 1.3), [rx, ry + rh]);                // a stray point is held inside its own place
  }
  assert.deepEqual(['skin-player-0-4', 'jersey', 'shorts', 'hair-player-1-8', 'shoes-player-0-7', 'eyes-player-0-4', 'brows-player-0-4', 'lashes-player-0-4'].map(atlasPart),
    ['skin', 'jersey', 'shorts', 'hair', 'shoes', null, null, null]);
  assert.ok([ATLAS, ATLAS.cells].every(Object.isFrozen));
});
