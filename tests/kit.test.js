import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitOps, heightOps, kitColours, paintKit, normalFromHeight, gearColour, KIT } from '../src/render/kit.js';
import { ROSTER } from '../src/sim/tuning.js';

const recorder = () => {
  const calls = [];
  return { calls, fillRect: (...a) => calls.push(['rect', calls.style, ...a]), fillText: (...a) => calls.push(['text', calls.style, ...a]),
    strokeText: (...a) => calls.push(['outline', calls.stroke, ...a]), save() {}, restore() {}, translate: (x, y) => calls.push(['at', x, y]), rotate: a => calls.push(['turn', a]),
    set fillStyle(v) { calls.style = v; }, set strokeStyle(v) { calls.stroke = v; }, set lineWidth(v) {}, set lineJoin(v) {}, set font(v) { calls.font = v; }, set textAlign(v) {}, set textBaseline(v) {} };
};
const word = team => ROSTER.teams[team].split(' ').pop().toUpperCase();
const centre = rect => rect[1] + rect[3] / 2;
const inside = (y, [top, bottom]) => y >= top && y <= bottom;

test('a jersey: team colour, white bindings, darker side panels piped in white, the team\'s name arched over an outlined number on the chest, the number on the back', () => {
  for (const team of [0, 1]) {
    const ops = kitOps('jersey', 23, team);
    assert.equal(ops[0].fill, 'team');
    assert.equal(ops.find(o => o.rect && inside(centre(o.rect), KIT.layout.trim)).fill, 'trim');
    const sides = ops.filter(o => o.fill === 'panel');
    assert.equal(sides.length, 4, 'a side panel at each side edge of the front and of the back');
    for (const o of sides) assert.ok(KIT.sides.at.some(x => o.rect[0] <= x + 1e-9 && o.rect[0] + o.rect[2] >= x - 1e-9), `a side panel at ${o.rect[0]} is at no side edge`);
    const piping = ops.filter(o => o.rect && o.fill === 'trim' && o.rect[2] <= KIT.piping + 1e-9);
    assert.equal(piping.length, 4, 'a white line down the inner edge of each side panel');
    const numbers = ops.filter(o => o.text === '23');
    assert.deepEqual(numbers.map(o => [o.at[0], o.fill, o.outline]), [[0.25, 'trim', 'panel'], [0.75, 'trim', 'panel']]);
    const letters = ops.filter(o => o.text && o.text !== '23');
    assert.equal(letters.map(o => o.text).join(''), word(team));
    // Arched: the middle letters higher up the chest than the ends, turned out from the middle; all above the number.
    const mid = letters[Math.floor(letters.length / 2)], [first, last] = [letters[0], letters.at(-1)];
    // No wider than the chest between the arm holes: a long name is lettered smaller.
    const across = last.at[0] - first.at[0] + first.height * KIT.digit;
    assert.ok(across <= KIT.name.widest + 1e-9, `${word(team)} spans ${across.toFixed(3)} of the picture`);
    assert.ok(mid.at[1] < first.at[1] && mid.at[1] < last.at[1], 'the name is not arched');
    assert.ok(first.angle < 0 && last.angle > 0 && Math.abs(first.angle + last.angle) < 1e-9, 'its ends do not turn outward evenly');
    assert.ok(letters.every(o => o.at[1] + o.height / 2 < numbers[0].at[1] - numbers[0].height / 2 && o.outline === 'panel'), 'the name runs into the number');
    for (const o of [...letters, ...numbers]) {
      assert.ok(inside(o.at[1] - o.height / 2, KIT.layout.main) && inside(o.at[1] + o.height / 2, KIT.layout.main), `${o.text} leaves the main panels`);
      const halfWidth = (o.height * KIT.digit * o.text.length) / 2;
      assert.ok(sides.every(p => o.at[0] + halfWidth <= p.rect[0] + 1e-9 || o.at[0] - halfWidth >= p.rect[0] + p.rect[2] - 1e-9), `${o.text} reaches a side panel`);
    }
  }
});

test('shorts carry white bindings and wide darker stripes down their sides, piped in white, and no number', () => {
  const ops = kitOps('shorts', 23, 0);
  assert.equal(ops.some(o => o.text), false);
  const stripes = ops.filter(o => o.rect && o.rect[3] > 0.5 && o.fill === 'panel');
  assert.equal(stripes.length, 4);
  assert.ok(stripes.every(o => o.rect[2] >= KIT.sides.shorts - 1e-9));
  assert.equal(ops.filter(o => o.rect && o.fill === 'trim' && o.rect[2] <= KIT.piping + 1e-9).length, 4);
});

test('every region is painted edge to edge, a little past its own edges', () => {
  for (const part of ['jersey', 'shorts']) for (const region of ['main', 'trim']) {
    const [top, bottom] = KIT.layout[region], op = kitOps(part, 4, 0).find(o => o.rect && o.rect[2] === 1 && inside(centre(o.rect), KIT.layout[region]));
    assert.ok(op.rect[0] === 0 && op.rect[1] < top + 1e-9 && op.rect[1] + op.rect[3] > bottom - 1e-9, `${part} ${region}`);
  }
});

test('the colours: the team\'s, white, and the team\'s darkened for the side panels', () => {
  const c = kitColours(1);
  assert.deepEqual([c.team, c.trim, c.high, c.low], [KIT.team[1], '#ffffff', '#ffffff', '#000000']);
  assert.equal(c.panel, `rgb(${[0xd8, 0x3a, 0x3a].map(v => Math.round(v * KIT.shade)).join(', ')})`);
});

test('painting puts the colours, the letters and the numbers where the layout says, in pixels, each outlined before it is filled', () => {
  const c = recorder();
  paintKit(c, 512, kitOps('jersey', 7, 1), kitColours(1));
  assert.equal(c.calls[0][1], KIT.team[1]);
  const texts = c.calls.filter(call => call[0] === 'text'), outlines = c.calls.filter(call => call[0] === 'outline');
  assert.equal(texts.length, word(1).length + 2);
  assert.deepEqual(outlines.map(o => o[2]), texts.map(t => t[2]), 'each is outlined, in the same order');
  assert.ok(outlines.every(o => o[1] === kitColours(1).panel) && texts.every(t => t[1] === KIT.trim));
  const placed = c.calls.filter(call => call[0] === 'at'), numbers = placed.slice(-2);
  assert.deepEqual(numbers.map(([, x, y]) => [x, y]), [[KIT.chest.at[0] * 512, KIT.chest.at[1] * 512], [KIT.back.at[0] * 512, KIT.back.at[1] * 512]]);
  const chest = texts.at(-2);
  assert.ok(Math.abs(chest[5] - KIT.chest.height * 512 * KIT.digit) < 1e-9, `the chest number's maximum width is ${chest[5]}`);
});

test('what stands out: the numbers, stitches along the bindings, and down each side panel\'s seams, on flat cloth', () => {
  const ops = heightOps('jersey', 12, 0);
  assert.deepEqual(ops[0], { fill: 'low', rect: [0, 0, 1, 1] });
  assert.deepEqual(ops.filter(o => o.text).map(o => o.text).join(''), word(0) + '1212');
  assert.ok(ops.filter(o => o.text).every(o => o.fill === 'high' && o.outline === 'high'), 'the letters stand out with their outlines');
  const stitched = ops.filter(o => o.rect && o.fill === 'high'), onTrim = o => inside(centre(o.rect), KIT.layout.trim);
  assert.equal(new Set(stitched.filter(onTrim).map(o => centre(o.rect).toFixed(4))).size, 1, 'one row along the bindings');
  assert.ok(stitched.filter(o => !onTrim(o)).every(o => inside(centre(o.rect), KIT.layout.main)), 'stitches off the seams');
  const down = new Set(stitched.filter(o => !onTrim(o)).map(o => (o.rect[0] + o.rect[2] / 2).toFixed(4)));
  assert.equal(down.size, 6, 'two seams down each inner side panel and one down each outer one');
  assert.equal(heightOps('shorts', 12, 0).some(o => o.text), false);
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
  assert.deepEqual(parts, ['skin', 'jersey', 'shorts', 'hair', 'shoes', 'gear']);
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
  assert.deepEqual(['skin-player-0-4', 'jersey', 'shorts', 'hair-player-1-8', 'shoes-player-0-7', 'gear-headband-white-player-0-11', 'eyes-player-0-4', 'brows-player-0-4', 'lashes-player-0-4', 'cornea', 'mouth-player-0-4'].map(atlasPart),
    ['skin', 'jersey', 'shorts', 'hair', 'shoes', 'gear', null, null, null, null, null]);
  assert.ok([ATLAS, ATLAS.cells].every(Object.isFrozen));
});

test('gear is white, black or the team\'s colour', () => {
  assert.equal(gearColour('white', 1), KIT.gear.white);
  assert.equal(gearColour('black', 0), KIT.gear.black);
  assert.equal(gearColour('team', 0), KIT.team[0]);
  assert.equal(gearColour('team', 1), KIT.team[1]);
  assert.deepEqual(KIT.gear.order, ['white', 'black', 'team']);
});
