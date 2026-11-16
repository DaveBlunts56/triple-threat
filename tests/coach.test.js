// The coach's offence (plan Task 3.2): his playbook, the mismatches he hunts, what he learns, timeouts, the play after
// a timeout, and the end of a period.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { giveBall } from '../src/sim/players.js';
import { step } from '../src/sim/step.js';
import { stepPlays } from '../src/sim/plays.js';
import { coachOf, lastShot, memoryWeight } from '../src/sim/coach.js';
import { wantsTimeout } from '../src/sim/late.js';
import { CLOCK, LATE, PLAY, RIM } from '../src/sim/tuning.js';
import { DT } from '../src/sim/tuning.js';
import { at, idle } from './helpers.js';

// Live play in five a side, side 0 with the ball at the top (player 0), each defender near his man, the shot clock
// where the coach calls a play. `teams`: which teams play, side 0 first. A match with nobody playing, so that both
// coaches coach as All-Star's.
function scene(teams = [0, 1], seed = 1) {
  const s = createMatch(seed, 5, teams);
  s.humans = [];
  s.phase = 'live'; s.playWait = [0, 0]; s.shotClock = CLOCK.shot - PLAY.startAt;
  const spots = [[5.2, 0.5], [7.5, -5.5], [10.9, 3.2], [7.5, 5.5], [11.6, -6.3]];
  for (const p of s.players) {
    const [x, z] = spots[p.slot], far = Math.hypot(RIM.x - x, z), near = p.team === 0 ? 0 : 1.35;
    at(s, p.id, x + (near * (RIM.x - x)) / far, z - (near * z) / far);
  }
  giveBall(s, s.players[0]);
  return s;
}
// How often each play is called over `n` scenes.
function calls(make, n = 400) {
  const count = {};
  for (let seed = 1; seed <= n; seed++) { const s = make(seed); s.seed = seed * 31; stepPlays(s, DT); count[s.plays[0].key] = (count[s.plays[0].key] ?? 0) + 1; }
  return key => count[key] ?? 0;
}

test('the Waves call more pick-and-rolls, the Scorpions more post-ups and clear-outs', () => {
  const waves = calls(seed => scene([0, 1], seed)), scorpions = calls(seed => scene([1, 0], seed));
  assert.ok(waves('pickRoll') > 1.5 * scorpions('pickRoll'), `pick-and-roll ${waves('pickRoll')} against ${scorpions('pickRoll')}`);
  assert.ok(scorpions('postUp') + scorpions('iso') > 1.5 * (waves('postUp') + waves('iso')), `post-ups and clear-outs ${scorpions('postUp') + scorpions('iso')} against ${waves('postUp') + waves('iso')}`);
});

test('a play that has scored is called more, but one basket does not swing it', () => {
  const base = calls(seed => scene([0, 1], seed));
  const scored = calls(seed => { const s = scene([0, 1], seed); Object.assign(coachOf(s, 0).memory, { pickRoll: [14, 6], none: [16, 20] }); return s; });
  const once = calls(seed => { const s = scene([0, 1], seed); Object.assign(coachOf(s, 0).memory, { pickRoll: [3, 1], none: [16, 20] }); return s; });
  assert.ok(scored('pickRoll') > 1.3 * base('pickRoll'), `${scored('pickRoll')} against ${base('pickRoll')}`);
  assert.ok(once('pickRoll') < 1.25 * base('pickRoll'), `${once('pickRoll')} against ${base('pickRoll')}`);
  const s = scene();
  Object.assign(coachOf(s, 0).memory, { pickRoll: [0, 30], none: [40, 30] });
  assert.ok(memoryWeight(s, 0, 'pickRoll') >= 0.6, 'a cold play is never shut out altogether');
});

test('a slow big switched onto the handler draws a clear-out', () => {
  // The Scorpions' point guard made a good defender, so that the only mismatch is the one the switch makes.
  const guarded = seed => { const s = scene([0, 1], seed); s.rosters[1][0].ratings.defence = 90; return s; };
  const plain = calls(guarded);
  const switched = calls(seed => {
    const s = guarded(seed);
    // The Scorpions' centre (slot 2) now guards the ball handler, and the point guard the centre.
    const [guard, centre] = [s.players.find(p => p.team === 1 && p.slot === 0), s.players.find(p => p.team === 1 && p.slot === 2)];
    [guard.man, centre.man] = [centre.man, guard.man];
    return s;
  });
  assert.ok(switched('iso') > 1.3 * plain('iso'), `${switched('iso')} against ${plain('iso')}`);
});

test('after a timeout the coach calls what has worked best', () => {
  const ato = calls(seed => { const s = scene([0, 1], seed); s.ato = 0; Object.assign(coachOf(s, 0).memory, { horns: [12, 5], none: [20, 25] }); return s; });
  const plain = calls(seed => { const s = scene([0, 1], seed); Object.assign(coachOf(s, 0).memory, { horns: [12, 5], none: [20, 25] }); return s; });
  assert.ok(ato('horns') > 1.5 * plain('horns'), `${ato('horns')} against ${plain('horns')}`);
  const s = scene(); s.ato = 0; stepPlays(s, DT);
  assert.equal(s.ato, null, 'the play after the timeout is called once');
});

test('with 30 s on the game clock and 24 on the shot clock a team goes for two-for-one; with 20 it holds for the last shot', () => {
  const s = scene();
  Object.assign(s, { gameClock: 30, shotClock: 24 }); assert.equal(lastShot(s), '2for1');
  Object.assign(s, { gameClock: 20, shotClock: 24 }); assert.equal(lastShot(s), 'hold');
  Object.assign(s, { gameClock: 150, shotClock: 24 }); assert.equal(lastShot(s), null);
});

test('both coaches call timeouts in a match nobody plays, and team 0\'s coach never does in Play', () => {
  const watch = scene();
  for (const p of watch.players) p.x = -p.x;   // side 0 has the ball in its own half
  watch.run = [0, LATE.run];
  assert.equal(wantsTimeout(watch, 0), true);
  step(watch, idle(10), DT);
  assert.deepEqual([watch.call?.kind, watch.call?.team], ['timeout', 0]);
  const play = scene(); play.humans = [0];
  for (const p of play.players) p.x = -p.x;
  play.run = [0, LATE.run];
  step(play, idle(10), DT);
  assert.notEqual(play.call?.kind, 'timeout', 'your timeouts are yours to call');
});
