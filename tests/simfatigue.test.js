// Simulation's fatigue, sized for 48 minutes, and the rotation's minutes over whole matches (plan Tasks 3.4 and 4.5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, setLength } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { DT, STAMINA } from '../src/sim/tuning.js';
import { STYLES, setStyle, styled } from '../src/sim/styles.js';
import { playHeadless } from '../tools/sim/measure.mjs';

test('in Simulation a starter who never rests tires over about 6-16 minutes of play', () => {
  const times = [];
  for (const seed of [1, 2]) {
    const s = createMatch(seed, 5); setLength(s, 12); setStyle(s, 'sim'); s.humans = []; s.autoSubs = [false, false];
    s.timeouts = [0, 0];   // no timeouts to rest them
    startMatch(s); s.timeouts = [0, 0];
    const crossed = new Map();
    for (let i = 0; s.phase !== 'final' && s.quarter <= 2; i++) {
      step(s, aiIntents(s, DT), DT);
      for (const p of s.players) { const person = s.rosters[p.team][p.person]; if (!crossed.has(person) && person.energy < styled(s, 'stamina.subOut')) crossed.set(person, person.secs / 60); }
    }
    // A starter who never got that low in a half counts as the half.
    for (const p of s.rosters.flatMap(r => r.slice(0, 5))) times.push(crossed.get(p) ?? 24);
  }
  times.sort((a, b) => a - b);
  const median = times[times.length >> 1];
  assert.ok(median >= 6 && median <= 16, `median ${median.toFixed(1)} min (${times.map(t => t.toFixed(1)).join(', ')})`);
});

test('in Simulation a man on the bench is ready again after about 4 minutes; Arcade\'s fatigue is as it was', () => {
  const s = createMatch(1, 5); setStyle(s, 'sim');
  const minutes = (styled(s, 'stamina.subIn') - styled(s, 'stamina.subOut')) / (styled(s, 'stamina.bench') * 60);
  assert.ok(minutes >= 3.5 && minutes <= 6, `${minutes.toFixed(1)} min`);
  for (const key of ['sprint', 'run', 'jump', 'rest', 'bench', 'subOut', 'subIn']) assert.equal(STYLES.arcade[`stamina.${key}`], STAMINA[key], key);
});

test('over whole Simulation matches the rotation plays starters 30-38 minutes, the eighth man 8-24, and changes about as often as a real coach', () => {
  const mins = Array(8).fill(0), games = 4;
  let subs = 0;
  for (let seed = 1; seed <= games; seed++) {
    const r = playHeadless({ seed, size: 5, minutes: 12, setup: s => { setStyle(s, 'sim'); s.humans = []; } });
    subs += r.subs[0] + r.subs[1];
    for (const t of [0, 1]) {
      r.state.rosters[t].forEach((p, row) => { mins[row] += p.secs / 60 / (2 * games); });
      const total = r.state.rosters[t].reduce((a, p) => a + p.secs, 0) / 60, length = (4 * 12 + Math.max(0, r.state.quarter - 4) * 5) * 5;
      assert.ok(Math.abs(total - length) < 0.05, `team ${t}: ${total} minutes against ${length}`);
    }
  }
  const starters = mins.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  assert.ok(starters >= 30 && starters <= 38, `starters average ${starters.toFixed(1)}: ${mins.map(m => m.toFixed(1)).join(' ')}`);
  assert.ok(mins[7] >= 8 && mins[7] <= 24, `the eighth man ${mins[7].toFixed(1)}`);
  const perTeam = subs / (2 * games);
  assert.ok(perTeam >= 15 && perTeam <= 40, `${perTeam.toFixed(1)} substitutions a team`);
});
