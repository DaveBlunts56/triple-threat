// The box score's new columns and the advanced stats (plan Task 2.4; USG% and play share apart, Review Focus 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, setLength } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { DT, CLOCK } from '../src/sim/tuning.js';
import { emptyLine, teamLine } from '../src/sim/stats.js';
import { drbPct, efg, ftRate, orbPct, pace, playShare, playsOf, possessionEstimate, rating, threeRate, tovPct, ts, usg } from '../src/sim/advanced.js';

function play(seed, size, minutes) {
  const s = createMatch(seed, size);
  setLength(s, minutes);
  startMatch(s);
  for (let i = 0; s.phase !== 'final' && i < 60 * 60 * 60; i++) step(s, aiIntents(s, DT), DT);
  return s;
}
const games = [[1, 5, 3], [2, 3, 3], [3, 5, 5]].map(([seed, size, minutes]) => play(seed, size, minutes));
const played = s => 4 * s.quarterLength + Math.max(0, s.quarter - 4) * CLOCK.overtime;

test('MIN adds up to five times the game played for each team (three times in three a side)', () => {
  for (const s of games) for (const team of [0, 1]) {
    const secs = s.rosters[team].reduce((sum, p) => sum + p.secs, 0);
    assert.ok(Math.abs(secs - s.size * played(s)) < 0.01, `${secs} against ${s.size * played(s)}`);
  }
});

test('+/- adds up to the court\'s size times the margin', () => {
  for (const s of games) for (const team of [0, 1]) {
    const pm = s.rosters[team].reduce((sum, p) => sum + p.pm, 0);
    assert.equal(pm, s.size * (s.score[team] - s.score[1 - team]));
  }
});

test('OREB is a rebound of your own team\'s miss and DREB the rest; the box-score estimate is near the count', () => {
  let estimate = 0, counted = 0;
  for (const s of games) for (const team of [0, 1]) {
    const line = teamLine(s, team);
    assert.ok(line.orb > 0 && line.orb < line.reb);
    estimate += possessionEstimate(line); counted += s.possessions[team];
  }
  // The estimate misses possessions that end with nobody's rebound (a miss out of bounds, the end of a period), more
  // of them in short matches: over 48-minute matches it is within 2% of the count, over these within 5%.
  assert.ok(Math.abs(estimate - counted) / counted < 0.05, `estimate ${estimate.toFixed(1)}, counted ${counted}`);
});

test('USG% is the standard rate: a worked line gives the known answer', () => {
  const me = { ...emptyLine(), fga: 20, fta: 10, tov: 3 }, team = { ...emptyLine(), fga: 88, fta: 22, tov: 14 };
  // 100 × (20 + 0.44 × 10 + 3) × (240 / 5) / (36 × (88 + 0.44 × 22 + 14)) = 100 × 27.4 × 48 / (36 × 111.68)
  assert.ok(Math.abs(usg(me, 36 * 60, team, 240 * 60) - 32.71) < 0.01);
});

test('the minutes-weighted mean USG% of a team is 20, less its own turnovers; play shares and the team\'s turnovers add up to 1', () => {
  for (const s of games) for (const team of [0, 1]) {
    const line = teamLine(s, team), teamSecs = s.rosters[team].reduce((sum, p) => sum + p.secs, 0);
    const on = s.rosters[team].filter(p => p.secs > 0);
    const mean = on.reduce((sum, p) => sum + usg(p.stats, p.secs, line, teamSecs) * p.secs, 0) / teamSecs;
    const own = s.teamStats[team].tov;
    assert.ok(Math.abs(mean - 20 * (1 - own / playsOf(line))) < 1e-9, `${mean}`);
    assert.ok(Math.abs(mean - 20) < 0.5 + (20 * own) / playsOf(line));
    const shares = s.rosters[team].reduce((sum, p) => sum + playShare(p.stats, line), 0) + own / playsOf(line);
    assert.ok(Math.abs(shares - 1) < 1e-9);
  }
});

test('a player\'s USG% and play share differ unless he played every minute', () => {
  const s = games[2], line = teamLine(s, 0), teamSecs = s.rosters[0].reduce((sum, p) => sum + p.secs, 0), whole = teamSecs / 5;
  for (const p of s.rosters[0].filter(q => q.secs > 0)) {
    const share = playShare(p.stats, line), rate = usg(p.stats, p.secs, line, teamSecs);
    assert.ok(Math.abs(share - (rate / 100) * (p.secs / whole)) < 1e-9);
  }
});

test('each formula on a hand-made line', () => {
  const t = { ...emptyLine(), pts: 110, fgm: 40, fga: 88, tpm: 12, tpa: 35, ftm: 18, fta: 24, reb: 44, orb: 10, tov: 14, ast: 25 };
  const o = { ...emptyLine(), reb: 42, orb: 11 };
  assert.ok(Math.abs(efg(t) - 46 / 88) < 1e-12);
  assert.ok(Math.abs(ts(t) - 110 / (2 * (88 + 0.44 * 24))) < 1e-12);
  assert.ok(Math.abs(tovPct(t) - 1400 / (88 + 0.44 * 24 + 14)) < 1e-12);
  assert.equal(orbPct(t, o), 10 / (10 + 31)); assert.equal(drbPct(t, o), 34 / (34 + 11));
  assert.equal(ftRate(t), 24 / 88); assert.equal(threeRate(t), 35 / 88);
  assert.equal(pace(99, 48 * 60), 99); assert.equal(rating(116, 100), 116);
  assert.ok(Math.abs(possessionEstimate(t) - (88 - 10 + 14 + 0.44 * 24)) < 1e-12);
});
