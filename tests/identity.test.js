// The two teams play differently, as their playbooks and defences say (plan Task 3.8). Measured over computer
// matches with nobody playing, each team playing at each end, in Arcade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playHeadless } from '../tools/sim/measure.mjs';

// Per team (0: the Waves, 1: the Scorpions), over 10 matches of five a side and 3-minute quarters.
const by = [{ fga: 0, tpa: 0, oreb: 0, posts: 0, switches: 0, games: 0 }, { fga: 0, tpa: 0, oreb: 0, posts: 0, switches: 0, games: 0 }];
for (let seed = 1; seed <= 10; seed++) {
  const flip = seed % 2 === 0;   // every other match the Scorpions are the home side
  const r = playHeadless({ seed, size: 5, minutes: 3, setup: s => { s.humans = []; if (flip) { const t = s.teams; s.teams = [t[1], t[0]]; } } });
  // (Swapping the data is enough for what is measured here: playbook, defence and coach; the rosters stay where they are.)
  for (const side of [0, 1]) {
    const team = flip ? 1 - side : side, line = r.lines[side], b = by[team];
    b.fga += line.fga; b.tpa += line.tpa; b.oreb += r.oreb[side]; b.posts += r.plays[side].postUp ?? 0;
    b.switches += r.state.switchesBy[side]; b.games++;
  }
}

test('the Waves shoot more threes, the Scorpions post up more and go to the offensive glass more', () => {
  const rate = t => by[t].tpa / by[t].fga;
  assert.ok(rate(0) > rate(1), `three-point rate: Waves ${rate(0).toFixed(3)}, Scorpions ${rate(1).toFixed(3)}`);
  assert.ok(by[1].posts > 1.5 * by[0].posts, `post-ups: Waves ${by[0].posts}, Scorpions ${by[1].posts}`);
  assert.ok(by[1].oreb > by[0].oreb, `offensive rebounds: Waves ${by[0].oreb}, Scorpions ${by[1].oreb}`);
});

test('the Waves switch screens far more than the Scorpions, who drop their big', () => {
  assert.ok(by[0].switches > 2 * by[1].switches + 2, `switches: Waves ${by[0].switches}, Scorpions ${by[1].switches}`);
});
