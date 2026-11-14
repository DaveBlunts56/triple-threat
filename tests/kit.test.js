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

test('a player\'s one picture has a place for each part he wears, none overlapping and all inside it', async () => {
  const { ATLAS, atlasPart, atlasRect, atlasUV } = await import('../src/render/kit.js');
  const parts = Object.keys(ATLAS.cells);
  assert.deepEqual(parts, ['skin', 'jersey', 'shorts', 'hair', 'shoes']);
  for (const part of parts) {
    const [x, y, w, h] = ATLAS.cells[part];
    assert.ok(x >= 0 && y >= 0 && x + w <= 1 && y + h <= 1 && w > 0 && h > 0, part);
    assert.ok(ATLAS.rough[part] > 0 && ATLAS.rough[part] <= 1, part);
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
  assert.ok([ATLAS, ATLAS.cells, ATLAS.rough].every(Object.isFrozen));
});
