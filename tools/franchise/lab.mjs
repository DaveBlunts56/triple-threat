// Run with node tools/franchise/lab.mjs [universes] [seasons] [first seed]. Failures print their universe and fixture.
import assert from 'node:assert/strict';
import { clubs, standings } from '../../src/franchise/calendar.js';
import { createLeague, nextSeason, recordGame, simulateFixture } from '../../src/franchise/league.js';
import { validateSave } from '../../src/franchise/saves.js';

const [count = 100, seasons = 10, first = 1] = process.argv.slice(2).map(Number);
const champions = {}, clubsInOrder = Object.keys(clubs), started = performance.now();
let games = 0, repeats = 0, points = 0, high = 0, largest = 0, fgm = 0, fga = 0;
for (let seed = first; seed < first + count; seed++) {
  const league = createLeague({ seed, name: 'Test universe', team: clubsInOrder[seed % clubsInOrder.length], minutes: 3, bestOf: 3 });
  try {
    for (let year = 1; year <= seasons; year++) {
      while (!league.season.champion) {
        const result = simulateFixture(league);
        recordGame(league, result);
        games++;
        points += result.score[0] + result.score[1];
        for (const line of result.box.flat()) { fgm += line.fgm; fga += line.fga; high = Math.max(high, line.pts); }
      }
      const { champion } = league.season;
      champions[champion] = (champions[champion] ?? 0) + 1;
      if (league.history.at(-1)?.champion === champion) repeats++;
      assert.ok(standings(league.season).every(t => t.w + t.l === league.games));
      if (year < seasons) nextSeason(league);
    }
    const json = JSON.stringify(league);
    largest = Math.max(largest, Buffer.byteLength(json));
    validateSave(JSON.parse(json));
  } catch (error) {
    console.error({ seed, year: league.season.year, fixture: league.season.cursor });
    throw error;
  }
}
console.log(JSON.stringify({ count, seasons, first, games, champions, repeats, pointsPerTeam: points / (2 * games),
  fieldGoalPercentage: 100 * fgm / fga, high, largestSaveBytes: largest, seconds: (performance.now() - started) / 1000 }, null, 2));
