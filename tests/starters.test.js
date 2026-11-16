// A team's starters against a weaker lineup of its own, in the fast engine (plan Task 5.6). In a file of its own: its
// 600 games run beside the rest of quick.test.js rather than after it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickMatch } from '../src/sim/quick/engine.js';
import { TEAMS } from '../src/sim/teams.js';

// The edge is small (about a point and a half a game, over 600 games; the same before the NBA court), so it is
// measured as the average margin over 400 games (+1.35 now), not as wins in 200, which is a coin flip either way.
test('a team\'s five starters outscore three of its bench and two starters, on average', () => {
  // The other side never has the three starters it leaves out: its bench is the same three bench players again.
  const waves = TEAMS[0], again = i => ({ ...waves.players[i], name: `${waves.players[i].name} Jr.`, number: waves.players[i].number + 50 });
  const benched = { ...waves, players: [waves.players[5], waves.players[6], waves.players[7], waves.players[0], waves.players[1], again(5), again(6), again(7)] };
  let margin = 0;
  for (let seed = 1; seed <= 400; seed++) { const s = quickMatch({ seed, teams: [waves, benched] }); margin += s.score[0] - s.score[1]; }
  assert.ok(margin / 400 > 0.3, `${(margin / 400).toFixed(2)} points a game`);
});
