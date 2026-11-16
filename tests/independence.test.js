// Arcade and Simulation cannot reach each other: a match reads only its own style's table and its own sliders, no
// module keeps anything between matches, and a seed replays a match exactly. (Review Focus 2 and 9 of the plan.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createMatch } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { DT } from '../src/sim/tuning.js';
import { KINDS, SLIDERS, STYLES, setStyle, styled } from '../src/sim/styles.js';
import { arcadeTrace } from './trace.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const forbidden = name => new Proxy({}, { get: () => { throw new Error(`the ${name} table was read`); } });
const every = at => Object.fromEntries(SLIDERS.map(s => [s.key, at]));

// Plays a whole three-a-side match of 3-minute quarters on `tables`, in `style`, with `sliders`.
function playOn(style, tables, sliders) {
  const s = createMatch(4, 3);
  setStyle(s, style, sliders, tables);
  startMatch(s);
  for (let i = 0; s.phase !== 'final' && i < 60 * 60 * 30; i++) step(s, aiIntents(s, DT), DT);
  return s;
}

test('an Arcade match does not read the Simulation table', () => {
  const s = playOn('arcade', { arcade: STYLES.arcade, sim: forbidden('Simulation') });
  assert.equal(s.phase, 'final');
});

test('a Simulation match does not read the Arcade table', () => {
  const s = playOn('sim', { arcade: forbidden('Arcade'), sim: STYLES.sim });
  assert.equal(s.phase, 'final');
});

test('nothing outside styles.js reads the style tables themselves', () => {
  const dir = new URL('../src/sim/', import.meta.url);
  for (const file of readdirSync(dir, { recursive: true }).filter(f => f.endsWith('.js') && f !== 'styles.js')) {
    const code = readFileSync(new URL(file, dir), 'utf8');
    assert.ok(!/\bSTYLES\b/.test(code), `${file} reads STYLES`);
  }
});

test('a match\'s table comes from its own style and its own sliders alone', () => {
  for (const style of ['arcade', 'sim']) for (const at of [0, 50, 100]) {
    const s = setStyle(createMatch(1, 3), style, every(at));
    const plain = setStyle(createMatch(1, 3), style, every(at), { [style]: STYLES[style] });
    for (const key of Object.keys(KINDS)) assert.deepEqual(styled(s, key), styled(plain, key), `${style} ${key}`);
  }
});

test('a Simulation match at the sliders\' ends leaves nothing behind for the next Arcade match', () => {
  playOn('sim', STYLES, every(0));
  playOn('sim', STYLES, every(100));
  const old = fixture('arcade-trace.json')[0];
  const now = arcadeTrace(old.seed, { keys: Object.keys(old.box[0][0]) });
  assert.deepEqual(now.hashes, old.hashes);
});

test('the simulation never calls Math.random or Date.now', () => {
  const dir = new URL('../src/sim/', import.meta.url);
  for (const file of readdirSync(dir, { recursive: true }).filter(f => f.endsWith('.js'))) {
    const code = readFileSync(new URL(file, dir), 'utf8');
    assert.ok(!/Math\.random|Date\.now/.test(code), `${file} uses Math.random or Date.now`);
  }
});

test('a seed gives the same match twice, in Arcade and in Simulation', () => {
  for (const style of ['arcade', 'sim']) {
    const setup = s => setStyle(s, style);
    assert.deepEqual(arcadeTrace(9, { setup }), arcadeTrace(9, { setup }), style);
  }
});
