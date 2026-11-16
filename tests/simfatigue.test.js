// Simulation's fatigue, sized for 48 minutes (plan Task 3.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, setLength } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { DT, STAMINA } from '../src/sim/tuning.js';
import { STYLES, setStyle, styled } from '../src/sim/styles.js';

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

// The rotation's minutes over whole matches are tested in simplay.test.js, on the matches it plays.
