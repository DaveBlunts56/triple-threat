// The 3D game in Simulation against the 2025-26 averages (plan Task 4.7): six computer matches of five a side and
// 12-minute quarters, per team per 48 minutes, each within the spec's target widened by 15%. Nothing here sets a
// number: these come from the decisions and chances of Simulation's style.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playHeadless, summarise } from '../tools/sim/measure.mjs';
import { setStyle } from '../src/sim/styles.js';

const TARGET = { poss: 99, pts: 116, fga: 89, tpa: 37, fta: 24, tov: 14.5, secs: 14.5 };
const records = Array.from({ length: 6 }, (_, i) => playHeadless({ seed: i + 1, size: 5, minutes: 12, setup: s => { setStyle(s, 'sim'); s.humans = []; } }));
const table = summarise(records, { per48: true });

test('Simulation\'s 3D game is within 15% of the 2025-26 averages in pace, points, shots, threes, free throws, turnovers and possession length', () => {
  const misses = Object.entries(TARGET).filter(([k, v]) => Math.abs(table[k].mean / v - 1) > 0.15).map(([k, v]) => `${k} ${table[k].mean.toFixed(1)} (target ${v})`);
  assert.deepEqual(misses, []);
});

test('Simulation\'s starters play 26-40 minutes', () => {
  const starters = records.flatMap(r => r.state.rosters.flatMap(roster => roster.slice(0, 5).map(p => p.secs / 60)));
  const mean = starters.reduce((a, b) => a + b, 0) / starters.length;
  assert.ok(mean >= 26 && mean <= 40, `${mean.toFixed(1)}`);
});
