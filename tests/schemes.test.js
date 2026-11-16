// The defence (plan Task 3.6): the screen schemes, the post double, ball-watching, closeouts and reaction times.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, emptyIntent } from '../src/sim/state.js';
import { giveBall } from '../src/sim/players.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { callPlay, stepPlays } from '../src/sim/plays.js';
import { manOf, guardOf } from '../src/sim/matchups.js';
import { STYLES, setStyle } from '../src/sim/styles.js';
import { AI, DT, RIM, SCHEME } from '../src/sim/tuning.js';
import { at } from './helpers.js';

const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const target = p => ({ x: p.ai.targetX, z: p.ai.targetZ });
const hoop = { x: RIM.x, z: 0 };

// Five a side in live play: the Waves (team 0) attack +x with the ball at the top; the Scorpions (team 1, who drop
// their big on screens and double the post) each a step off their man toward the hoop. Nobody plays.
function scene(seed = 1) {
  const s = createMatch(seed, 5);
  Object.assign(s, { humans: [], phase: 'live', frontcourt: true, playWait: [Infinity, Infinity], tempo: { clock: Infinity, wait: 0 }, shotClock: 16 });
  const spots = [[5.2, 0.5], [7.5, -5.5], [10.9, 3.2], [7.5, 5.5], [11.6, -6.3]];
  for (const p of s.players) {
    const [x, z] = spots[p.slot], far = Math.hypot(RIM.x - x, z), near = p.team === 0 ? 0 : 1.35;
    at(s, p.id, x + (near * (RIM.x - x)) / far, z - (near * z) / far);
  }
  for (const p of s.players) p.man = s.players.find(o => o.team !== p.team && o.slot === p.slot).id;   // each on the man in his place
  giveBall(s, s.players[0]);
  return s;
}
const plan = s => aiIntents(s, DT);

test('in a drop the big sits between the ball and the rim until the handler is past the screen', () => {
  const s = scene();
  callPlay(s, 0, 'pickRoll'); stepPlays(s, DT);
  const screener = s.players[s.plays[0].ids.big], big = guardOf(s, screener), handler = s.players[0];
  plan(s);
  const far = apart(handler, hoop), spot = { x: hoop.x + ((handler.x - hoop.x) / far) * SCHEME.dropAt, z: hoop.z + ((handler.z - hoop.z) / far) * SCHEME.dropAt };
  assert.ok(apart(target(big), spot) < 0.05, `the big is sent to ${JSON.stringify(target(big))}`);
  // Long after the screen has been used he is back on his man.
  Object.assign(s.plays[0], { setAt: 0, usedAt: 0, t: 3 }); big.ai.timer = 0;
  plan(s);
  assert.ok(apart(target(big), screener) < apart(target(big), spot), 'he stays back after the screen');
});

test('a switching team does not drop: its big stays with the screener', () => {
  const s = createMatch(1, 5, [1, 0]);   // the Waves defend
  Object.assign(s, { humans: [], phase: 'live', frontcourt: true, playWait: [Infinity, Infinity], tempo: { clock: Infinity, wait: 0 }, shotClock: 16 });
  const base = scene();
  s.players.forEach((p, i) => at(s, i, base.players[i].x, base.players[i].z));
  for (const p of s.players) p.man = s.players.find(o => o.team !== p.team && o.slot === p.slot).id;
  giveBall(s, s.players[0]);
  callPlay(s, 0, 'pickRoll'); stepPlays(s, DT);
  const screener = s.players[s.plays[0].ids.big], big = guardOf(s, screener), handler = s.players[0];
  plan(s);
  const far = apart(handler, hoop), spot = { x: hoop.x + ((handler.x - hoop.x) / far) * SCHEME.dropAt, z: hoop.z + ((handler.z - hoop.z) / far) * SCHEME.dropAt };
  assert.ok(apart(target(big), spot) > 1, 'the big drops');
});

test('a post scorer catching deep draws a double, from the man guarding the nearest non-shooter', () => {
  const s = scene();
  const post = s.players[2];                 // Darius Stone, inside 86
  at(s, 2, RIM.x - 2.5, 1.5); at(s, s.players[2].man === 7 ? 7 : guardOf(s, post).id, RIM.x - 1.9, 1.3);
  giveBall(s, post); post.ai.heldT = 0.6;
  plan(s);
  const doubler = s.players.find(p => p.team === 1 && manOf(s, p) !== post && apart(target(p), post) < SCHEME.doubleGap + 0.2);
  assert.ok(doubler, 'nobody doubled');
  assert.ok(s.rosters[0][manOf(s, doubler).person].ratings.three < 80, 'he left a shooter');
  assert.ok(doubler.ai.helpUntil > s.time, 'the others are told he has left his man');
  // A team that does not double leaves him one on one.
  const lone = scene(); lone.coach[1] = null; lone.teams = [lone.teams[0], { ...lone.teams[1], defence: 'switchAll' }];
  at(lone, 2, RIM.x - 2.5, 1.5); giveBall(lone, lone.players[2]); lone.players[2].ai.heldT = 0.6;
  plan(lone);
  assert.ok(!lone.players.some(p => p.team === 1 && manOf(lone, p) !== lone.players[2] && apart(target(p), lone.players[2]) < SCHEME.doubleGap + 0.2));
});

test('a ball-watching defender lets his man get away on a cut; a sharp one stays with him', () => {
  const gapAfter = iq => {
    const s = scene(3);
    const cutter = s.players[3], d = guardOf(s, cutter);
    s.rosters[1][d.person].iq = iq;
    s.cut[0] = { id: cutter.id, until: s.time + 2 };
    for (let t = 0; t < 0.7; t += DT) {
      const all = aiIntents(s, DT);
      all[cutter.id] = { ...emptyIntent(), moveX: 1, moveZ: -0.8, sprint: true };   // he sets off for the rim
      step(s, all.map((it, i) => (i === cutter.id || s.players[i].team === 1 ? it : emptyIntent())), DT);
    }
    return apart(d, cutter);
  };
  assert.ok(gapAfter(0.35) > gapAfter(0.98) + 0.3, `low IQ ${gapAfter(0.35).toFixed(2)} m behind, sharp ${gapAfter(0.98).toFixed(2)}`);
});

test('a flying closeout aims past the shooter; one under control stops short of him', () => {
  const aim = fly => {
    const s = scene(5);
    const tables = { ...STYLES, arcade: { ...STYLES.arcade, 'decide.fly': fly ? 1 : 0 } };
    setStyle(s, 'arcade', undefined, tables);
    const shooter = s.players[3], d = guardOf(s, shooter);
    s.rosters[1][d.person].iq = 0;   // so that a style that flies at all always does
    at(s, d.id, shooter.x + 4, shooter.z - 3);
    giveBall(s, shooter); shooter.ai.heldT = 0.1;
    plan(s);
    return { far: apart(target(d), d), toMan: apart(shooter, d), closing: d.closing };
  };
  const flying = aim(true), steady = aim(false);
  assert.ok(flying.closing && steady.closing);
  assert.ok(flying.far > flying.toMan, 'a flying closeout aims past him');
  assert.ok(steady.far < steady.toMan, 'a controlled one stops short');
});

test('a sharp player looks again sooner than a slow one; Arcade\'s players on average as often as before', () => {
  const s = scene(7);
  const wait = iq => { let sum = 0; for (let i = 0; i < 400; i++) { const p = s.players[6]; s.rosters[1][p.person].iq = iq; p.ai.timer = 0; plan(s); sum += p.ai.timer; } return sum / 400; };
  assert.ok(wait(0.98) < wait(0.4) - 0.04);
  const mean = s.rosters.flat().reduce((sum, p) => sum + (1 + 0.5 * (0.7 - p.iq)), 0) / 16;
  assert.ok(Math.abs(mean - 1) < 0.05, `the mean interval is ${mean.toFixed(3)} of Arcade's 0.3 s`);
  assert.equal(AI.interval, 0.3);
});
