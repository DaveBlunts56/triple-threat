// The Arcade gate: points, points per possession and seconds a possession against the Arcade baseline
// (tests/fixtures/arcade-baseline.json), three and five a side, over `n` seeds from 1 (the test plays 10; 30 says more).
//   node tools/sim/gates/arcade-band.mjs [n]
// Each must stay within 10% (tests/arcade.test.js asserts it on seeds 1-10).
import { readFileSync } from 'node:fs';
import { ROOT, from, args, pct } from './common.mjs';

const [n] = args(10);
const { summarise } = await from('tools/sim/measure.mjs');
const { watchBatches } = await from('tests/watch.js');
const baseline = JSON.parse(readFileSync(`${ROOT}/tests/fixtures/arcade-baseline.json`));
const seeds = Array.from({ length: n }, (_, i) => i + 1);
for (const [size, key] of [[3, 'three3'], [5, 'five3']]) {
  const now = summarise(await watchBatches(seeds, { size, minutes: 3, style: 'arcade' }, 3)), was = baseline[key].table;
  console.log(`${size} on ${size}, ${n} seeds: ` + [['pts', 'pts'], ['pppTool', 'ppp'], ['secs', 'secs']]
    .map(([a, b]) => `${a} ${now[a].mean.toFixed(2)} vs ${was[b].mean.toFixed(2)} (${pct(now[a].mean, was[b].mean)})`).join(', '));
}
process.exit(0);
