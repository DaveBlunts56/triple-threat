// Writes the fixtures that pin Arcade as it was before the coach and the simulation (see the plan, Task 0.2):
// tests/fixtures/arcade-tuning.json, arcade-trace.json and shot-model.json. arcade-baseline.json is written by hand
// from measure.mjs's tables. Run once, on the code the baseline is taken from:
//   node tools/sim/fixtures.mjs
import { writeFileSync } from 'node:fs';
import * as tuning from '../../src/sim/tuning.js';
import { shotCases } from '../../tests/shotcases.js';
import { arcadeTrace } from '../../tests/trace.js';

const out = name => new URL(`../../tests/fixtures/${name}`, import.meta.url);
const numbers = Object.fromEntries(Object.entries(tuning).filter(([, v]) => typeof v !== 'function'));
writeFileSync(out('arcade-tuning.json'), `${JSON.stringify(numbers, null, 1)}\n`);
writeFileSync(out('arcade-trace.json'), `${JSON.stringify([1, 2, 3].map(seed => arcadeTrace(seed)), null, 1)}\n`);
writeFileSync(out('shot-model.json'), `${JSON.stringify(shotCases())}\n`);
console.log('wrote arcade-tuning.json, arcade-trace.json, shot-model.json');
