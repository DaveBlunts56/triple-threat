import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, emptyIntent } from '../src/sim/state.js';
import { giveBall } from '../src/sim/players.js';
import { step } from '../src/sim/step.js';
import { PLAYS, playsFor, callPlay, stepPlays, playSpot, playOn } from '../src/sim/plays.js';
import { keyContains } from '../src/sim/violations.js';
import { guardOf } from '../src/sim/matchups.js';
import { AI, CLOCK, COURT, DT, FOUL, PLAY, PLAYER, RIM, VIOLATION } from '../src/sim/tuning.js';
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
const run = (s, key) => { assert.equal(callPlay(s, 0, key), true); stepPlays(s, DT); assert.equal(playOn(s, 0)?.key, key, `${key} did not start`); return s.plays[0]; };

test('each size of match has its plays, and every play has a name and a line for the player', () => {
  assert.deepEqual(playsFor(3), ['pickRoll', 'pickPop', 'iso', 'postUp', 'giveGo']);
  assert.deepEqual(playsFor(5), ['pickRoll', 'pickPop', 'iso', 'horns', 'fiveOut', 'postUp', 'floppy', 'spain', 'giveGo', 'ucla']);
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
        // The plays that turn on a pass: the ball goes to the wing on the play's side.
        if (['giveGo', 'ucla'].includes(key) && s.ball.holder === 0) { giveBall(s, s.players[play.ids.shooter ?? play.ids.wing]); stepPlays(s, 0); }
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
      const free = spots.filter(e => e.p.id !== play.ids[PLAYS[key].screener] && !(key === 'spain' && e.p.id === play.ids.shooter));
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
  assert.ok((round.z - screen.z) * play.side > 0.3 && round.x > screen.x + 1, `the handler is sent to ${JSON.stringify(round)}`);
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

test('until his play has formed the handler keeps the ball: no shot from outside and no pass, though he is open and so is a team-mate', async () => {
  const { playHolds } = await import('../src/sim/plays.js');
  const open = key => {
    const s = scene(5); run(s, key);
    at(s, 5, 0, 6);                       // nobody near the handler: he is open, in range, and settled
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
