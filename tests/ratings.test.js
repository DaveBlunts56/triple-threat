import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { KEYS, lift, drop, rated, overall, starOf, heatOf } from '../src/sim/ratings.js';
import { zoneOf } from '../src/sim/players.js';
import { RIM, ROSTER } from '../src/sim/tuning.js';
import { at } from './helpers.js';

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what ?? ''}: ${a} is not ${b}`);

// The design's table: each player's role, his eight ratings in the order of KEYS, and his overall.
const TABLE = [[
  ['Jalen Cross', 'Playmaker', [78, 88, 84, 94, 90, 72, 48, 84], 88], ['Theo Marsh', 'Slasher', [90, 70, 58, 80, 88, 74, 64, 78], 82],
  ['Darius Stone', 'Rim protector', [86, 74, 42, 50, 62, 92, 90, 78], 84], ['Sam Okoro', 'Sharpshooter', [60, 88, 94, 78, 75, 58, 62, 80], 83],
  ['Andre Volkov', 'Stretch big', [80, 78, 84, 58, 56, 74, 84, 70], 80], ['Marcus Bell', 'Shot creator', [68, 86, 76, 84, 76, 52, 58, 66], 78],
  ['Noah Vance', 'Lockdown wing', [63, 55, 70, 60, 76, 90, 60, 86], 77], ['Idris Kane', 'Rebounder', [82, 62, 40, 54, 50, 76, 92, 68], 76],
], [
  ['Kai Mercer', 'Shot creator', [83, 94, 90, 92, 86, 58, 62, 78], 89], ['Luca Reyes', 'Two-way wing', [78, 72, 84, 60, 80, 88, 66, 80], 82],
  ['Viktor Lund', 'Post scorer', [94, 80, 45, 55, 52, 78, 88, 75], 83], ['Devon Hale', 'Sharpshooter', [62, 84, 92, 73, 76, 62, 44, 90], 83],
  ['Emeka Bright', 'Glass cleaner', [80, 60, 44, 52, 70, 84, 92, 74], 80], ['Rafael Ortiz', 'Lockdown guard', [62, 64, 52, 76, 86, 90, 58, 74], 78],
  ['Jamal Whitaker', 'Slasher', [86, 62, 50, 74, 84, 69, 62, 72], 77], ['Bogdan Ilic', 'Rim protector', [76, 62, 50, 44, 48, 88, 86, 68], 76],
]];

test('every player has eight ratings from 40 to 99, a role, and the overall the design gives him', () => {
  assert.deepEqual(KEYS, ['inside', 'mid', 'three', 'handle', 'speed', 'defence', 'rebound', 'stamina']);
  const s = createMatch(1, 5);
  TABLE.forEach((team, t) => team.forEach(([name, role, ratings, ovr], row) => {
    const person = s.rosters[t][row];
    assert.deepEqual([person.name, person.role, KEYS.map(key => person.ratings[key]), overall(person), person.streak], [name, role, ratings, ovr, 0]);
    assert.ok(ratings.every(r => r >= 40 && r <= 99), name);
  }));
  assert.equal(rated(s, s.players[6], 'defence'), 88);   // Luca Reyes, in the second place of team 1
});

test('the two teams are level: the starting three, the starting five and the bench total the same', () => {
  const s = createMatch(1, 5), total = (team, rows) => rows.reduce((sum, row) => sum + overall(s.rosters[team][row]), 0);
  for (const [rows, sum] of [[[0, 1, 2], 254], [[0, 1, 2, 3, 4], 417], [[5, 6, 7], 231]]) assert.deepEqual([total(0, rows), total(1, rows)], [sum, sum]);
});

test('each team\'s star is its best player', () => {
  const s = createMatch(1, 5);
  assert.deepEqual([starOf(s, 0), starOf(s, 1)], [0, 0]);
  s.rosters[0][3].ratings = { ...s.rosters[0][3].ratings, inside: 99, handle: 99, speed: 99 };
  assert.equal(starOf(s, 0), 3);
});

test('a rating of 70 changes nothing, and each 10 points changes a thing by its share', () => {
  near(lift(70, 0.07), 1); near(drop(70, 0.08), 1);
  near(lift(80, 0.07), 1.07); near(lift(50, 0.07), 0.86);
  near(drop(80, 0.08), 0.92); near(drop(40, 0.1), 1.3);
});

test('a shot is inside within three metres, a three behind the line, and mid-range between', () => {
  const s = createMatch(1, 5), zone = (id, x, z) => { at(s, id, x, z); return zoneOf(s.players[id]); };
  assert.deepEqual([zone(0, RIM.x - 2, 0), zone(0, RIM.x - 4.5, 0), zone(0, RIM.x - 7.2, 0), zone(0, RIM.x - 1, 6.9)], ['inside', 'mid', 'three', 'three']);
  assert.deepEqual([zone(5, -RIM.x + 2, 0), zone(5, -RIM.x + 7.2, 0), zone(5, RIM.x - 2, 0)], ['inside', 'three', 'three']);   // team 1 shoots at the other hoop
});

test('hot is three makes in a row and cold three misses', () => {
  assert.deepEqual([0, 2, 3, 5, -2, -3].map(streak => heatOf({ streak })), [null, null, 'hot', 'hot', null, 'cold']);
});

// ---------- what the ratings change ----------

import { giveBall, makeChance, shotWindow, contest, trySteal, tryPickup, movePlayers, releaseShot, greenAt, SHOT_BEST } from '../src/sim/players.js';
import { tire } from '../src/sim/stamina.js';
import { emptyIntent } from '../src/sim/state.js';
import { DT, PLAYER, RATE, SHOT, STAMINA } from '../src/sim/tuning.js';
import { live, idle, plain } from './helpers.js';

// Live play with plain players; `set(id, ratings)` gives one player ratings of his own.
const set = (s, id, ratings) => { Object.assign(s.rosters[s.players[id].team][s.players[id].person].ratings, ratings); return s; };
// The shooter (player 0) `out` metres from the hoop at the best moment of his shot, his defender `gap` metres off.
function shooting(out, gap = 9, ratings = {}) {
  const s = set(live(1, 5), 0, ratings);
  at(s, 0, RIM.x - out, 0); at(s, 5, RIM.x - out - gap, 0);
  s.players[0].shotT = SHOT_BEST;
  return s;
}

test('at 70 throughout, every number is the one the game had', () => {
  const s = shooting(5, 1);
  const byDistance = SHOT.nearChance + (SHOT.farChance - SHOT.nearChance) * (5 / SHOT.farDist), guarded = SHOT.maxContest + (1 - SHOT.maxContest) * (1 / SHOT.contestDist);
  near(contest(s, s.players[0]), guarded, 'contest');
  near(makeChance(s, s.players[0]), byDistance * guarded, 'chance');
  const fresh = live(1, 5); at(fresh, 1, 0, 0);
  const sprint = idle(10); sprint[1] = { ...emptyIntent(), moveX: 1, sprint: true };
  for (let i = 0; i < 120; i++) { movePlayers(fresh, sprint, DT); tire(fresh, sprint, DT); }
  near(Math.hypot(fresh.players[1].vx, fresh.players[1].vz), PLAYER.sprint, 'sprint speed');
  assert.ok(Math.abs(1 - fresh.rosters[0][1].energy - 2 * STAMINA.sprint) < 0.001, 'two seconds of sprinting');   // but for the step it takes to get going
});

test('a better shooter makes more and has a wider green window, in the zone the rating is for and no other', () => {
  const chance = (out, ratings) => { const s = shooting(out, 9, ratings); return makeChance(s, s.players[0]); };
  const half = (out, ratings) => { const s = shooting(out, 9, ratings); return shotWindow(s, s.players[0]).half; };
  near(chance(7.2, { three: 90 }) / chance(7.2, { three: 50 }), lift(90, RATE.shot) / lift(50, RATE.shot), 'threes');
  near(half(7.2, { three: 90 }) / half(7.2, { three: 50 }), lift(90, RATE.window) / lift(50, RATE.window), 'the window');
  near(chance(2, { three: 90 }), chance(2, { three: 50 }), 'inside, the three rating');
  near(chance(2, { inside: 90 }) / chance(2, { inside: 70 }), lift(90, RATE.shot), 'inside');
  near(chance(4.5, { mid: 80 }) / chance(4.5, { mid: 70 }), lift(80, RATE.shot), 'mid-range');
  near(chance(4.5, { inside: 99, three: 99 }), chance(4.5, {}), 'mid-range, the other two ratings');
});

test('a quicker player covers more ground; with the ball his handle counts too', () => {
  const topSpeed = (ratings, ball) => {
    const s = set(live(1, 5), 1, ratings); at(s, 1, -8, 0);
    if (ball) giveBall(s, s.players[1]);
    const go = idle(10); go[1] = { ...emptyIntent(), moveX: 1 };
    for (let i = 0; i < 90; i++) movePlayers(s, go, DT);
    return s.players[1].vx;
  };
  near(topSpeed({ speed: 90 }) / topSpeed({}), lift(90, RATE.speed), 'speed');
  near(topSpeed({ handle: 90 }), topSpeed({}), 'handle without the ball');
  near(topSpeed({ handle: 90, speed: 80 }, true) / topSpeed({}, true), lift(90, RATE.speed) * lift(80, RATE.speed), 'with the ball');
});

test('a better defender takes more off a shot and wins more of his reaches; a better handler loses fewer', () => {
  const left = defence => { const s = set(shooting(5, 1), 5, { defence }); return contest(s, s.players[0]); };
  near((1 - left(90)) / (1 - left(70)), lift(90, RATE.contest), 'what a contest takes off');
  assert.ok(left(90) < left(70) && left(50) > left(70));
  const steals = (defence, handle) => {
    let won = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const s = set(set(live(seed, 5), 5, { defence }), 0, { handle });
      at(s, 0, 0, 0); at(s, 5, 1, 0); s.players[0].facing = 0;   // the defender in front of him, within reach
      if (trySteal(s, s.players[5]).won) won++;
    }
    return won / 3000;
  };
  const plainRate = steals(70, 70);
  assert.ok(Math.abs(steals(95, 70) / plainRate - lift(95, RATE.steal)) < 0.12, `a 95 defender: ${steals(95, 70) / plainRate}`);
  assert.ok(Math.abs(steals(70, 95) / plainRate - drop(95, RATE.steal)) < 0.12, `a 95 handler: ${steals(70, 95) / plainRate}`);
});

test('of two players who can both reach a rebound the better rebounder gets it, though the other is a little nearer; a pass is still caught by whoever it reaches first', () => {
  const ball = mode => {
    const s = set(live(1, 5), 6, { rebound: 95 });
    at(s, 1, 0.30, 0); at(s, 6, -0.36, 0);
    Object.assign(s.ball, { holder: null, mode, x: 0, y: 1, z: 0, vx: 0, vy: -1, vz: 0, noPickupT: 0, noPickupId: null });
    s.lastTouch = 1;
    return tryPickup(s).id;
  };
  assert.equal(ball('loose'), 6, 'the nearer man took the rebound from the better rebounder');
  const pass = set(live(1, 5), 2, { rebound: 40 });
  at(pass, 1, 0.5, 0); at(pass, 2, 0.3, 0);
  Object.assign(pass.ball, { holder: null, mode: 'pass', x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, noPickupT: 0, noPickupId: null });
  pass.lastTouch = 0;
  assert.equal(tryPickup(pass).id, 2, 'a pass went to the better rebounder, not the nearer man');
});

test('a player with more stamina tires more slowly and rests no faster', () => {
  const after = (stamina, sprint) => {
    const s = set(live(1, 5), 1, { stamina }); at(s, 1, 0, 0);
    s.rosters[0][1].energy = 0.6;
    const go = idle(10); go[1] = { ...emptyIntent(), moveX: sprint ? 1 : 0, sprint };
    for (let i = 0; i < 60; i++) { movePlayers(s, go, DT); tire(s, go, DT); }
    return s.rosters[0][1].energy - 0.6;
  };
  assert.ok(Math.abs(after(90, true) / after(70, true) - drop(90, RATE.tire)) < 0.02, `${after(90, true) / after(70, true)}`);
  near(after(90, false), after(70, false), 'resting');
});

test('at the ends of the scale nothing breaks: chances stay between 0 and 1, windows and speeds stay positive, and a green shot goes in', () => {
  for (const rating of [40, 99]) for (const streak of [-5, 0, 5]) for (const out of [0.8, 2, 5, 7.5, 11]) for (const gap of [0.4, 1.2, 9]) {
    const all = Object.fromEntries(KEYS.map(key => [key, rating]));
    const s = set(set(shooting(out, gap, all), 5, all), 0, {});
    s.rosters[0][0].streak = streak;
    const chance = makeChance(s, s.players[0]), window = shotWindow(s, s.players[0]), left = contest(s, s.players[0]);
    assert.ok(chance >= 0 && chance <= 1 && left >= 0 && left <= 1 && window.half >= 0, `rating ${rating}, streak ${streak}, ${out} m, ${gap} m: ${chance}, ${left}, ${window.half}`);
    if (greenAt(window, SHOT_BEST)) { s.players[0].shooting = true; releaseShot(s, s.players[0]); assert.equal(s.shot.green, true); }
  }
});

// ---------- hot and cold ----------

import { substitute } from '../src/sim/roster.js';
import { newFreeThrow, setupFreeThrow, stepFreeThrow } from '../src/sim/freethrow.js';
import { HEAT } from '../src/sim/tuning.js';

// Player 0 shoots once: a make (let go at the best moment, open and near: always green) or a miss (let go as he
// presses from far out, with a seed that misses). Returns the match for the next shot.
function shot(s, makes) {
  const p = s.players[0];
  for (let seed = 1; seed < 400; seed++) {
    const before = s.rosters[0][0].streak;
    at(s, 0, makes ? RIM.x - 4 : RIM.x - 11.5, 0); at(s, 5, -10, 6);
    giveBall(s, p);
    Object.assign(p, { shooting: true, shotT: makes ? SHOT_BEST : 0.02 });
    s.seed = seed * 7919;
    releaseShot(s, p);
    const made = s.rosters[0][0].streak > Math.max(before, 0) || (before <= 0 && s.rosters[0][0].streak === 1);
    if (made === makes) return s;
    s.rosters[0][0].streak = before;   // the dice went the other way: take the shot again
  }
  throw new Error('no seed gave the shot wanted');
}

test('three makes in a row and he is hot, until his next miss; three misses and he is cold, until his next make', () => {
  const s = live(1, 5), me = s.rosters[0][0], heat = () => heatOf(me);
  shot(s, true); shot(s, true);
  assert.deepEqual([me.streak, heat()], [2, null]);
  shot(s, true);
  assert.deepEqual([me.streak, heat()], [3, 'hot']);
  shot(s, true);
  assert.equal(heat(), 'hot');
  shot(s, false);
  assert.deepEqual([me.streak, heat()], [-1, null]);
  shot(s, false); shot(s, false);
  assert.deepEqual([me.streak, heat()], [-3, 'cold']);
  shot(s, true);
  assert.deepEqual([me.streak, heat()], [1, null]);
});

test('hot, his shots go in more often and his window is wider; cold, they go in less often', () => {
  const at3 = streak => { const s = shooting(5, 9); s.rosters[0][0].streak = streak; return [makeChance(s, s.players[0]), shotWindow(s, s.players[0]).half]; };
  const [usual, window] = at3(0), [hot, hotWindow] = at3(HEAT.after), [cold, coldWindow] = at3(-HEAT.after);
  near(hot / usual, HEAT.hot, 'hot'); near(hotWindow / window, HEAT.hotWindow, 'the hot window');
  near(cold / usual, HEAT.cold, 'cold'); near(coldWindow, window, 'the cold window');
  near(at3(2)[0], usual, 'two makes is not hot');
});

test('free throws count for neither, and a player taken off loses his streak', () => {
  const s = live(1, 5);
  s.rosters[0][0].streak = 2;
  s.freeThrow = newFreeThrow(0, 2); setupFreeThrow(s);
  const press = idle(10); press[0] = { ...emptyIntent(), shoot: true };
  for (let i = 0; i < 600 && s.freeThrow?.left === 2; i++) stepFreeThrow(s, i % 2 ? press : idle(10), { hitFloor: false, hitRim: false, scored: 0 }, DT);
  assert.equal(s.rosters[0][0].streak, 2, 'a free throw changed his streak');
  const off = live(1, 5);
  off.rosters[0][0].streak = 4; off.rosters[0][6].streak = -2;
  assert.equal(substitute(off, 0, 6), true);
  assert.deepEqual([off.rosters[0][0].streak, off.rosters[0][6].streak], [0, -2], 'the player who went off keeps his streak');
});

// ---------- the computer plays to its players ----------

import { aiIntents } from '../src/sim/ai.js';
import { situation } from '../src/sim/late.js';
import { AI, CLOCK } from '../src/sim/tuning.js';

// Five a side, live, plain players unless a test rates one; no coach, and no waiting early in the shot clock unless
// `early`. Team 0's handler (player 0) has had the ball a second; the rest stand far off unless placed.
function floor({ early = false } = {}) {
  const s = live(1, 5);
  s.playWait = [Infinity, Infinity];
  if (!early) s.tempo = { clock: Infinity, wait: 0 };
  s.players.forEach((p, i) => at(s, p.id, -12 + (i % 5) * 0.8, p.team === 0 ? -6 : 6));
  giveBall(s, s.players[0]);
  s.players[0].ai.heldT = 2; s.players[0].ai.had = true;
  return s;
}
const plan = s => { s.players.forEach(p => { p.ai.timer = 0; }); return aiIntents(s, DT); };

// A choice is drawn (see choose.js): over many seeds the poor shooter mostly passes the three up and the sharpshooter
// mostly takes it; with the shot clock short the poor shooter always takes it.
test('a poor three-point shooter passes up an open three that a sharpshooter takes; with the shot clock short he takes it', () => {
  const open = (three, seed) => { const s = set(floor(), 0, { three }); s.seed = seed * 13; at(s, 0, RIM.x - 7.2, 0); at(s, 5, RIM.x - 3, 0.2); return s; };   // open behind the line, his lane not clear
  let poorShot = 0, goodShot = 0, short = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const poor = open(50, seed), good = open(90, seed);
    plan(poor); plan(good);
    if (poor.players[0].ai.action === 'shoot') poorShot++;
    if (good.players[0].ai.action === 'shoot') goodShot++;
    poor.shotClock = AI.panicClock - 0.5; plan(poor);
    if (poor.players[0].ai.action === 'shoot') short++;
  }
  assert.ok(poorShot <= 10 && goodShot >= 30, `poor ${poorShot}, good ${goodShot} of 40`);
  assert.equal(short, 40);
});

test('early in the shot clock only a great shooter with room takes the three', () => {
  const open = (three, gap) => { const s = set(floor({ early: true }), 0, { three }); at(s, 0, RIM.x - 7.2, 0); at(s, 5, RIM.x - 7.2 + gap, 0.3); plan(s); return s.players[0].ai.action; };
  assert.deepEqual([open(92, 4), open(80, 4), open(92, 2.2)], ['shoot', null, null]);
});

test('the pass leans to the star and to a hot player, and away from a cold one', () => {
  // The handler (player 1) is covered; two team-mates are open, one a little nearer the hoop than the other.
  const pass = change => {
    const s = floor(); giveBall(s, s.players[1]); s.players[1].ai.heldT = 2; s.players[1].ai.had = true; s.seed = 99;
    at(s, 1, 6.5, 0); at(s, 6, 7.9, -0.6);
    at(s, 2, 7.6, 5); at(s, 0, 7.0, -5);          // player 2 is 0.5 m nearer the hoop than player 0
    change(s);
    for (let i = 0; i < 40; i++) { const thrown = plan(s)[1]; if (thrown.pass) return thrown.moveZ > 0 ? 2 : 0; s.players[1].prev.pass = false; }
    return null;
  };
  assert.equal(pass(() => {}), 0, 'the star (player 0, Jalen Cross) is not leaned to');
  assert.equal(pass(s => { s.rosters[0][0].streak = -3; }), 2, 'a cold star is still leaned to');
  const noStar = s => { s.rosters[0][7].ratings = Object.fromEntries(KEYS.map(k => [k, 99])); };   // the star is on the bench
  assert.equal(pass(noStar), 2, 'with no star on the floor the nearer man is not chosen');
  assert.equal(pass(s => { noStar(s); s.rosters[0][0].streak = 3; }), 0, 'a hot player is not leaned to');
});

test('with the game on the line the ball goes to the star', () => {
  const s = floor(); giveBall(s, s.players[1]); s.players[1].ai.heldT = 2; s.players[1].ai.had = true;
  Object.assign(s, { quarter: CLOCK.quarters, gameClock: 10, score: [20, 21] });
  at(s, 1, 6.5, 0); at(s, 6, 7.9, -0.6);
  at(s, 0, 6, 5); at(s, 5, 7, 4.2);               // the star, with his defender on him
  at(s, 2, 10.5, 3);                              // a team-mate open near the hoop
  assert.equal(situation(s, 0).clutch, true);
  const thrown = plan(s)[1];
  assert.ok(thrown.pass && thrown.moveZ > 0.9, 'he did not pass to the star');
  s.gameClock = 100;
  assert.equal(situation(s, 0).clutch, false);
});

test('a sharpshooter is guarded closer than a poor shooter, on the ball and off it; a quick man is given more room', () => {
  const gap = (ratings, ball) => {
    const s = set(floor(), 0, ratings);
    if (!ball) giveBall(s, s.players[1]);
    at(s, 0, 6, 3); at(s, 1, 6, -4); at(s, 5, 9, 2); at(s, 6, 9, -3);
    plan(s);
    return Math.hypot(s.players[5].ai.targetX - 6, s.players[5].ai.targetZ - 3);
  };
  for (const ball of [true, false]) assert.ok(gap({ three: 95 }, ball) < gap({}, ball) - 0.1 && gap({ three: 45 }, ball) > gap({}, ball) + 0.1, ball ? 'on the ball' : 'off the ball');
  assert.ok(gap({ speed: 95 }, true) > gap({}, true) + 0.05, 'a quick handler');
  assert.ok(gap({ three: 99, speed: 40 }, true) >= AI.gapRange[0] && gap({ three: 40, speed: 99 }, true) <= AI.gapRange[1] + 1e-9);
});
