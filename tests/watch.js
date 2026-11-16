// Headless computer matches for the tests, each in a worker thread of its own so that several play at once: by default
// Watch matches in Simulation (five a side, 12-minute quarters); with style 'arcade', matches as the Arcade baseline
// played them (no setup at all). A record is measure.mjs's (playHeadless) without the match state, which cannot cross
// between threads; `minutes` keeps each roster's minutes, which the tests read.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { playHeadless } from '../tools/sim/measure.mjs';
import { setStyle } from '../src/sim/styles.js';

if (!isMainThread && workerData?.watch) {
  const { seed, size = 5, minutes = 12, style = 'sim' } = workerData;
  const setup = style === 'sim' ? s => { setStyle(s, 'sim'); s.humans = []; } : undefined;
  const r = playHeadless({ seed, size, minutes, setup });
  r.minutes = r.state.rosters.map(roster => roster.map(p => p.secs / 60));
  delete r.state;
  parentPort.postMessage(r);
}

// The records of the matches of these seeds, in order. `options`: { size, minutes, style }.
export const watchMatches = (seeds, options = {}) => Promise.all(seeds.map(seed => new Promise((resolve, reject) => {
  const worker = new Worker(new URL(import.meta.url), { workerData: { watch: true, seed, ...options } });
  worker.once('message', resolve);
  worker.once('error', reject);
})));
