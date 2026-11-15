// The pictures generated for the players (tools/blender/maps.py): they tile, and they say what they should.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './glb.js';

const at = (png, x, y, c) => png.pixels[(y * png.width + x) * png.channels + c];
const TILES = ['knit-normal', 'knit-rough', 'twill-normal', 'twill-rough'];

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

test('the normal maps hold directions out of the cloth, and the knit has holes', () => {
  for (const name of ['knit-normal', 'twill-normal']) {
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
