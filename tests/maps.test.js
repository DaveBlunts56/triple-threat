// The pictures generated for the players (tools/blender/maps.py): they tile, and they say what they should.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './glb.js';

const at = (png, x, y, c) => png.pixels[(y * png.width + x) * png.channels + c];
const TILES = ['knit-normal', 'knit-rough', 'twill-normal', 'twill-rough', 'strands-normal'];

test('each fabric picture is a 512-pixel tile whose edges meet', () => {
  for (const name of TILES) {
    const png = readPng(`assets/maps/${name}.png`);
    assert.deepEqual([png.width, png.height], [512, 512], name);
    // Across the wrap a step is no bigger than the biggest step from one pixel to the next inside that row or column.
    let worst = 0;
    for (let i = 0; i < 512; i++) for (let c = 0; c < 3; c++) {
      let row = 0, column = 0;
      for (let j = 0; j < 511; j++) { row = Math.max(row, Math.abs(at(png, j, i, c) - at(png, j + 1, i, c))); column = Math.max(column, Math.abs(at(png, i, j, c) - at(png, i, j + 1, c))); }
      worst = Math.max(worst, Math.abs(at(png, 0, i, c) - at(png, 511, i, c)) - row, Math.abs(at(png, i, 0, c) - at(png, i, 511, c)) - column);
    }
    assert.ok(worst <= 2, `${name}: an edge jumps by ${worst} more than the picture does from one pixel to the next`);
  }
});

test('the normal maps hold directions out of the cloth (or the hair), and the knit has holes', () => {
  for (const name of ['knit-normal', 'twill-normal', 'strands-normal']) {
    const png = readPng(`assets/maps/${name}.png`);
    let off = 0, flat = 0;
    for (let i = 0; i < png.width * png.height; i++) {
      const [x, y, z] = [0, 1, 2].map(c => png.pixels[i * png.channels + c] / 127.5 - 1);
      off = Math.max(off, Math.abs(Math.hypot(x, y, z) - 1));
      if (z > 0.99) flat++;
      assert.ok(z > 0, `${name}: a normal points into the cloth`);
    }
    assert.ok(off < 0.06, `${name}: a normal is ${off} from unit length`);
    assert.ok(flat < png.width * png.height * 0.9, `${name}: it is nearly flat`);
  }
});

test('the knit is rough, about as cotton-poly mesh is; the twill a little rougher', () => {
  const mean = name => { const png = readPng(`assets/maps/${name}.png`); let sum = 0; for (let i = 0; i < 512 * 512; i++) sum += png.pixels[i * png.channels]; return sum / (512 * 512) / 255; };
  const knit = mean('knit-rough'), twill = mean('twill-rough');
  assert.ok(knit > 0.7 && knit < 0.85, `knit ${knit}`);
  assert.ok(twill > knit && twill < 0.92, `twill ${twill}`);
});

test('the strands run one way: their normals lean across them, hardly along them', () => {
  const png = readPng('assets/maps/strands-normal.png');
  let across = 0, along = 0;
  for (let i = 0; i < png.width * png.height; i++) { across += Math.abs(png.pixels[i * png.channels] / 127.5 - 1); along += Math.abs(png.pixels[i * png.channels + 1] / 127.5 - 1); }
  assert.ok(across > along * 3, `across ${across.toFixed(0)}, along ${along.toFixed(0)}`);
});

test('the pores are a 256-pixel tile whose edges meet, of small pits in a fine grain', () => {
  const png = readPng('assets/maps/pores-normal.png');
  assert.deepEqual([png.width, png.height], [256, 256]);
  // A pit may sit on the edge, so its steepest step is there: the step across the wrap is no bigger than the steepest
  // step anywhere in the tile.
  let steepest = 0, seam = 0, tilted = 0;
  for (let i = 0; i < 256; i++) for (let c = 0; c < 2; c++) {
    for (let j = 0; j < 255; j++) steepest = Math.max(steepest, Math.abs(at(png, j, i, c) - at(png, j + 1, i, c)), Math.abs(at(png, i, j, c) - at(png, i, j + 1, c)));
    seam = Math.max(seam, Math.abs(at(png, 0, i, c) - at(png, 255, i, c)), Math.abs(at(png, i, 0, c) - at(png, i, 255, c)));
  }
  const worst = seam - steepest;
  for (let i = 0; i < 256 * 256; i++) if (Math.abs(png.pixels[i * png.channels] - 128) > 20) tilted++;
  assert.ok(worst <= 2, `an edge jumps by ${worst}`);
  assert.ok(tilted > 256 * 256 * 0.05 && tilted < 256 * 256 * 0.6, `${tilted} pixels lean`);
});
