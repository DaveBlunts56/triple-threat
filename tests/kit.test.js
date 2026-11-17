import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitOps, heightOps, kitColours, kitName, paintKit, paintSocks, sockColour, chestWord, lightness, normalFromHeight, gearColour, KIT, SOCK } from '../src/render/kit.js';
import { readGlb, floatsOf } from './glb.js';
import { TEAMS } from '../src/sim/teams.js';
import { apart } from '../tools/league/import.mjs';
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
    assert.equal(ops.find(o => o.rect && inside(centre(o.rect), KIT.layout.trim)).fill, 'binding');
    const sides = ops.filter(o => o.fill === 'panel');
    assert.equal(sides.length, 4, 'a side panel at each side edge of the front and of the back');
    for (const o of sides) assert.ok(KIT.sides.at.some(x => o.rect[0] <= x + 1e-9 && o.rect[0] + o.rect[2] >= x - 1e-9), `a side panel at ${o.rect[0]} is at no side edge`);
    const piping = ops.filter(o => o.rect && o.fill === 'piping' && o.rect[2] <= KIT.piping + 1e-9);
    assert.equal(piping.length, 4, 'a white line down the inner edge of each side panel');
    const numbers = ops.filter(o => o.text === '23');
    assert.deepEqual(numbers.map(o => [o.at[0], o.fill, o.outline]), [[0.25, 'letters', 'outline'], [0.75, 'letters', 'outline']]);
    const letters = ops.filter(o => o.text && o.text !== '23');
    assert.equal(letters.map(o => o.text).join(''), word(team));
    // Arched: the middle letters higher up the chest than the ends, turned out from the middle; all above the number.
    const mid = letters[Math.floor(letters.length / 2)], [first, last] = [letters[0], letters.at(-1)];
    // No wider than the chest between the arm holes: a long name is lettered smaller.
    const across = last.at[0] - first.at[0] + first.height * KIT.digit;
    assert.ok(across <= KIT.name.widest + 1e-9, `${word(team)} spans ${across.toFixed(3)} of the picture`);
    assert.ok(mid.at[1] < first.at[1] && mid.at[1] < last.at[1], 'the name is not arched');
    assert.ok(first.angle < 0 && last.angle > 0 && Math.abs(first.angle + last.angle) < 1e-9, 'its ends do not turn outward evenly');
    assert.ok(letters.every(o => o.at[1] + o.height / 2 < numbers[0].at[1] - numbers[0].height / 2 && o.outline === 'outline'), 'the name runs into the number');
    for (const o of [...letters, ...numbers]) {
      assert.ok(inside(o.at[1] - o.height / 2, KIT.layout.main) && inside(o.at[1] + o.height / 2, KIT.layout.main), `${o.text} leaves the main panels`);
      const halfWidth = (o.height * KIT.digit * o.text.length) / 2;
      assert.ok(sides.every(p => o.at[0] + halfWidth <= p.rect[0] + 1e-9 || o.at[0] - halfWidth >= p.rect[0] + p.rect[2] - 1e-9), `${o.text} reaches a side panel`);
    }
  }
});

test('shorts carry bindings, bold stripes down their sides piped along their edge, a trim line round each hem, and no number', () => {
  const ops = kitOps('shorts', 23, 0);
  assert.equal(ops.some(o => o.text), false);
  const stripes = ops.filter(o => o.rect && o.rect[3] > 0.5 && o.fill === 'panel');
  assert.equal(stripes.length, 4);
  assert.ok(stripes.every(o => o.rect[2] >= KIT.sides.shorts - 1e-9) && KIT.sides.shorts >= 0.06, 'bold: each about 10 cm across the seam');
  assert.equal(ops.filter(o => o.rect && o.fill === 'piping' && o.rect[2] <= KIT.piping + 1e-9).length, 4);
  // The hem's trim: right round the leg, just above the binding at the bottom of the main region.
  const hem = ops.filter(o => o.rect && o.fill === 'piping' && o.rect[2] === 1);
  assert.equal(hem.length, 1);
  assert.ok(hem[0].rect[1] > KIT.layout.main[1] - 0.06 && hem[0].rect[1] + hem[0].rect[3] < KIT.layout.main[1], JSON.stringify(hem[0].rect));
  assert.equal(kitOps('jersey', 23, 0).filter(o => o.rect && o.fill === 'piping' && o.rect[2] === 1).length, 0, 'not on a jersey');
});

test('a garment\'s picture is painted from top to bottom, with no clear row next to a binding to fray it when shrunk', () => {
  for (const part of ['jersey', 'shorts']) {
    const rows = kitOps(part, 4, 2, 'road').filter(o => o.rect && o.rect[0] === 0 && o.rect[2] === 1).map(o => [o.rect[1], o.rect[1] + o.rect[3]]).sort((a, b) => a[0] - b[0]);
    let reached = 0;
    for (const [top, bottom] of rows) { assert.ok(top <= reached + 1e-9, `${part}: nothing painted from ${reached} to ${top}`); reached = Math.max(reached, bottom); }
    assert.ok(reached >= 1 - 1e-9, `${part}: nothing painted below ${reached}`);
    const below = kitOps(part, 4, 2, 'road').filter(o => o.rect && o.rect[1] >= KIT.layout.main[1] - 1e-9);
    assert.ok(below.length && below.every(o => o.fill === 'binding'), `${part}: below the main region only the binding's colour`);
  }
});

test('every region is painted edge to edge, a little past its own edges', () => {
  for (const part of ['jersey', 'shorts']) for (const region of ['main', 'trim']) {
    const [top, bottom] = KIT.layout[region], op = kitOps(part, 4, 0).find(o => o.rect && o.rect[2] === 1 && inside(centre(o.rect), KIT.layout[region]));
    assert.ok(op.rect[0] === 0 && op.rect[1] < top + 1e-9 && op.rect[1] + op.rect[3] > bottom - 1e-9, `${part} ${region}`);
  }
});

test('a dev team\'s one kit: the team\'s colour, white, and the team\'s darkened for the side panels and round the lettering', () => {
  const c = kitColours(1);
  assert.deepEqual([c.team, c.piping, c.binding, c.letters, c.high, c.low], [KIT.team[1], '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#000000']);
  assert.equal(c.panel, `rgb(${[0xd8, 0x3a, 0x3a].map(v => Math.round(v * KIT.shade)).join(', ')})`);
  assert.equal(c.outline, c.panel);
  assert.deepEqual(kitColours(1, 'home'), c, 'it has no home and road uniforms: the same either way');
  assert.deepEqual([kitName(0, 0, 0), kitName(1, 1, 0)], ['own', 'own']);
});

test('a league team wears its home whites at home and its road colours away, its trim on the panels and bindings', () => {
  assert.deepEqual([kitName(2, 0, 0), kitName(2, 1, 0), kitName(3, 0, 1), kitName(3, 1, 1)], ['home', 'road', 'road', 'home']);
  const ny = TEAMS[2], home = kitColours(2, 'home'), road = kitColours(2, 'road');
  assert.deepEqual([home.team, home.panel, home.binding], ['#ffffff', ny.uniforms.home.trim, ny.uniforms.home.trim]);
  // Piped in a colour that stands out from the panels and the cloth: the outline's blue on the whites, white on the blue.
  assert.deepEqual([home.piping, road.piping], [ny.uniforms.home.outline, '#ffffff']);
  assert.deepEqual([home.letters, home.outline], [ny.uniforms.home.letters, ny.uniforms.home.outline]);
  assert.deepEqual([road.team, road.panel, road.letters], [ny.uniforms.road.jersey, ny.uniforms.road.trim, '#ffffff']);
  // As the uniform sheets show them: New York, Detroit and Dallas in blue away, San Antonio in black.
  assert.deepEqual([2, 6, 11, 13].map(id => TEAMS[id].uniforms.road.jersey), ['#1d428a', '#1d42ba', '#000000', '#002b5e']);
});

test('every league kit can be told from the other side\'s whites, and its lettering read on it', () => {
  for (const team of TEAMS.filter(t => t.uniforms)) {
    const { home, road } = team.uniforms;
    assert.equal(home.jersey, '#ffffff', team.key);
    assert.ok(apart(road.jersey, '#ffffff') > 200, `${team.key}: road ${road.jersey}`);
    for (const [kit, k] of [['home', home], ['road', road]]) {
      assert.ok(apart(k.letters, k.jersey) > 150, `${team.key} ${kit}: ${k.letters} on ${k.jersey}`);
      assert.notEqual(k.outline, k.letters, `${team.key} ${kit}`);
    }
  }
});

test('painting puts the colours, the letters and the numbers where the layout says, in pixels, each outlined before it is filled', () => {
  const c = recorder();
  paintKit(c, 512, kitOps('jersey', 7, 1), kitColours(1));
  assert.equal(c.calls[0][1], KIT.team[1]);
  const texts = c.calls.filter(call => call[0] === 'text'), outlines = c.calls.filter(call => call[0] === 'outline');
  assert.equal(texts.length, word(1).length + 2);
  assert.deepEqual(outlines.map(o => o[2]), texts.map(t => t[2]), 'each is outlined, in the same order');
  assert.ok(outlines.every(o => o[1] === kitColours(1).outline) && texts.every(t => t[1] === kitColours(1).letters));
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

test('the word on the chest: the city on the road colours, the nickname on the home whites and on a dev team\'s one kit', () => {
  assert.deepEqual([chestWord(2, 'road'), chestWord(2, 'home'), chestWord(0), chestWord(1, 'home')], ['NEW YORK', 'EMPIRE', word(0), word(1)]);
  const lettersOf = (team, kit) => kitOps('jersey', 11, team, kit).filter(o => o.text && o.text !== '11');
  assert.equal(lettersOf(2, 'road').map(o => o.text).join(''), 'NEW YORK');
  assert.equal(lettersOf(2, 'home').map(o => o.text).join(''), 'EMPIRE');
  // A long city is lettered smaller, to stay within the chest; a short name is lettered at full size.
  const okc = TEAMS.findIndex(t => t.city === 'Oklahoma City'), long = lettersOf(okc, 'road'), short = lettersOf(0);
  assert.ok(long[0].height < short[0].height && short[0].height === KIT.name.height, `${long[0].height} against ${short[0].height}`);
  const across = long.at(-1).at[0] - long[0].at[0] + long[0].height * KIT.digit;
  assert.ok(across <= KIT.name.widest + 1e-9, `${across}`);
  // The raised lettering follows the same word.
  assert.equal(heightOps('jersey', 11, 2, 'road').filter(o => o.text && o.text !== '11').map(o => o.text).join(''), 'NEW YORK');
});

test('every league kit\'s piping stands out from the panels it edges and from the cloth beside them', () => {
  const apartOf = (a, b) => Math.hypot(...[1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)));
  for (const [id, team] of TEAMS.entries()) for (const kit of team.uniforms ? ['home', 'road'] : []) {
    const c = kitColours(id, kit);
    assert.ok(apartOf(c.piping, c.panel) > 80 && apartOf(c.piping, c.team) > 80, `${team.key} ${kit}: ${c.piping} on ${c.panel} and ${c.team}`);
  }
});

test('white socks under a light jersey, black under a dark one; repainted over the sock\'s corner of the shoes\' picture, its knit showing through', () => {
  assert.deepEqual([sockColour(kitColours(2, 'home')), sockColour(kitColours(2, 'road')), sockColour(kitColours(3, 'road'))], [SOCK.white, SOCK.black, SOCK.black]);
  assert.ok(Math.abs(lightness('#ffffff') - 1) < 1e-9 && lightness('#000000') === 0);
  const calls = [];
  const context = { save() {}, restore() {}, set fillStyle(v) { calls.push(['fill', v]); }, set globalAlpha(v) { calls.push(['alpha', v]); },
    set globalCompositeOperation(v) { calls.push(['blend', v]); }, fillRect: (...a) => calls.push(['rect', ...a]), drawImage: (...a) => calls.push(['image', ...a.slice(1)]) };
  paintSocks(context, { width: 512, height: 512 }, [100, 200, 256, 256], SOCK.white);
  const [u, v, w, h] = SOCK.rect;
  assert.deepEqual(calls, [['fill', SOCK.white], ['rect', 100 + u * 256, 200 + v * 256, w * 256, h * 256], ['alpha', SOCK.knit], ['blend', 'multiply'],
    ['image', u * 512, v * 512, w * 512, h * 512, 100 + u * 256, 200 + v * 256, w * 256, h * 256]]);
  calls.length = 0;
  paintSocks(context, { width: 512, height: 512 }, [0, 0, 512, 512], SOCK.black);
  assert.ok(calls.some(c => c[0] === 'blend' && c[1] === 'screen'));
});

test('the sock\'s corner of the shoes\' picture holds both socks of every model, whole, and no part of a shoe', () => {
  for (const path of ['assets/players.glb', 'assets/players/nye-11.glb', 'assets/players/dal-30.glb']) {
    const gltf = readGlb(new URL(`../${path}`, import.meta.url)), { json, bin } = gltf;
    const inside = (u, v) => u >= SOCK.rect[0] && u <= SOCK.rect[0] + SOCK.rect[2] && v >= SOCK.rect[1] && v <= SOCK.rect[1] + SOCK.rect[3];
    const shoes = json.meshes.flatMap(m => m.primitives).filter(p => json.materials[p.material].name.startsWith('shoes'));
    assert.ok(shoes.length >= 2, path);
    for (const p of shoes) {
      const uv = floatsOf(gltf, p.attributes.TEXCOORD_0), a = json.accessors[p.indices], view = json.bufferViews[a.bufferView];
      const size = { 5121: 1, 5123: 2, 5125: 4 }[a.componentType], read = { 1: o => bin.readUInt8(o), 2: o => bin.readUInt16LE(o), 4: o => bin.readUInt32LE(o) }[size];
      const indices = Array.from({ length: a.count }, (_, k) => read((view.byteOffset ?? 0) + (a.byteOffset ?? 0) + k * size));
      // The pieces the shoes' mesh is made of, joined where their triangles share a corner.
      const parent = Array.from({ length: uv.length / 2 }, (_, i) => i), find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
      for (let k = 0; k < indices.length; k += 3) { parent[find(indices[k + 1])] = find(indices[k]); parent[find(indices[k + 2])] = find(indices[k]); }
      const pieces = {};
      parent.forEach((_, i) => (pieces[find(i)] ??= []).push(inside(uv[2 * i], uv[2 * i + 1])));
      const inCorner = Object.values(pieces).filter(piece => piece.some(Boolean));
      assert.equal(inCorner.length, 2, `${path}: two socks in the corner`);
      assert.ok(inCorner.every(piece => piece.every(Boolean)), `${path}: a piece only partly in the corner`);
    }
  }
});
