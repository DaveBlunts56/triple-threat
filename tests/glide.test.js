// No gliding (plan Task 4.3, the owner's second priority). The glide meter (tools/sim/measure.mjs) judges each player by
// the leg motion the renderer would draw him with, and measures how far his feet's ground speed is from his own.
// A planted foot staying fixed is the renderer's own business (src/render/feet.js), checked by eye in the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playHeadless, summarise } from '../tools/sim/measure.mjs';
import { setStyle } from '../src/sim/styles.js';

// Arcade's own baseline, measured the same way (with the renderer's look) on main's code in Stage 4: 5v5 3-min
// seeds 1-20, >20% slip 0.109, >35% 0.058.
const ARCADE_MAIN = { glide20: 0.109, glide35: 0.058 };
const measure = style => summarise(Array.from({ length: 4 }, (_, i) => playHeadless({ seed: i + 5, size: 5, minutes: 3, setup: s => { setStyle(s, style); s.humans = []; } })));

test('Arcade glides no more than it did', () => {
  const t = measure('arcade');
  for (const k of ['glide20', 'glide35']) assert.ok(Math.abs(t[k].mean - ARCADE_MAIN[k]) <= 0.015, `${k}: ${t[k].mean.toFixed(4)} against ${ARCADE_MAIN[k]}`);
});

test('Simulation\'s feet keep to the floor: little slip, far less than Arcade, and no steady jog between a walk and a run', () => {
  const t = measure('sim');
  assert.ok(t.glide20.mean <= 0.055, `above 20%: ${t.glide20.mean.toFixed(4)}`);
  assert.ok(t.glide35.mean <= 0.03, `above 35%: ${t.glide35.mean.toFixed(4)}`);
  assert.ok(t.glide20.mean < ARCADE_MAIN.glide20 && t.glide35.mean < ARCADE_MAIN.glide35);
  assert.ok(t.between.mean < 0.03, `a steady 2.3-3.0 m/s: ${t.between.mean.toFixed(4)}`);
});
