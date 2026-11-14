import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { ASSETS, SOUNDS, soundPath } from '../src/render/assets.js';

const cuts = JSON.parse(readFileSync('tools/sound/cuts.json', 'utf8'));
const SOURCES = ['squeak.ogg', 'horn.ogg', 'buzzer.ogg', 'murmur.ogg', 'applause.ogg', 'yeah.ogg', 'whistle.wav', 'bounce.mp3', 'drop.mp3', 'net.mp3', 'hoop.mp3',
  'rim.mp3', 'board.mp3', 'boo.mp3', 'groan.mp3', 'gasp.mp3'];   // the sixteen recordings that were approved, and no others

test('every sound the game names has its file, an Ogg file, and the folder holds nothing else', () => {
  for (const name of SOUNDS) {
    assert.ok(existsSync(soundPath(name)), name);
    assert.equal(readFileSync(soundPath(name)).subarray(0, 4).toString('latin1'), 'OggS', name);
    assert.ok(ASSETS.includes(soundPath(name)), `${name} is not packed`);
  }
  assert.deepEqual(readdirSync('assets/sounds').sort(), SOUNDS.map(name => `${name}.ogg`).sort());
  assert.equal(new Set(SOUNDS).size, SOUNDS.length);
});

test('the sounds are small: a single hit under 60 KB, a loop under 400 KB, all of them under 1.6 MB', () => {
  const loops = cuts.filter(cut => cut.loop).map(cut => cut.out);
  let total = 0;
  for (const name of SOUNDS) {
    const size = statSync(soundPath(name)).size;
    total += size;
    assert.ok(size < (loops.includes(name) ? 400 : 60) * 1024, `${name} is ${Math.round(size / 1024)} KB`);
  }
  assert.ok(total < 1.6e6, `${Math.round(total / 1024)} KB in all`);
});

test('the cut list makes every sound once, and only from the recordings that were approved', () => {
  assert.deepEqual(cuts.map(cut => cut.out).sort(), [...SOUNDS].sort());
  for (const cut of cuts) for (const src of cut.mix ? cut.mix.map(m => m.src) : [cut.src]) assert.ok(SOURCES.includes(src), `${cut.out} is cut from ${src}`);
});

test('every recording used is in the credits, with its page', () => {
  const credits = readFileSync('assets/CREDITS.md', 'utf8');
  const used = new Set(cuts.flatMap(cut => (cut.mix ? cut.mix.map(m => m.src) : [cut.src])));
  for (const src of used) assert.match(credits, new RegExp(`\\| \`${src.replace('.', '\\.')}\` \\|[^\\n]*https://`), src);
  for (const name of SOUNDS) assert.match(credits, new RegExp(`\`${name}\`|\`${name.replace(/\d$/, '1')}\` to`), `${name} has no credit`);
});
