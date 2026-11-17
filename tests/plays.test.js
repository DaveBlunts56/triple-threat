import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, emptyIntent } from '../src/sim/state.js';
import { giveBall } from '../src/sim/players.js';
import { step } from '../src/sim/step.js';
import { PLAYS, playsFor, callPlay, stepPlays, playSpot, playOn, playTarget, screenerOn } from '../src/sim/plays.js';
import { aiIntents } from '../src/sim/ai.js';
import { personOf } from '../src/sim/state.js';
import { keyContains } from '../src/sim/violations.js';
import { guardOf } from '../src/sim/matchups.js';
import { AI, ARC, CLOCK, COURT, DT, FOUL, PLAY, PLAYER, READ, RIM, VIOLATION } from '../src/sim/tuning.js';
import { at, ai, idle } from './helpers.js';

const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Live play, team 0 with the ball at the top of the key (player 0), each defender a metre and a third from his man
// toward the hoop, the coach kept quiet so that only the play asked for runs.
function scene(size = 5) {
  const s = createMatch(1, size);
  s.phase = 'live'; s.playWait = [Infinity, Infinity];
  s.tempo = { clock: Infinity, wait: 0 };   // no waiting early in the shot clock: that has its own tests
  const spots = size === 5 ? [[5.2, 0.5], [7.5, -5.5], [10.9, 3.2], [7.5, 5.5], [11.6, -6.3]] : [[5.2, 0.5], [6.9, -4.5], [10.9, 3.2]];
  for (const p of s.players) {
    const [x, z] = spots[p.slot], far = Math.hypot(RIM.x - x, z), near = p.team === 0 ? 0 : 1.35;
    at(s, p.id, x + near * (RIM.x - x) / far, z - near * z / far);
  }
  giveBall(s, s.players[0]);
  return s;
}
// Starts `key` for team 0, its screen to be taken the plain way (the variants have their own test).
const run = (s, key) => { assert.equal(callPlay(s, 0, key), true); stepPlays(s, DT); assert.equal(playOn(s, 0)?.key, key, `${key} did not start`); s.plays[0].variant = 'normal'; return s.plays[0]; };

test('each size of match has its plays, and every play has a name and a line for the player', () => {
  assert.deepEqual(playsFor(3), ['pickRoll', 'pickPop', 'iso', 'postUp', 'giveGo', 'dho', 'flare']);
  assert.deepEqual(playsFor(5), ['pickRoll', 'pickPop', 'iso', 'horns', 'fiveOut', 'postUp', 'floppy', 'spain', 'giveGo', 'ucla', 'dho', 'flare']);
  for (const play of Object.values(PLAYS)) assert.ok(play.name && play.hint && play.long > 0);
});

test('the parts: the handler has the ball, the centre is the big, and in five a side the smallest left is the shooter', () => {
  const five = scene(5), three = scene(3);
  assert.deepEqual(run(five, 'pickRoll').ids, { handler: 0, big: 2, big2: 4, wing: 1, shooter: 3 });
  assert.deepEqual(run(three, 'pickRoll').ids, { handler: 0, big: 2, wing: 1 });
  const centre = scene(5);
  giveBall(centre, centre.players[2]);   // the centre brings it up: the power forward is the big
  assert.equal(run(centre, 'pickRoll').ids.big, 4);
});

test('through every play, everyone is sent somewhere on the court, the spots are apart, and nobody is left in the key', () => {
  for (const size of [3, 5]) for (const key of playsFor(size)) {
    const s = scene(size), play = run(s, key), inKey = {};
    const mates = s.players.filter(p => p.team === 0);
    for (; play.t < PLAYS[key].long; play.t += 0.1) {
      // Part of the way through the screen is set and then used, and the ball is passed on, so that every stage is seen.
      if (play.t > PLAYS[key].long * 0.3) {
        play.setAt ??= play.t;
        // The plays that turn on a pass: the ball goes to the wing on the play's side (to the man coming for a handoff,
        // or flaring).
        if (['giveGo', 'ucla', 'dho', 'flare'].includes(key) && s.ball.holder === 0) { giveBall(s, s.players[play.ids.shooter ?? play.ids.wing]); stepPlays(s, 0); }
      }
      if (play.t > PLAYS[key].long * 0.45) play.usedAt ??= play.t;
      const spots = mates.map(p => ({ p, spot: playSpot(s, p) })).filter(e => e.spot);
      assert.ok(spots.length >= size - 1, `${key} at ${play.t.toFixed(1)}: only ${spots.length} have a spot`);
      for (const { p, spot } of spots) {
        assert.ok(Number.isFinite(spot.x + spot.z) && Math.abs(spot.x) <= COURT.halfLength && Math.abs(spot.z) <= COURT.halfWidth, `${key}: player ${p.id} sent to ${JSON.stringify(spot)}`);
        assert.ok(spot.x > 0, `${key}: player ${p.id} sent to the back court`);
        inKey[p.id] = keyContains(spot.x, spot.z, 1) ? (inKey[p.id] ?? 0) + 0.1 : 0;
        assert.ok(inKey[p.id] <= VIOLATION.key - 0.3 || s.ball.holder === p.id, `${key}: player ${p.id} is left in the key`);
      }
      // A screener stands against a defender, and so near whoever that defender guards; the rest keep apart.
      const free = spots.filter(e => e.p.id !== play.ids[PLAYS[key].screener] && e.p.id !== play.ids[PLAYS[key].screens] && !(key === 'spain' && e.p.id === play.ids.shooter));
      free.forEach((a, i) => free.slice(i + 1).forEach(b => assert.ok(apart(a.spot, b.spot) >= 1.2,
        `${key} at ${play.t.toFixed(1)}: players ${a.p.id} and ${b.p.id} are sent to the same place`)));
    }
  }
});

test('pick and roll: the big screens beside the handler\'s defender on the play\'s side, the handler goes round it, and the big rolls to the rim', () => {
  const s = scene(5), play = run(s, 'pickRoll'), big = s.players[play.ids.big], defender = guardOf(s, s.players[0]);
  const screen = playSpot(s, big);
  assert.ok(Math.abs(apart(screen, defender) - PLAY.screenGap) < 0.15, `the screen is ${apart(screen, defender)} from the defender`);
  assert.ok((screen.z - defender.z) * play.side > 0.4, 'the screen is not on the play\'s side');
  assert.ok(apart(screen, s.players[0]) > 2 * PLAYER.radius, 'the screener stands on the handler');
  // Until the screen is set the handler waits; then he is sent round the outside of it, further up the court.
  assert.equal(play.setAt, null);
  at(s, big.id, screen.x, screen.z); big.setT = FOUL.setTime;
  stepPlays(s, DT);
  assert.notEqual(play.setAt, null, 'the screen was not seen to be set');
  const round = playSpot(s, s.players[0]);
  assert.ok((round.z - screen.z) * play.side > 0.9, `the handler is sent to ${JSON.stringify(round)}`);   // first across, wide of the screener's outside shoulder
  // Once he is past it the screen is used, and the big rolls.
  at(s, 0, big.x + 0.6, big.z + play.side);
  stepPlays(s, DT);
  assert.notEqual(play.usedAt, null, 'the screen was not seen to be used');
  const roll = playSpot(s, big);
  assert.ok(apart(roll, { x: RIM.x, z: 0 }) < AI.layupDist && roll.sprint, `the big rolls to ${JSON.stringify(roll)}`);
});

test('a screen left unused is taken as used after a moment, so the play goes on', () => {
  const s = scene(5), play = run(s, 'pickPop'), big = s.players[play.ids.big], screen = playSpot(s, big);
  at(s, big.id, screen.x, screen.z); big.setT = FOUL.setTime;
  for (let t = 0; t < PLAY.useBy + 0.2; t += DT) stepPlays(s, DT);
  assert.notEqual(play.usedAt, null);
  assert.ok(apart(playSpot(s, big), { x: RIM.x, z: 0 }) > 6, 'the big did not pop out');
});

test('a play ends when the ball is lost, at a whistle, at a shot, when time is short and when it has run its length', () => {
  const ends = {
    'the other team has the ball': s => giveBall(s, s.players[5]),
    'a whistle': s => { s.phase = 'dead'; },
    'the handler shoots': s => { s.players[0].shooting = true; },
    'the shot clock is short': s => { s.shotClock = AI.panicClock - 0.1; },
    'it has run its length': s => { s.plays[0].t = PLAYS.iso.long; },
  };
  for (const [what, change] of Object.entries(ends)) {
    const s = scene(5); run(s, 'iso');
    change(s); stepPlays(s, DT);
    assert.equal(s.plays[0], null, what);
    assert.equal(playSpot(s, s.players[1]), null, what);
  }
});

test('a play asked for waits until the team can run it, and takes the place of one already on', () => {
  const s = scene(5);
  at(s, 0, -3, 0);                                   // still in the back court
  assert.equal(callPlay(s, 0, 'horns'), true);
  stepPlays(s, DT);
  assert.equal(s.plays[0], null);
  at(s, 0, 5, 0); stepPlays(s, DT);
  assert.equal(playOn(s, 0).name, 'Horns');
  callPlay(s, 0, 'floppy'); stepPlays(s, DT);
  assert.deepEqual([playOn(s, 0).key, s.plays[0].t, s.playCall[0]], ['floppy', 0, null]);
  assert.equal(callPlay(s, 0, 'nothing'), false);
  assert.equal(callPlay(scene(3), 0, 'horns'), false, 'a five-a-side play in three a side');
});

test('the coach calls a play the match has, for either team, a moment after the last one ended, and not with the clock short or from the back court', () => {
  for (const size of [3, 5]) {
    const s = scene(size);
    s.playWait = [0, 0];
    stepPlays(s, DT);
    assert.equal(s.plays[0], null, 'he called a play before the offence was set');   // the shot clock has only just started
    s.shotClock = CLOCK.shot - PLAY.startAt;
    stepPlays(s, DT);
    assert.ok(playsFor(size).includes(s.plays[0].key));
    assert.equal(s.plays[1], null, 'the team without the ball has no play');
    s.plays[0].t = 99; stepPlays(s, DT);
    assert.deepEqual([s.plays[0], s.playWait[0] > PLAY.wait - 2 * DT], [null, true]);
    for (let t = 0; t < PLAY.wait + DT; t += DT) stepPlays(s, DT);
    assert.ok(s.plays[0], 'no play after the wait');
  }
  const late = scene(5); late.playWait = [0, 0]; late.shotClock = PLAY.minClock - 0.1; stepPlays(late, DT);
  const back = scene(5); back.playWait = [0, 0]; back.shotClock = CLOCK.shot - PLAY.startAt; at(back, 0, 0.5, 0); stepPlays(back, DT);
  assert.deepEqual([late.plays[0], back.plays[0]], [null, null]);
});

test('the computer runs the play: team-mates go to their parts, and the handler takes the ball where the play says', () => {
  const s = scene(5), play = run(s, 'iso');
  at(s, 5, 6.2, 0.4);   // the handler's defender is on him and in his way, so he neither shoots nor drives
  ai(s);
  for (const id of [1, 2, 3, 4]) {
    const spot = playSpot(s, s.players[id]);
    assert.ok(apart({ x: s.players[id].ai.targetX, z: s.players[id].ai.targetZ }, spot) < 0.01, `player ${id}`);
  }
  const handler = playSpot(s, s.players[0]);
  assert.ok(apart({ x: s.players[0].ai.targetX, z: s.players[0].ai.targetZ }, handler) < 0.01, 'the handler');
  assert.ok(handler.z * play.side > 0, 'the handler is not sent to the play\'s side');
});

test('a player who has stood his ground is a wall: whoever runs into him takes the whole push', () => {
  const s = createMatch(1, 5);
  s.phase = 'live'; s.playWait = [Infinity, Infinity];
  s.players.forEach((p, i) => at(s, p.id, -10 + i, 6));
  at(s, 1, 3, 0); s.players[1].setT = 1;
  at(s, 6, 2, 0);
  giveBall(s, s.players[0]);
  const intents = idle(10);
  intents[6] = { ...emptyIntent(), moveX: 1 };
  for (let i = 0; i < 30; i++) step(s, intents, DT);
  assert.ok(Math.abs(s.players[1].x - 3) < 1e-6 && Math.abs(s.players[1].z) < 1e-6, `the set player was moved to ${s.players[1].x}, ${s.players[1].z}`);
  assert.ok(s.players[6].x <= 3 - 2 * PLAYER.radius + 1e-6, 'the runner went through him');
});

test('until his play has formed the handler keeps the ball: no shot from outside and no pass, though he is open (not wide open) and so is a team-mate', async () => {
  const { playHolds } = await import('../src/sim/plays.js');
  const open = key => {
    const s = scene(5); run(s, key);
    at(s, 5, s.players[0].x - 2.1, s.players[0].z + 0.6);   // his defender a step off him, behind: he is open, in range, and settled
    at(s, 6, -5, -6);                     // nor near the wing
    s.players[0].ai.heldT = 1; s.players[0].ai.had = true;
    at(s, 7, 9, 0.2);                     // but the lane to the hoop is not clear
    return s;
  };
  const waiting = open('pickRoll');
  assert.equal(playHolds(waiting, waiting.players[0]), true);
  ai(waiting);
  assert.equal(waiting.players[0].ai.action, null, 'he shot or passed while the screen was coming');
  waiting.plays[0].usedAt = waiting.plays[0].t;   // the screen has been used
  assert.equal(playHolds(waiting, waiting.players[0]), false);
  waiting.players[0].ai.timer = 0; ai(waiting);
  assert.equal(waiting.players[0].ai.action, 'shoot');
  const stale = open('pickRoll');
  stale.plays[0].t = PLAY.ripeBy;                  // a play that never forms does not hold him for ever
  assert.equal(playHolds(stale, stale.players[0]), false);
  assert.equal(playHolds(stale, stale.players[1]), false, 'only the handler waits');
});

test('post up: once the play is ripe the big is fed on the block, though his defender is on him', async () => {
  const { playTarget } = await import('../src/sim/plays.js');
  const s = scene(5), play = run(s, 'postUp'), big = s.players[play.ids.big];
  const block = playSpot(s, big);
  at(s, big.id, block.x, block.z); at(s, 7, block.x + 0.9, block.z - 0.9);   // his defender behind him, between him and the hoop
  at(s, 0, 6.4, 2.4 * play.side); at(s, 5, 7.66, 1.92 * play.side);   // the handler in the slot, his defender between him and the hoop
  s.players[0].ai.heldT = 1; s.players[0].ai.had = true;
  assert.equal(playTarget(s, s.players[0]), big);
  assert.equal(ai(s)[0].pass, false, 'he passed before the play was ripe');
  play.t = PLAYS.postUp.ripe; s.players[0].ai.timer = 0;
  const thrown = ai(s)[0], d = apart(big, s.players[0]);
  assert.equal(thrown.pass, true);
  assert.ok(Math.abs(thrown.moveX - (big.x - s.players[0].x) / d) < 1e-6 && Math.abs(thrown.moveZ - (big.z - s.players[0].z) / d) < 1e-6, 'the pass is not to the big');
  giveBall(s, big);
  assert.equal(playTarget(s, big), null, 'the big with the ball is not told to pass to himself');
});

// ---------- the plays follow the ratings ----------

test('the parts go to the players the ratings pick: the best inside is the big, the best three-point shooter the shooter', async () => {
  const { substitute } = await import('../src/sim/roster.js');
  const s = scene(5);
  // By hand: the small forward (player 1) is made the best inside man, and the power forward (player 4) the best shooter.
  Object.assign(s.rosters[0][1].ratings, { inside: 99, rebound: 99 });
  Object.assign(s.rosters[0][4].ratings, { three: 99, inside: 40, rebound: 40 });
  const ids = run(s, 'pickRoll').ids;
  assert.deepEqual([ids.big, ids.shooter, ids.handler], [1, 4, 0]);
  const three = scene(3);
  Object.assign(three.rosters[0][1].ratings, { inside: 99, rebound: 99 });
  assert.deepEqual(run(three, 'pickRoll').ids, { handler: 0, big: 1, wing: 2 });
  // A substitute: the next play is cast for who is now on the floor.
  const sub = scene(5);
  assert.equal(run(sub, 'floppy').ids.shooter, 3);                 // Sam Okoro, the sharpshooter
  substitute(sub, 3, 7);                                            // Idris Kane, a centre, comes on for him
  sub.plays[0] = null;
  assert.deepEqual([run(sub, 'floppy').ids.shooter, sub.plays[0].ids.big2], [4, 3]);   // Kane is a big now, and Volkov, the stretch big, the shooter
});

test('the coach calls what suits the floor: a post-up for a post scorer, Floppy for a sharpshooter, a clear-out for the star or a hot hand', async () => {
  const { suits } = await import('../src/sim/plays.js');
  const calls = (change, key) => {
    let n = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const s = scene(5); s.seed = seed * 31; s.playWait = [0, 0]; s.shotClock = CLOCK.shot - PLAY.startAt;
      change(s); stepPlays(s, DT);
      if (s.plays[0].key === key) n++;
    }
    return n;
  };
  const big = inside => s => { for (const row of [1, 3, 4]) s.rosters[0][row].ratings.inside = 55; s.rosters[0][2].ratings.inside = inside; };   // the centre is the big either way
  assert.ok(calls(big(94), 'postUp') >= 3 * calls(big(60), 'postUp'), 'a post-up is called no more for a post scorer');
  const shooter = three => s => { s.rosters[0][3].ratings.three = three; s.rosters[0][1].ratings.three = 40; s.rosters[0][4].ratings.three = 40; };
  assert.ok(calls(shooter(95), 'floppy') >= 3 * calls(shooter(60), 'floppy'), 'Floppy is called no more for a sharpshooter');
  const star = scene(5), other = scene(5), hot = scene(5);
  giveBall(other, other.players[1]); giveBall(hot, hot.players[1]); hot.rosters[0][1].streak = 3;
  assert.deepEqual([suits(star, 0, 'iso'), suits(other, 0, 'iso'), suits(hot, 0, 'iso')], [3, 1, 3]);
  assert.equal(suits(star, 1, 'iso'), 1, 'the team without the ball');
});

test('the handler goes round the screener, not through him: his way to where he is sent never crosses the man setting the screen', () => {
  for (const key of ['pickRoll', 'pickPop', 'spain']) {
    const s = scene(5), play = run(s, key), big = s.players[play.ids.big], handler = s.players[0];
    const screen = playSpot(s, big);
    at(s, big.id, screen.x, screen.z); big.setT = FOUL.setTime;
    stepPlays(s, DT);
    assert.notEqual(play.setAt, null, `${key}: the screen was not set`);
    // He walks to where he is sent, a short step at a time, until the screen is used.
    let nearest = Infinity;
    for (let i = 0; i < 400 && play.usedAt === null; i++) {
      const to = playSpot(s, handler), far = apart(to, handler) || 1, pace = 0.05;
      // The straight line from him to his target, as far as he will get along it before he is told again.
      for (let t = 0; t <= 1; t += 0.25) nearest = Math.min(nearest, apart({ x: handler.x + (to.x - handler.x) * t * Math.min(1, 0.6 / far), z: handler.z + (to.z - handler.z) * t * Math.min(1, 0.6 / far) }, big));
      at(s, 0, handler.x + ((to.x - handler.x) / far) * pace, handler.z + ((to.z - handler.z) / far) * pace);
      play.t += DT; stepPlays(s, DT);
    }
    assert.notEqual(play.usedAt, null, `${key}: he never got round the screen`);
    assert.ok(nearest >= 2 * PLAYER.radius + 0.1, `${key}: his way passes ${nearest.toFixed(2)} m from the screener's middle`);
    assert.ok((handler.z - big.z) * play.side > 0.5, `${key}: he went round the wrong side`);
  }
});

// ---------- variety in the plays (after overhaul Stage 2) ----------

// A pick play with its screen set (the big put on his spot), on the play's side 1.
function setUp(key, variant = 'normal', size = 5) {
  const s = scene(size), play = run(s, key), big = s.players[play.ids.big];
  play.side = 1; play.variant = variant;
  const screen = playSpot(s, big);
  at(s, big.id, screen.x, screen.z); big.setT = FOUL.setTime;
  stepPlays(s, DT);
  assert.notEqual(play.setAt, null, `${key}: the screen was not set`);
  return { s, play, big };
}
const use = (s, play) => { play.usedAt = play.t; play.t += 0.01; };
const along = (s, spot) => spot.x;   // team 0 attacks +x: a spot's x is how far along the court it is

test('a pick play is taken four ways, as drawn: on to the rim, rejected, snaked back across the lane, or pulled up at the elbow; only a man who shoots from there pulls up', () => {
  const drawn = { normal: 0, reject: 0, snake: 0, pullup: 0 };
  for (let seed = 1; seed <= 80; seed++) {
    const s = scene(5); s.seed = seed * 7919;
    callPlay(s, 0, 'pickRoll'); stepPlays(s, DT);
    drawn[s.plays[0].variant]++;
  }
  assert.ok(Object.values(drawn).every(n => n >= 4) && drawn.normal > drawn.reject, JSON.stringify(drawn));
  let pulled = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const s = scene(5); s.seed = seed * 7919; personOf(s, s.players[0]).ratings.mid = 60;
    callPlay(s, 0, 'pickRoll'); stepPlays(s, DT);
    if (s.plays[0].variant === 'pullup') pulled++;
  }
  assert.equal(pulled, 0, 'a poor mid-range shooter pulled up');
  // Where each takes the ball once the screen is used.
  const after = (variant, wait = 0) => { const { s, play } = setUp('pickRoll', variant); use(s, play); play.t += wait; return playSpot(s, s.players[0]); };
  const rim = after('normal'), pull = after('pullup'), early = after('snake'), late = after('snake', PLAY.snake + 0.1);
  assert.ok(apart(rim, { x: RIM.x, z: 0 }) < AI.layupDist && rim.z > 0, `to the rim: ${JSON.stringify(rim)}`);
  assert.ok(apart(pull, { x: RIM.x, z: 0 }) > 3.5 && apart(pull, { x: RIM.x, z: 0 }) < 5.5 && pull.z > 0, `the pull-up is at the elbow: ${JSON.stringify(pull)}`);
  assert.ok(early.z > 0 && late.z < 0, `the snake goes round and then back across: ${JSON.stringify([early, late])}`);
});

test('the handler rejects the screen when that was drawn, or when his man has jumped over toward it as it is set: he goes the other way', () => {
  const drawn = setUp('pickRoll', 'reject');
  assert.equal(drawn.play.reject, true);
  assert.ok(playSpot(drawn.s, drawn.s.players[0]).z < 0, 'away from the screen');
  // Drawn to take it, but his man is over on the screen's side by PLAY.cheat as it is set.
  const s = scene(5), play = run(s, 'pickRoll'), big = s.players[play.ids.big], man = guardOf(s, s.players[0]);
  play.side = 1;
  at(s, man.id, man.x, s.players[0].z + PLAY.cheat + 0.2);
  const screen = playSpot(s, big); at(s, big.id, screen.x, screen.z); big.setT = FOUL.setTime;
  stepPlays(s, DT);
  assert.deepEqual([play.setAt !== null, play.reject], [true, true]);
  assert.ok(playSpot(s, s.players[0]).z < 0);
  use(s, play);
  assert.ok(playSpot(s, s.players[0]).z < 0, 'to the rim on the other side');
  // Played straight, he takes it.
  assert.equal(setUp('pickRoll').play.reject, false);
});

test('as the screen is used the corners move: the man on the ball\'s side lifts to the wing, a shooter on the other stays in his corner, and when the big pops a wing who is no shooter takes the dunker spot', () => {
  const roll = setUp('pickRoll'), shooter = roll.s.players[roll.play.ids.shooter], wing = roll.s.players[roll.play.ids.wing];
  const home = [playSpot(roll.s, shooter), playSpot(roll.s, wing)];
  assert.deepEqual(home.map(p => [p.x, p.z]), [[11.9, 7.06], [11.9, -7.06]], 'in the corners till the screen is used');
  use(roll.s, roll.play); roll.play.t += PLAY.relocate;
  personOf(roll.s, wing).ratings.three = ARC.threeAt + 5;
  const lifted = playSpot(roll.s, shooter), stays = playSpot(roll.s, wing);
  assert.ok(lifted.x < 10 && lifted.z > 5, `the ball-side corner lifts: ${JSON.stringify(lifted)}`);
  assert.deepEqual([stays.x, stays.z], [11.9, -7.06], 'a shooter on the far side stays in his corner');
  const pop = setUp('pickPop'), popWing = pop.s.players[pop.play.ids.wing];
  personOf(pop.s, popWing).ratings.three = ARC.threeAt - 10;
  use(pop.s, pop.play); pop.play.t += PLAY.relocate;
  const dunker = playSpot(pop.s, popWing);
  assert.ok(dunker.x > 12.5 && Math.abs(dunker.z) > VIOLATION.keyHalfWidth && Math.abs(dunker.z) < 3.5, `the dunker spot: ${JSON.stringify(dunker)}`);
  // Three a side: the wing on the far side, a shooter, drops to the corner.
  const three = setUp('pickRoll', 'normal', 3), w3 = three.s.players[three.play.ids.wing];
  personOf(three.s, w3).ratings.three = ARC.threeAt + 5;
  use(three.s, three.play); three.play.t += PLAY.relocate;
  assert.deepEqual([playSpot(three.s, w3).x, playSpot(three.s, w3).z], [11.9, -7.06]);
});

test('a play that does not turn on a pass is over PLAY.afterPass after the ball is passed on, and the offence is read from there; one that turns on a pass goes on', () => {
  for (const [key, goesOn] of [['pickRoll', false], ['iso', false], ['giveGo', true], ['dho', true]]) {
    const s = scene(5), play = run(s, key);
    giveBall(s, s.players[play.ids.shooter]); stepPlays(s, DT);
    assert.notEqual(play.passAt, null, key);
    for (let t = 0; t < PLAY.afterPass + 0.1; t += DT) stepPlays(s, DT);
    assert.equal(s.plays[0] !== null, goesOn, key);
  }
});

test('while his play is still forming the handler punishes help that has gone too far: a team-mate left wide open by READ.wide + PLAY.punish gets the ball, one open by less does not', () => {
  const forming = (seed, gap) => {
    const s = scene(5); s.seed = seed * 7919; s.frontcourt = true; s.shotClock = 18;
    run(s, 'pickRoll');
    at(s, 6, 7.5 + gap * 0.6, -5.5 + gap * 0.8);   // the wing's man has gone to help, toward the lane
    Object.assign(s.players[0].ai, { heldT: 2, had: true, timer: 0 });
    return s;
  };
  const toWing = intent => intent.pass && Math.abs(intent.moveX - (7.5 - 5.2) / Math.hypot(2.3, 6)) < 0.05;
  let open = 0, wide = 0;
  for (let seed = 1; seed <= 20; seed++) {
    if (toWing(aiIntents(forming(seed, READ.wide + 0.2), DT)[0])) open++;
    if (toWing(aiIntents(forming(seed, READ.wide + PLAY.punish + 0.9), DT)[0])) wide++;
  }
  assert.ok(open === 0 && wide >= 16, `open ${open}/20, wide open ${wide}/20`);
});

test('a handoff: the handler dribbles at the wing, who comes up for it and is given it; then the big screens the wing\'s man and rolls, and the handler spaces out', () => {
  for (const size of [3, 5]) {
    const s = scene(size), play = run(s, 'dho'), handler = s.players[0], big = s.players[play.ids.big], taker = s.players[play.ids[size === 5 ? 'shooter' : 'wing']];
    play.side = 1;
    const dribble = playSpot(s, handler), comes = playSpot(s, taker);
    assert.ok(dribble.z > 2 && dribble.x > 6, `he dribbles at the wing: ${JSON.stringify(dribble)}`);
    assert.ok(comes.x > 10 && comes.z > 5, `the wing first sinks low on the play's side: ${JSON.stringify(comes)}`);
    play.t = 1.2;
    at(s, 0, dribble.x, dribble.z); at(s, taker.id, playSpot(s, taker).x, playSpot(s, taker).z);
    assert.equal(playTarget(s, handler), taker, 'close enough: the handoff');
    giveBall(s, taker); stepPlays(s, DT);
    const screen = playSpot(s, big), man = guardOf(s, taker), out = playSpot(s, handler);
    assert.ok(Math.abs(apart(screen, man) - PLAY.screenGap) < 0.15, 'the big screens the wing\'s man');
    assert.equal(screenerOn(s, 0), big.id);
    assert.ok(out.x > 11 && out.z > 6, `the handler spaces to the corner: ${JSON.stringify(out)}`);
    use(s, play);
    assert.ok(apart(playSpot(s, big), { x: RIM.x, z: 0 }) < AI.layupDist, 'the big rolls');
  }
});

test('a flare screen: the big goes to the shooter\'s man, on his way out to the weak side; once it is set the shooter flares to the arc there and is looked for', () => {
  for (const size of [3, 5]) {
    const s = scene(size), play = run(s, 'flare'), big = s.players[play.ids.big], taker = s.players[play.ids[size === 5 ? 'shooter' : 'wing']];
    play.side = 1;
    const waits = playSpot(s, taker), screen = playSpot(s, big), man = guardOf(s, taker), to = { x: 7.4, z: -6.3 };
    assert.ok(waits.z < -2, `he starts on the weak side: ${JSON.stringify(waits)}`);
    assert.ok(Math.abs(apart(screen, man) - PLAY.screenGap) < 0.05 && apart(screen, to) < apart(man, to), 'the screen is by his man, on his way');
    assert.equal(playTarget(s, s.players[0]), null);
    at(s, big.id, screen.x, screen.z); big.setT = FOUL.setTime; stepPlays(s, DT);
    assert.notEqual(play.usedAt, null, 'set, and he goes');
    const flares = playSpot(s, taker);
    assert.deepEqual([flares.x, flares.z, flares.sprint], [7.4, -6.3, true]);
    at(s, taker.id, 7.4, -6.3);
    assert.equal(playTarget(s, s.players[0]), taker);
  }
  // A screen never set: the shooter goes after PLAY.flareBy anyway.
  const late = scene(5), play = run(late, 'flare');
  for (let t = 0; t < PLAY.flareBy + 0.1; t += DT) stepPlays(late, DT);
  assert.notEqual(play.usedAt, null);
});
