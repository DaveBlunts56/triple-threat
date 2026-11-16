// Headless computer matches for the tests, played in worker threads so that several play at once: by default Watch
// matches in Simulation (five a side, 12-minute quarters); with style 'arcade', matches as the Arcade baseline played
// them (no setup, unless `humans` or `flip` is given: a match nobody plays, the teams' data swapped). A record is
// measure.mjs's (playHeadless) without the match state, which cannot cross between threads; `minutes` keeps each
// roster's minutes, `people` each player's line, `switchesBy` each team's switches, and with `crash` how many go to
// the glass after a shot (see crashes), which the tests read. `glide: false` skips the glide meter (see playHeadless).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { playHeadless } from '../tools/sim/measure.mjs';
import { setStyle } from '../src/sim/styles.js';

// Half a second after each shot goes up, how many of the shooting team are within CRASH_NEAR metres of the rim it
// attacks: its men going to the glass (r.crash[team] summed, r.crashShots[team] the shots).
const CRASH_NEAR = 4;
function crashes(s, rec) {
  const shot = s.shot;
  if (s.ball.mode !== 'shot' || !shot || s.time - shot.at < 0.5 || shot.counted) return;
  shot.counted = true;
  const team = s.players[s.ball.shooter]?.team;
  if (team === undefined) return;
  const rimX = (team === 0 ? 1 : -1) * 12.425;
  rec.crash ??= [0, 0]; rec.crashShots ??= [0, 0];
  rec.crash[team] += s.players.filter(p => p.team === team && p.id !== s.ball.shooter && Math.hypot(p.x - rimX, p.z) < CRASH_NEAR).length;
  rec.crashShots[team]++;
}

function play({ seed, size = 5, minutes = 12, style = 'sim', humans = null, flip = false, crash = false, glide = true }) {
  const setup = style === 'sim' || humans || flip ? s => {
    if (style === 'sim') setStyle(s, 'sim');
    if (style === 'sim' || humans) s.humans = humans ?? [];
    if (flip) s.teams = [s.teams[1], s.teams[0]];
  } : undefined;
  const r = playHeadless({ seed, size, minutes, setup, observe: crash ? crashes : undefined, glide });
  r.minutes = r.state.rosters.map(roster => roster.map(p => p.secs / 60));
  r.people = r.state.rosters.map(roster => roster.map(p => ({ name: p.name, ratings: p.ratings, line: p.stats, secs: p.secs })));
  r.teamTov = r.state.teamStats.map(t => t.tov);
  r.switchesBy = r.state.switchesBy;
  delete r.state;
  return r;
}

if (!isMainThread && workerData?.watch) parentPort.postMessage(workerData.jobs.map(play));

// The records of the matches of these seeds, in order, each in a thread of its own. `options`: { size, minutes, style,
// humans }, or a function of the seed giving them (with `flip`).
export const watchMatches = (seeds, options = {}) => watchBatches(seeds, options, 1);

// The same, `per` matches to a thread: fewer threads to start, for many short matches.
export function watchBatches(seeds, options = {}, per = 8) {
  const jobs = seeds.map(seed => ({ seed, ...(typeof options === 'function' ? options(seed) : options) }));
  const batches = [];
  for (let i = 0; i < jobs.length; i += per) batches.push(jobs.slice(i, i + per));
  return Promise.all(batches.map(batch => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { watch: true, jobs: batch } });
    worker.once('message', resolve);
    worker.once('error', reject);
  }))).then(results => results.flat());
}
