// A match with no human in it (plan Task 6.1): Watch. Both teams are the computer's, at All-Star's numbers whatever
// the difficulty; nobody's place is kept for a player you control; both coaches call timeouts and substitute. In Play,
// team 0 is yours as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, personOf, setLength } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { makeChance, SHOT_BEST } from '../src/sim/players.js';
import { offBallSpot } from '../src/sim/offball.js';
import { setStyle } from '../src/sim/styles.js';
import { DT } from '../src/sim/tuning.js';

const watch = (seed, size = 5, humans = []) => { const s = createMatch(seed, size); startMatch(s); s.humans = humans; return s; };

test('in Watch no intent from outside is read: a match stepped by the computer alone ends, and both teams score', () => {
  const s = watch(3, 3);
  for (let i = 0; s.phase !== 'final' && i < 60 * 60 * 30; i++) step(s, aiIntents(s, DT), DT);
  assert.equal(s.phase, 'final');
  assert.ok(s.score[0] > 0 && s.score[1] > 0);
});

// The same shot by a team-0 man and a team-1 man in mirror image: the same ratings, the same release, no defender near.
function mirrored(humans) {
  const s = createMatch(1, 5); startMatch(s); s.humans = humans; s.difficulty = 'legend';
  const [a, b] = [s.players.find(p => p.team === 0), s.players.find(p => p.team === 1)];
  for (const p of [a, b]) { Object.assign(personOf(s, p), { ratings: { ...personOf(s, a).ratings }, energy: 1, form: 1, streak: 0 }); p.shotT = SHOT_BEST; p.y = 0; }
  Object.assign(a, { x: 6, z: 2 }); Object.assign(b, { x: -6, z: 2 });
  for (const p of s.players) if (p !== a && p !== b) Object.assign(p, { x: 0, z: p.team === 0 ? -6 : 6 });
  return [makeChance(s, a), makeChance(s, b)];
}

test('both sides decide and shoot with the same numbers in Watch, whatever the difficulty; in Play team 1 has the level\'s', () => {
  const [w0, w1] = mirrored([]);
  assert.ok(Math.abs(w0 - w1) < 1e-9, `${w0} against ${w1}`);
  const [p0, p1] = mirrored([0]);
  assert.notEqual(p0, p1, 'at Legend the computer\'s team shoots on its own numbers');
});

test('both coaches call timeouts in Watch; in Play only the computer\'s', () => {
  const called = humans => {
    const s = watch(1, 5, humans);
    Object.assign(s, { phase: 'dead', phaseT: 5, freeThrow: null, lastTimeout: -Infinity, timeouts: [3, 3] });
    const used = [];
    for (const team of [0, 1]) {
      s.possession = team; s.run = team === 0 ? [0, 12] : [12, 0];   // the other side on a run, the ball his
      const before = s.timeouts[team]; step(s, aiIntents(s, DT), DT); used.push(before - s.timeouts[team]);
      Object.assign(s, { phase: 'dead', phaseT: 5, lastTimeout: -Infinity });
    }
    return used;
  };
  assert.deepEqual(called([]), [1, 1]);
  assert.deepEqual(called([0]), [0, 1]);
});

test('both coaches substitute in Watch', () => {
  const s = watch(2, 5); setLength(s, 3); setStyle(s, 'sim'); s.humans = [];
  const on = s.players.map(p => p.person), subs = [0, 0];
  for (let i = 0; s.phase !== 'final' && i < 60 * 60 * 20; i++) {
    step(s, aiIntents(s, DT), DT);
    s.players.forEach((p, k) => { if (p.person !== on[k]) { subs[p.team]++; on[k] = p.person; } });
  }
  assert.ok(subs[0] > 0 && subs[1] > 0, `${subs}`);
});

test('in Play the player you control keeps no computer place; in Watch nobody is set aside', () => {
  for (const [humans, set] of [[[0], true], [[], false]]) {
    const s = watch(1, 5, humans);
    for (let i = 0; i < 60 * 10 && !(s.phase === 'live' && s.ball.holder !== null); i++) step(s, aiIntents(s, DT), DT);
    const holder = s.players[s.ball.holder], me = s.players.find(p => p.team === holder.team && p !== holder);
    s.controlled = me.id;
    assert.equal(offBallSpot(s, me) === null, set && humans.includes(me.team), `humans ${humans}`);
  }
});
