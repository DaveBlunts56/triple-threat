// Arcade is the game as it was before the coach and the simulation: its numbers, and (until the computer's decisions
// change on purpose, plan Task 3.5) the very matches it plays. The fixtures were recorded from main in Stage 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as tuning from '../src/sim/tuning.js';
import { shotCases } from './shotcases.js';
import { arcadeTrace } from './trace.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

test('Arcade\'s numbers are today\'s', () => {
  const numbers = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(tuning).filter(([, v]) => typeof v !== 'function'))));
  const was = fixture('arcade-tuning.json');
  for (const [name, value] of Object.entries(was)) assert.deepEqual(numbers[name], value, `${name} has changed`);
});

test('an Arcade match plays exactly as it did', () => {
  const was = fixture('arcade-trace.json');
  for (const old of was) {
    const now = arcadeTrace(old.seed, { keys: Object.keys(old.box[0][0]) });
    assert.equal(now.steps, old.steps, `seed ${old.seed}: the match lasted a different number of steps`);
    const first = now.hashes.findIndex((h, i) => h !== old.hashes[i]);
    assert.equal(first, -1, `seed ${old.seed}: the match first differs ${first * 60} steps in`);
    assert.deepEqual(now.score, old.score);
    assert.deepEqual(now.box, old.box);
  }
});

test('the shot model gives the numbers it gave', () => {
  const was = fixture('shot-model.json'), now = shotCases();
  assert.equal(now.length, was.length);
  now.forEach((c, i) => assert.deepEqual(c, was[i], `situation ${i}`));
});
