// The two teams play differently, as their playbooks and defences say (plan Task 3.8). Measured over computer
// matches with nobody playing, each team playing at each end, in Arcade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchBatches } from './watch.js';

// Per team (0: the Waves, 1: the Scorpions), over 24 matches of five a side and 3-minute quarters (16 were too few for the switches on the NBA court's longer
// runs: 1.46 to one there, 1.7 to 1.8 over 24 to 48), played in worker
// threads. `crash`: men near the rim half a second after a shot goes up, summed over `shots`.
const by = [0, 1].map(() => ({ fga: 0, tpa: 0, oreb: 0, misses: 0, posts: 0, switches: 0, games: 0, crash: 0, shots: 0 }));
const seeds = Array.from({ length: 24 }, (_, i) => i + 1);
// Every other match the Scorpions are the home side. (Swapping the data is enough for what is measured here: playbook,
// defence and coach; the rosters stay where they are.)
const records = await watchBatches(seeds, seed => ({ size: 5, minutes: 3, style: 'arcade', humans: [], flip: seed % 2 === 0, crash: true, glide: false }));
records.forEach((r, i) => {
  const flip = seeds[i] % 2 === 0;
  for (const side of [0, 1]) {
    const team = flip ? 1 - side : side, line = r.lines[side], b = by[team];
    b.fga += line.fga; b.tpa += line.tpa; b.oreb += r.oreb[side]; b.misses += line.fga - line.fgm; b.posts += r.plays[side].postUp ?? 0;
    b.switches += r.switchesBy[side]; b.games++; b.crash += r.crash[side]; b.shots += r.crashShots[side];
  }
});

test('the Waves shoot more threes, the Scorpions post up more and go to the offensive glass more', () => {
  const rate = t => by[t].tpa / by[t].fga;
  assert.ok(rate(0) > rate(1), `three-point rate: Waves ${rate(0).toFixed(3)}, Scorpions ${rate(1).toFixed(3)}`);
  assert.ok(by[1].posts > 1.5 * by[0].posts, `post-ups: Waves ${by[0].posts}, Scorpions ${by[1].posts}`);
  // The Scorpions crash the glass, the Waves get back: measured as the men who go (a quarter of a man more a shot; over
  // 24 matches the rebounds themselves are too few to show a gap steadily), and they get more of their own misses.
  const crash = t => by[t].crash / by[t].shots, share = t => by[t].oreb / by[t].misses;
  assert.ok(crash(1) > crash(0) + 0.15, `men at the rim a shot: Waves ${crash(0).toFixed(2)}, Scorpions ${crash(1).toFixed(2)}`);
  assert.ok(share(1) > share(0), `offensive rebounds of own misses: Waves ${share(0).toFixed(3)}, Scorpions ${share(1).toFixed(3)}`);
});

test('the Waves switch screens far more than the Scorpions, who drop their big', () => {
  assert.ok(by[0].switches > 1.5 * by[1].switches, `switches: Waves ${by[0].switches}, Scorpions ${by[1].switches}`);
});
