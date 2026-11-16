// Arcade is the game as it was before the coach and the simulation: its numbers, and (until the computer's decisions
// change on purpose, plan Task 3.5) the very matches it plays. The fixtures were recorded from main in Stage 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as tuning from '../src/sim/tuning.js';
import { shotCases } from './shotcases.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

test('Arcade\'s numbers are today\'s', () => {
  const numbers = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(tuning).filter(([, v]) => typeof v !== 'function'))));
  const was = fixture('arcade-tuning.json');
  for (const [name, value] of Object.entries(was)) assert.deepEqual(numbers[name], value, `${name} has changed`);
});

// 'an Arcade match plays exactly as it did' pinned every step of three matches through Stages 1 and 2 (the refactors).
// It was retired at Task 3.2, where the coach's play calls began to change the computer's decisions on purpose; from
// then on Arcade is held to its measured baseline instead (the band test, Task 3.8). arcade-trace.json stays as the
// record of the matches main played.

test('the shot model gives the numbers it gave', () => {
  const was = fixture('shot-model.json'), now = shotCases();
  assert.equal(now.length, was.length);
  now.forEach((c, i) => assert.deepEqual(c, was[i], `situation ${i}`));
});

// ---------- Arcade stays Arcade: its play within its measured baseline (plan Task 3.8) ----------

import { playHeadless, summarise } from '../tools/sim/measure.mjs';

test('Arcade stays Arcade: points, points per possession, seconds a possession within 10% of the baseline, and no more gliding', () => {
  const baseline = fixture('arcade-baseline.json');
  for (const [size, key] of [[3, 'three3'], [5, 'five3']]) {
    const records = Array.from({ length: 10 }, (_, i) => playHeadless({ seed: i + 1, size, minutes: 3 }));
    const now = summarise(records), was = baseline[key].table;
    // pppTool: points per possession as this tool counted them in Stage 0 (the game now counts its own; see possessions.js).
    for (const [stat, washKey] of [['pts', 'pts'], ['pppTool', 'ppp'], ['secs', 'secs']]) {
      const ratio = now[stat].mean / was[washKey].mean;
      assert.ok(Math.abs(ratio - 1) <= 0.1, `${size} a side, ${stat}: ${now[stat].mean.toFixed(3)} against ${was[washKey].mean.toFixed(3)}`);
    }
    // Glide against main's, measured the way the meter now measures (as the renderer draws each player).
    const glide = baseline.glideRenderer[key];
    for (const g of ['glide20', 'glide35']) assert.ok(Math.abs(now[g].mean - glide[g]) <= 0.015, `${size} a side, ${g}: ${now[g].mean.toFixed(3)} against ${glide[g]}`);
  }
});
