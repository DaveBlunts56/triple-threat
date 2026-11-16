import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createMatch } from '../src/sim/state.js';
import { KINDS, SLIDERS, STYLES, STYLE_NAMES, defaultSliders, setStyle, sliderFactor, styled } from '../src/sim/styles.js';

test('both styles list the same keys, every key has a kind, and no value of one is the other\'s object', () => {
  const keys = Object.keys(KINDS).sort();
  for (const name of STYLE_NAMES) assert.deepEqual(Object.keys(STYLES[name]).sort(), keys, `${name} lists other keys`);
  for (const key of keys) {
    const a = STYLES.arcade[key], b = STYLES.sim[key];
    if (typeof a === 'object' && a !== null) assert.notEqual(a, b, `${key} is the same object in both styles`);
  }
});

test('a new match is Arcade with every slider at 50, and its table is Arcade\'s own', () => {
  const s = createMatch(1, 5);
  assert.equal(s.style, 'arcade');
  assert.deepEqual(s.sliders, defaultSliders());
  for (const key of Object.keys(KINDS)) assert.deepEqual(styled(s, key), STYLES.arcade[key], key);
});

test('each slider scales only its own keys, by 0.5 at 0 and 1.5 at 100, inverted where it says', () => {
  assert.equal(sliderFactor(0), 0.5); assert.equal(sliderFactor(50), 1); assert.equal(sliderFactor(100), 1.5);
  for (const slider of SLIDERS) for (const at of [0, 100]) {
    const s = setStyle(createMatch(1, 3), 'arcade', { [slider.key]: at });
    for (const key of Object.keys(KINDS)) {
      const base = STYLES.arcade[key], now = styled(s, key), sign = slider.scales[key];
      if (sign === undefined || KINDS[key] === 'word') { assert.deepEqual(now, base, `${slider.key} at ${at} changed ${key}`); continue; }
      const factor = sign > 0 ? sliderFactor(at) : 1 / sliderFactor(at);
      const want = v => (KINDS[key] === 'chance' ? Math.min(1, v * factor) : v * factor);
      assert.deepEqual(now, Array.isArray(base) ? base.map(want) : want(base), `${slider.key} at ${at} on ${key}`);
    }
  }
});

test('an unknown key throws', () => {
  assert.throws(() => styled(createMatch(1, 3), 'no.such.key'), /no styled number/);
});

test('at 0 and at 100 every chance stays within 0 to 1 and every quantity is positive, in both styles', () => {
  for (const style of STYLE_NAMES) for (const at of [0, 100]) {
    const s = setStyle(createMatch(1, 3), style, Object.fromEntries(SLIDERS.map(sl => [sl.key, at])));
    for (const [key, kind] of Object.entries(KINDS)) {
      const values = [styled(s, key)].flat();
      for (const v of values) {
        if (kind === 'chance') assert.ok(v >= 0 && v <= 1, `${style} ${key} = ${v} at ${at}`);
        if (kind === 'positive') assert.ok(v > 0, `${style} ${key} = ${v} at ${at}`);
      }
    }
  }
});

// Each styled number's old name in tuning.js: once it is styled, nothing in the simulation reads it from there.
const OLD_NAMES = ['AI.patience', 'PLAY.startAt', 'AI.contestDelay', 'AI.stealRate', 'AI.farAway', 'PLAYER.accel', 'STEAL.frontChance', 'STEAL.backChance',
  'PASS.interceptRadius', 'FOUL.reachFront', 'FOUL.reachBack', 'FOUL.shooting', 'FOUL.charge', 'FOUL.block', 'STAMINA.sprint', 'STAMINA.run',
  'STAMINA.jump', 'STAMINA.rest', 'STAMINA.bench', 'STAMINA.subOut', 'STAMINA.subIn', 'TIMEOUT.each', 'TIMEOUT.rest'];

test('no styled number is read straight from tuning.js by the simulation', () => {
  const dir = new URL('../src/sim/', import.meta.url);
  const files = readdirSync(dir, { recursive: true }).filter(f => f.endsWith('.js') && f !== 'styles.js' && f !== 'tuning.js');
  for (const file of files) {
    const code = readFileSync(new URL(file, dir), 'utf8').split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
    for (const name of OLD_NAMES) assert.ok(!new RegExp(`\\b${name.replace('.', '\\.')}\\b`).test(code), `${file} reads ${name}`);
  }
});
