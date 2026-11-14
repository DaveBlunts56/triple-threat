import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, emptyIntent, personOf } from '../src/sim/state.js';
import { giveBall, shotWindow, makeChance, SHOT_BEST } from '../src/sim/players.js';
import { step } from '../src/sim/step.js';
import { callTimeout, startMatch } from '../src/sim/rules.js';
import { situation, wantsTimeout } from '../src/sim/late.js';
import { newFreeThrow, setupFreeThrow, stepFreeThrow } from '../src/sim/freethrow.js';
import { aiIntents } from '../src/sim/ai.js';
import { callText } from '../src/render/hud.js';
import { AI, CLOCK, DIFFICULTY, DT, FT, LATE, RIM, TIMEOUT, levelOf } from '../src/sim/tuning.js';
import { at, ai, idle, run, plain } from './helpers.js';

const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const target = p => ({ x: p.ai.targetX, z: p.ai.targetZ });

// Five a side, live, no coach. Team 0 attack +x from their spots; each of team 1 stands 1.35 m from his man toward
// the hoop. `holder` has the ball. The last period unless told.
function scene({ holder = 0, quarter = CLOCK.quarters, left = 120, score = [0, 0] } = {}) {
  const s = plain(createMatch(1, 5));   // plain players: what the ratings do has its own tests
  s.phase = 'live'; s.playWait = [Infinity, Infinity];
  s.tempo = { clock: Infinity, wait: 0 };   // no waiting early in the shot clock: that has its own tests
  Object.assign(s, { quarter, gameClock: left, score: [...score] });
  const spots = [[5.2, 0.5], [7.5, -5.5], [10.9, 3.2], [7.5, 5.5], [11.6, -6.3]];
  for (const p of s.players) {
    const [x, z] = spots[p.slot], far = Math.hypot(RIM.x - x, z), near = p.team === 0 ? 0 : 1.35;
    at(s, p.id, x + near * (RIM.x - x) / far, z - near * z / far);
  }
  giveBall(s, s.players[holder]);
  const h = s.players[holder]; h.ai.heldT = 1; h.ai.had = true;
  return s;
}
// The same with the teams' ends swapped in effect: team 1 has the ball at team 0's place. Used for the computer's team.
const their = options => { const s = scene(options); for (const p of s.players) p.x = -p.x; giveBall(s, s.players[5]); s.players[5].ai.heldT = 1; s.players[5].ai.had = true; return s; };

// ---------- difficulty ----------

test('the levels run from Rookie to Legend, and All-Star is the game as it was', () => {
  assert.deepEqual(DIFFICULTY.order.map(k => DIFFICULTY.label[k]), ['Rookie', 'Starter', 'All-Star', 'Superstar', 'Legend']);
  assert.deepEqual(DIFFICULTY.levels.allstar, { green: 1, make: 1, sweep: 1, timing: 0.6, jitter: AI.releaseJitter, interval: AI.interval, steal: 1, adapt: 0.6 });
  assert.ok(DIFFICULTY.levels.legend.make < DIFFICULTY.levels.superstar.make && DIFFICULTY.levels.superstar.make < 1 && DIFFICULTY.levels.rookie.make === 1);
  const keys = ['green', 'timing', 'jitter', 'interval'], down = DIFFICULTY.order.map(k => DIFFICULTY.levels[k]);
  for (const key of keys) for (let i = 1; i < down.length; i++) assert.ok(down[i][key] < down[i - 1][key], `${key} does not fall from level ${i - 1} to ${i}`);
  for (const key of ['sweep', 'steal', 'adapt']) for (let i = 1; i < down.length; i++) assert.ok(down[i][key] > down[i - 1][key], `${key} does not rise`);
  assert.equal(levelOf({ difficulty: 'nonsense' }), DIFFICULTY.levels.allstar);
});

test('your green window is wider on the easy levels and narrower on the hard ones; the computer\'s is the same on all', () => {
  const half = (level, id) => { const s = scene(); s.difficulty = level; at(s, id, id < 5 ? 8 : -8, 0); return shotWindow(s, s.players[id]).half; };
  const mine = DIFFICULTY.order.map(level => half(level, 0));
  DIFFICULTY.order.forEach((level, i) => assert.ok(Math.abs(mine[i] / mine[2] - DIFFICULTY.levels[level].green) < 1e-9, `${level}: ${mine}`));
  for (let i = 1; i < mine.length; i++) assert.ok(mine[i] < mine[i - 1]);
  assert.equal(new Set(DIFFICULTY.order.map(level => half(level, 5))).size, 1);
});

test('a badly timed shot of yours keeps more of its chance on the easy levels', () => {
  const chance = level => { const s = scene(); s.difficulty = level; s.players[0].shotT = SHOT_BEST / 2; return makeChance(s, s.players[0]); };
  assert.ok(chance('rookie') > chance('allstar') && chance('allstar') > chance('legend'));
});

test('your free-throw meter moves slower on the easy levels and faster on the hard ones', () => {
  const moved = level => {
    const s = scene(); s.difficulty = level;
    s.freeThrow = newFreeThrow(0, 2); setupFreeThrow(s);
    stepFreeThrow(s, idle(10), { hitFloor: false }, DT);
    return s.freeThrow.meter;
  };
  assert.ok(Math.abs(moved('rookie') / moved('allstar') - 0.6) < 1e-9 && Math.abs(moved('legend') / moved('allstar') - 1.5) < 1e-9);
  assert.ok(Math.abs(moved('allstar') - FT.sweep * DT) < 1e-9);
});

test('the computer\'s team decides faster on the hard levels; your team-mates do not change', () => {
  const timers = level => { const s = scene(); s.difficulty = level; s.seed = 5; aiIntents(s, DT); return [s.players[1].ai.timer, s.players[6].ai.timer]; };
  const [mineEasy, theirsEasy] = timers('rookie'), [mineHard, theirsHard] = timers('legend');
  assert.ok(theirsEasy > 0.45 - DT && theirsHard < 0.2 + AI.jitter, `${theirsEasy}, ${theirsHard}`);
  assert.ok(Math.abs(mineEasy - mineHard) <= AI.jitter && mineEasy >= AI.interval - DT);
});

// ---------- the end of a period and of a game ----------

test('the situation: hustle in the last minute of a close game; hurry, press and fouling for the team behind; the clock for the team ahead', () => {
  const sit = (left, score, team = 0, quarter = CLOCK.quarters) => situation(scene({ left, score, quarter }), team);
  assert.deepEqual(sit(120, [10, 12]), { lead: -2, clock: CLOCK.shot, hustle: false, hurry: false, milk: false, press: false, foul: false, clutch: false });
  assert.equal(sit(50, [10, 12]).hustle, true);
  assert.equal(sit(50, [10, 30]).hustle, false, 'not in a blowout');
  assert.equal(sit(50, [10, 12], 0, 1).hustle, false, 'not in the first period');
  const behind = sit(20, [10, 14]);
  assert.deepEqual([behind.hurry, behind.press, behind.foul, behind.milk, behind.clock], [true, true, true, false, 20]);
  const ahead = sit(20, [10, 14], 1);
  assert.deepEqual([ahead.hurry, ahead.press, ahead.foul, ahead.milk], [false, false, false, true]);
  assert.equal(sit(40, [10, 14]).foul, false, 'too early to foul');
  assert.equal(sit(1, [10, 14]).foul, false, 'too late to foul');
  assert.equal(sit(20, [10, 24]).foul, false, 'too far behind to foul');
  assert.equal(sit(20, [10, 10]).hurry, false, 'level: no hurry');
});

test('with the period running out the computer shoots before it ends, whatever the shot clock says', () => {
  const s = scene({ quarter: 1, left: 2.5 });
  assert.equal(s.shotClock, CLOCK.shot);
  assert.ok(run(s, 2.4, st => aiIntents(st, DT), st => st.ball.mode === 'shot'), 'the period ended with the ball in his hands');
});

test('far out with a few seconds left he runs nearer first, and still gets the shot away', () => {
  const s = scene({ quarter: 1, left: 3 });
  at(s, 0, -4, 0); at(s, 5, 3, 3);
  ai(s);
  assert.equal(s.players[0].ai.action, null);
  assert.ok(s.players[0].ai.targetX > 6 && s.players[0].ai.sprint, 'he did not run for the hoop');
  assert.ok(run(s, 2.9, st => aiIntents(st, DT), st => st.ball.mode === 'shot'), 'no shot before the horn');
});

test('behind late and within reach, the computer fouls the ball on purpose; not when it is ahead, far behind, or early', () => {
  const fouled = options => {
    const s = scene(options);
    at(s, 5, s.players[0].x + 0.9, s.players[0].z);   // his defender within reach
    const before = s.teamFouls[1];
    run(s, 1, st => aiIntents(st, DT).map((intent, i) => (i === 0 ? emptyIntent() : intent)), st => st.phase !== 'live');
    return s.teamFouls[1] > before && s.call?.kind === 'reach';
  };
  assert.equal(fouled({ left: 20, score: [14, 10] }), true);
  assert.equal(fouled({ left: 20, score: [10, 14] }), false, 'ahead');
  assert.equal(fouled({ left: 20, score: [30, 10] }), false, 'out of reach');
  assert.equal(fouled({ left: 100, score: [14, 10] }), false, 'early');
});

test('ahead late the computer uses the clock: open and in range, it does not shoot until the shot clock is nearly out', () => {
  const s = their({ left: 30, score: [10, 14] });
  at(s, 0, 0, 6);                    // nobody near the handler
  at(s, 2, -9, 0.3);                 // but his lane to the hoop is not clear
  ai(s);
  assert.equal(s.players[5].ai.action, null, 'he shot with the lead and the clock');
  s.shotClock = LATE.milkClock - 0.5; s.players[5].ai.timer = 0; ai(s);
  assert.equal(s.players[5].ai.action, 'shoot');
  const level = their({ left: 30, score: [14, 14] });
  at(level, 0, 0, 6); at(level, 2, -9, 0.3);
  ai(level);
  assert.equal(level.players[5].ai.action, 'shoot', 'level: he plays as usual');
});

test('in the last minute of a close game everyone hustles: the computer\'s players sprint to their places', () => {
  const calm = scene({ left: 120, score: [10, 12] }), close = scene({ left: 50, score: [10, 12] });
  for (const s of [calm, close]) {
    // Each in turn is put a short step from where he is wanted: near enough that he would walk it.
    for (const id of [1, 6]) {
      ai(s);
      const to = target(s.players[id]);
      at(s, id, to.x - 0.8, to.z);
      for (const p of s.players) p.ai.timer = 0;
    }
    ai(s);
  }
  assert.deepEqual([calm.players[1].ai.sprint, calm.players[6].ai.sprint], [false, false]);
  assert.deepEqual([close.players[1].ai.sprint, close.players[6].ai.sprint], [true, true]);
});

// ---------- timeouts ----------

test('a timeout: a team with the ball, or at a stoppage, may call one of its three; play stops, everyone rests, and the ball stays whose it was', () => {
  const s = scene();
  assert.deepEqual(s.timeouts, [TIMEOUT.each, TIMEOUT.each]);
  for (const person of s.rosters.flat()) person.energy = 0.5;
  assert.equal(callTimeout(s, 1), false, 'the team without the ball');
  assert.equal(callTimeout(s, 0), true);
  assert.deepEqual([s.phase, s.phaseT, s.possession, s.timeouts, s.call.kind, s.call.team], ['dead', CLOCK.timeout, 0, [2, 3], 'timeout', 0]);
  assert.ok(s.rosters.flat().every(person => Math.abs(person.energy - 0.5 - TIMEOUT.rest) < 1e-9));
  assert.equal(callText(s.call), 'Timeout, Harbor City Waves. Your ball');
  assert.equal(callTimeout(s, 1), true, 'either team at a stoppage');
  assert.equal(s.possession, 0);
  run(s, CLOCK.timeout + 0.1, idle(10));
  assert.equal(s.phase, 'inbound');
  assert.equal(s.players[s.ball.holder].team, 0);
});

test('no timeout while a shot is going up, during free throws, at the tip, or with none left', () => {
  const shooting = scene(); shooting.players[0].shooting = true;
  const ft = scene(); ft.freeThrow = newFreeThrow(0, 2); setupFreeThrow(ft);
  const tip = createMatch(1, 5); startMatch(tip);
  const none = scene(); none.timeouts = [0, 3];
  assert.deepEqual([callTimeout(shooting, 0), callTimeout(ft, 0), callTimeout(tip, 0), callTimeout(none, 0)], [false, false, false, false]);
  assert.deepEqual(none.timeouts, [0, 3]);
});

test('the computer\'s coach calls a timeout to stop a run or rest a tired five, with the ball in his own half, and not twice in a row', () => {
  const s = their();
  for (const p of s.players) p.x = -p.x;             // team 1 has the ball in its own half
  assert.equal(wantsTimeout(s, 1), false);
  s.run = [LATE.run, 0];
  assert.equal(wantsTimeout(s, 1), true);
  assert.equal(wantsTimeout(s, 0), false, 'not the team on the run');
  step(s, idle(10), DT);
  assert.deepEqual([s.call?.kind, s.call?.team, s.timeouts], ['timeout', 1, [3, 2]]);
  assert.equal(wantsTimeout(s, 1), false, 'not again at once');
  const tired = their(); for (const p of tired.players) p.x = -p.x;
  for (const p of tired.players.filter(m => m.team === 1)) personOf(tired, p).energy = LATE.tired - 0.05;
  assert.equal(wantsTimeout(tired, 1), true);
  const attacking = their(); attacking.run = [LATE.run, 0];
  assert.equal(wantsTimeout(attacking, 1), false, 'not with the ball in the front court');
});

// ---------- help defence, and a defence that adapts ----------

test('help: when the handler has a clear lane near the hoop, the defender off the ball nearest the hoop steps in front of the rim, and the rest stay with their men', () => {
  const s = scene();
  at(s, 0, 7, 0); at(s, 5, 6, 2.5);                 // the handler has beaten his man
  ai(s);
  const hoop = { x: RIM.x, z: 0 };
  const helper = s.players.filter(p => p.team === 1 && p.id !== 5).reduce((a, b) => (apart(b, hoop) < apart(a, hoop) ? b : a));
  assert.ok(apart(target(helper), hoop) <= AI.helpAt + 0.01 && target(helper).x < RIM.x, `the helper is sent to ${JSON.stringify(target(helper))}`);
  for (const p of s.players.filter(m => m.team === 1 && m !== helper && m.id !== 5))
    assert.ok(apart(target(p), s.players[p.man]) < 2.2, `player ${p.id} left his man`);
  // He stays a moment once he has come, though he now stands in the lane himself.
  at(s, helper.id, target(helper).x, target(helper).z); helper.ai.timer = 0; ai(s);
  assert.ok(apart(target(helper), hoop) <= AI.helpAt + 0.01, 'he went straight back');
  // With the handler covered nobody helps.
  const covered = scene(); ai(covered);
  for (const p of covered.players.filter(m => m.team === 1)) assert.ok(apart(target(p), covered.players[p.man]) < 2.2, `player ${p.id}`);
});

test('the computer\'s defence adapts to what you score with, by as much as the level says: tight on a team making threes, loose off the ball on one scoring inside', () => {
  const gap = (level, made, id) => { const s = scene(); s.difficulty = level; s.made = [made, [0, 0]]; ai(s); return apart(target(s.players[id]), s.players[s.players[id].man]); };
  const usual = gap('legend', [0, 0], 6);
  assert.ok(gap('legend', [1, 5], 6) < usual - 0.3, 'not tighter on shooters');
  assert.ok(gap('legend', [6, 0], 6) > usual + 0.3, 'not looser on a team scoring inside');
  assert.ok(Math.abs(gap('rookie', [1, 5], 6) - usual) < 1e-9, 'Rookie adapts');
  assert.ok(Math.abs(gap('legend', [1, 1], 6) - usual) < 1e-9, 'it adapts on too few baskets');
});

test('how many steps a shot of yours is green on: an open one seven at All-Star and three at Superstar and Legend; a guarded one five, three and one', async () => {
  const { greenAt } = await import('../src/sim/players.js');
  const steps = (level, guarded) => {
    const s = scene(); s.difficulty = level;
    at(s, 0, 8.5, 0); at(s, 5, guarded ? 9.8 : 0, guarded ? 0 : 7);   // his defender 1.3 m off, or nowhere near
    const window = shotWindow(s, s.players[0]);
    assert.equal(window.level, guarded ? 'Guarded' : 'Open');
    let green = 0;
    for (let k = -8; k <= 8; k++) if (greenAt(window, SHOT_BEST + k * DT)) green++;
    return green;
  };
  assert.deepEqual(['allstar', 'superstar', 'legend'].map(level => steps(level, false)), [7, 3, 3]);
  assert.deepEqual(['allstar', 'superstar', 'legend'].map(level => steps(level, true)), [5, 3, 1]);
});

test('a shot of yours that is not green goes in less often at Superstar and less again at Legend, however well it is timed; the computer\'s is not changed', () => {
  const chance = (level, id) => { const s = scene(); s.difficulty = level; s.players[id].shotT = SHOT_BEST; at(s, id, id < 5 ? 8 : -8, 0); return makeChance(s, s.players[id]); };
  assert.ok(Math.abs(chance('superstar', 0) / chance('allstar', 0) - 0.85) < 1e-9 && Math.abs(chance('legend', 0) / chance('allstar', 0) - 0.7) < 1e-9);
  assert.equal(chance('rookie', 0), chance('allstar', 0));
  assert.equal(chance('legend', 5), chance('rookie', 5));
});
