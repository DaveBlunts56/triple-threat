// Finishes at the rim: the layup and the dunk (spec: docs/superpowers/specs/2026-11-14-dunks-layups-design.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINISH, RIM, SHOT, BALL, DT, PLAYER } from '../src/sim/tuning.js';
import { finishFor, canDunk, closing, finishHand, takeoffSpot, gatherVelocity, jumpVelocity } from '../src/sim/finish.js';
import { personOf } from '../src/sim/state.js';
import { step } from '../src/sim/step.js';
import { trySteal, jumpOf, shotBest, shotLands, dunkChance, SHOT_BEST, SHOT_LANDS } from '../src/sim/players.js';
import { shotMeter } from '../src/render/meter.js';
import { live, at, only, firstSeed } from './helpers.js';

const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;
const rate = (s, id, key, value) => { personOf(s, s.players[id]).ratings[key] = value; };
// Player 0 (team 0, attacking the hoop at +RIM.x) `out` metres in front of the rim, `z` across, moving at it at `speed`.
function driving(out, speed, z = 0) {
  const s = live(); at(s, 0, RIM.x - out, z);
  const far = Math.hypot(out, z) || 1;
  s.players[0].vx = (speed * out) / far; s.players[0].vz = (-speed * z) / far;
  return s;
}
const speedOf = v => Math.hypot(v.vx, v.vz);

test('Space is a layup only driving at the rim from layup range', () => {
  const s = driving(3, 4);
  assert.equal(finishFor(s, s.players[0], 'shoot'), 'layup');
  for (const [out, speed] of [[3, 1.5], [3, -4], [1.0, 4], [5, 4]]) { const t = driving(out, speed); assert.equal(finishFor(t, t.players[0], 'shoot'), null, `${out} m at ${speed} m/s`); }
  assert.ok(near(closing(s.players[0], { x: RIM.x, z: 0 }), 4));
});

test('R is a dunk for a finisher with legs left, a layup for anyone else in range, and nothing out of it', () => {
  const s = driving(3, 4); rate(s, 0, 'inside', FINISH.dunkAt);
  assert.equal(canDunk(s, s.players[0]), true);
  assert.equal(finishFor(s, s.players[0], 'dunk'), 'dunk');
  assert.equal(finishFor(s, s.players[0], 'shoot'), 'layup');                 // Space never dunks
  rate(s, 0, 'inside', FINISH.dunkAt - 1); assert.equal(finishFor(s, s.players[0], 'dunk'), 'layup');
  rate(s, 0, 'inside', 90); personOf(s, s.players[0]).energy = FINISH.dunkEnergy - 0.05; assert.equal(finishFor(s, s.players[0], 'dunk'), 'layup');
  const far = driving(6, 4); rate(far, 0, 'inside', 90); assert.equal(finishFor(far, far.players[0], 'dunk'), null);
  const slow = driving(3, 1); rate(slow, 0, 'inside', 90); assert.equal(finishFor(slow, slow.players[0], 'dunk'), null);
});

test('behind the backboard, or past it, there is no finish', () => {
  const s = live(); at(s, 0, RIM.x + 0.9, 0.3); s.players[0].vx = -4; rate(s, 0, 'inside', 90);
  assert.equal(finishFor(s, s.players[0], 'shoot'), null);
  assert.equal(finishFor(s, s.players[0], 'dunk'), null);
  const beside = live(); at(beside, 0, RIM.x + 0.1, 2.5); beside.players[0].vz = -4;   // along the baseline, in front of the board's plane
  assert.equal(finishFor(beside, beside.players[0], 'shoot'), 'layup');
});

test('the hand is the one on his side of the rim; straight on, the right; and the mirror for the other team', () => {
  const s = live();
  at(s, 0, RIM.x - 3, 2); assert.equal(finishHand(s.players[0]), 'right');     // facing +x his right is +z
  at(s, 0, RIM.x - 3, -2); assert.equal(finishHand(s.players[0]), 'left');
  at(s, 0, RIM.x - 3, 0); assert.equal(finishHand(s.players[0]), 'right');
  at(s, 3, -RIM.x + 3, 2); assert.equal(finishHand(s.players[3]), 'left');     // team 1 faces -x: his right is -z
  at(s, 3, -RIM.x + 3, -2); assert.equal(finishHand(s.players[3]), 'right');
});

test('the gather carries him to the take-off spot in FINISH.gather, never faster than FINISH.gatherSpeed, and not at all from inside it', () => {
  const s = driving(3.2, 6), v = gatherVelocity(s.players[0], 'dunk');
  assert.ok(near(speedOf(v), (3.2 - FINISH.takeoff.dunk) / FINISH.gather) && v.vx > 0 && near(v.vz, 0));
  assert.ok(near(speedOf(gatherVelocity(driving(4.5, 6).players[0], 'layup')), FINISH.gatherSpeed));
  assert.deepEqual(gatherVelocity(driving(1.5, 6).players[0], 'dunk'), { vx: 0, vz: 0 });
  const spot = takeoffSpot(driving(3, 4, 1).players[0], 'layup');
  assert.ok(near(Math.hypot(spot.x - RIM.x, spot.z), FINISH.takeoff.layup) && spot.z > 0 && spot.x < RIM.x);
});

test('the jump carries him to FINISH.arrive in front of the rim at the finish\'s moment', () => {
  const dunk = driving(FINISH.takeoff.dunk, 0), t = FINISH.dunkMoment * 2 * FINISH.jump.dunk / BALL.gravity;
  const v = jumpVelocity(dunk.players[0], 'dunk');
  assert.ok(near(v.vx * t, FINISH.takeoff.dunk - FINISH.arrive.dunk) && near(v.vz, 0));
  const layup = driving(FINISH.takeoff.layup, 0), up = SHOT.bestAt * FINISH.jump.layup / BALL.gravity;
  assert.ok(near(jumpVelocity(layup.players[0], 'layup').vx * up, FINISH.takeoff.layup - FINISH.arrive.layup));
  assert.deepEqual(jumpVelocity(driving(0.3, 0).players[0], 'dunk'), { vx: 0, vz: 0 });   // nearer than he would arrive: straight up
});

// ---------- the press and the gather ----------

const hoop = { x: RIM.x, z: 0 }, farOf = p => Math.hypot(p.x - hoop.x, p.z - hoop.z);
const RUN = { moveX: 1, sprint: true };
// One step with the keys of `intent` for player 0, everybody else still.
const tick = (s, intent = {}) => step(s, only(0, intent), DT);
// Player 0 driving at `speed` from `out` metres with Inside `inside`, and the key `key` pressed on the first step.
function pressed(key, out = 3, speed = 4, inside = 70) {
  const s = driving(out, speed); rate(s, 0, 'inside', inside);
  tick(s, { ...RUN, [key]: true });
  return s;
}
// Steps until `done(player 0)`, holding `intent`; returns the steps taken (at most `most`).
function until(s, done, intent = {}, most = 240) { let n = 0; while (!done(s.players[0]) && n < most) { tick(s, intent); n++; } return n; }

test('Space at a drive begins a layup: two steps, 0.5 s on the floor, then he jumps', () => {
  const s = pressed('shoot'), p = s.players[0];
  assert.deepEqual([p.finish, p.shooting, p.shotKey], ['layup', true, 'shoot']);
  const steps = until(s, q => q.y > 0, { shoot: true });
  assert.ok(Math.abs(steps * DT - FINISH.gather) <= DT + 1e-9, `he left the floor after ${steps * DT} s`);
});

test('the dunk key begins a dunk for a finisher, a layup for anyone else, and nothing out of range', () => {
  assert.equal(pressed('dunk', 3.2, 6, 90).players[0].finish, 'dunk');
  assert.equal(pressed('dunk', 3.2, 6, 90).players[0].shotKey, 'dunk');
  assert.equal(pressed('dunk', 3, 4, 60).players[0].finish, 'layup');
  const out = pressed('dunk', 6, 4, 90).players[0];
  assert.deepEqual([out.finish, out.shooting], [null, false]);
});

test('through the gather he closes on the rim steadily and leaves the floor at the take-off spot', () => {
  const s = pressed('dunk', 3.2, 6, 90), p = s.players[0];
  let last = farOf(p), steps = 0;
  while (p.y === 0 && steps++ < 120) { tick(s); assert.ok(farOf(p) <= last + 1e-9, 'he went away from the rim'); if (p.y === 0) last = farOf(p); }
  assert.ok(p.y > 0, 'he never left the floor');
  assert.ok(Math.abs(last - FINISH.takeoff.dunk) < 0.1, `he took off ${last} m out`);
});

test('standing near the rim Space is still the jump shot, with its own gather', () => {
  const s = driving(3, 0); tick(s, { shoot: true });
  const p = s.players[0];
  assert.deepEqual([p.finish, p.shooting], [null, true]);
  const steps = until(s, q => q.y > 0, { shoot: true });
  assert.ok(Math.abs(steps * DT - SHOT.gather) <= DT + 1e-9);
});

test('the two steps are not a travel', () => {
  const s = pressed('shoot', 4.4, 6);
  for (let i = 0; i < 60; i++) { tick(s, { shoot: i < 40 }); assert.notEqual(s.call?.kind, 'travel'); }
});

test('a pass out of the gather ends the finish', () => {
  const s = pressed('shoot'); tick(s); tick(s);
  tick(s, { pass: true, moveZ: 1 });
  const p = s.players[0];
  assert.deepEqual([p.finish, p.shooting, s.ball.holder], [null, false, null]);
});

test('a finish cut short leaves nothing behind: a steal, and a whistle', () => {
  const stolen = firstSeed(seed => {
    const s = driving(3, 4); s.seed = seed; tick(s, { ...RUN, shoot: true }); tick(s);
    at(s, 3, s.players[0].x + 0.6, 0);
    return s;
  }, s => trySteal(s, s.players[3])?.won);
  assert.deepEqual([stolen.players[0].finish, stolen.players[0].shooting, stolen.ball.holder], [null, false, 3]);
  for (let i = 0; i < 90; i++) tick(stolen);
  assert.equal(stolen.shot, null, 'something was released afterwards');

  const whistled = pressed('dunk', 3.2, 6, 90); tick(whistled);
  whistled.shotClock = DT / 2;                       // the shot clock runs out during the gather
  for (let i = 0; i < 90; i++) tick(whistled);
  assert.deepEqual([whistled.players[0].finish, whistled.players[0].shooting, whistled.shot], [null, false, null]);
});

test('a reach during the gather wins about half as often as on a dribbler: the ball is in two hands', () => {
  const wins = gather => {
    let n = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const s = driving(3, 4); s.seed = seed;
      if (gather) { tick(s, { ...RUN, shoot: true }); tick(s); } else { tick(s, RUN); tick(s, RUN); }
      at(s, 3, s.players[0].x + 0.6, 0); s.players[3].facing = Math.PI;
      if (trySteal(s, s.players[3])?.won) n++;
    }
    return n;
  };
  const dribbling = wins(false), gathering = wins(true);
  assert.ok(dribbling > 40, `${dribbling} of 600 off the dribble`);
  assert.ok(gathering / dribbling > 0.3 && gathering / dribbling < 0.7, `${gathering} against ${dribbling}`);
});

// ---------- the jump, the layup's release, the dunk ----------

const hang = finish => 2 * FINISH.jump[finish] / BALL.gravity;
// Holds `intent` until player 0 is in the air and `shotT` has reached `t`.
const airUntil = (s, t, intent) => until(s, p => p.y > 0 && p.shotT >= t - DT / 2, intent);
const scored = (s, seconds = 1.6) => { for (let i = 0; i < seconds / DT; i++) tick(s); return s.score[0]; };

test('a layup jumps higher than a shot and is carried to the rim: 0.9 m from it at the best moment', () => {
  const s = pressed('shoot', 3, 5), p = s.players[0];
  until(s, q => q.y > 0, { shoot: true });
  assert.deepEqual([p.takeoff, jumpOf(p)], [FINISH.jump.layup, FINISH.jump.layup]);
  assert.ok(near(shotBest(p), FINISH.gather + SHOT.bestAt * FINISH.jump.layup / BALL.gravity) && near(shotLands(p), FINISH.gather + hang('layup')));
  airUntil(s, shotBest(p), { shoot: true });
  assert.ok(Math.abs(farOf(p) - FINISH.arrive.layup) < 0.12, `${farOf(p)} m from the rim at the best moment`);
  const plain = live().players[0];
  assert.deepEqual([shotBest(plain), shotLands(plain)], [SHOT_BEST, SHOT_LANDS]);   // the jump shot's are as they were
});

test('a layup let go at the best moment is green and scores, and is remembered as a layup', () => {
  const s = pressed('shoot', 3, 5), p = s.players[0];
  airUntil(s, shotBest(p), { shoot: true });
  tick(s);                                             // the key comes up
  assert.deepEqual([s.shot.green, s.shot.blocked, p.finish, p.shooting], [true, false, null, false]);
  assert.equal(scored(s), 2);
  assert.equal(s.last.score.finish, 'layup');
});

test('a layup still held as he starts down is let go then: no travel', () => {
  const s = pressed('shoot', 3, 5), p = s.players[0];
  until(s, () => s.shot !== null, { shoot: true });
  assert.ok(p.y > 0 && p.vy < 0 && p.vy > -0.5, `released at vy ${p.vy}`);
  for (let i = 0; i < 60; i++) { tick(s, { shoot: true }); assert.notEqual(s.call?.kind, 'travel'); }
});

test('a tapped layup goes up at the best moment and is never green; unguarded it goes in most of the time', () => {
  const s = pressed('shoot', 3, 5), p = s.players[0], best = FINISH.gather + SHOT.bestAt * FINISH.jump.layup / BALL.gravity;
  until(s, () => s.shot !== null);                     // no key held
  assert.ok(Math.abs(s.shot.t - best) <= DT, `released ${s.shot.t - best} s from the best moment`);
  assert.equal(s.shot.green, false);
  let made = 0;
  for (let seed = 1; seed <= 300; seed++) { const t = driving(3, 5); t.seed = seed; tick(t, { ...RUN, shoot: true }); if (scored(t) === 2) made++; }
  assert.ok(made > 180 && made < 285, `${made} of 300 tapped layups went in`);
});

test('a layup can be blocked like any shot', () => {
  const blocked = firstSeed(seed => {
    const s = driving(3, 5); s.seed = seed; tick(s, { ...RUN, shoot: true });
    const p = s.players[0];
    airUntil(s, shotBest(p) - DT, { shoot: true });
    Object.assign(s.players[3], { x: p.x + 0.5, z: p.z, y: 0.6, vy: 1 });   // a defender up in front of him
    tick(s);
    return s;
  }, s => s.shot?.blocked, 80);
  assert.equal(blocked.last.block.on, 0);
});

test('a dunk: a full jump, the ball down through the rim at 0.69 of it, two points, nothing to time', () => {
  const s = pressed('dunk', 3.2, 6, 90), p = s.players[0];
  until(s, q => q.y > 0);
  assert.equal(p.takeoff, FINISH.jump.dunk);
  const steps = until(s, () => s.ball.holder === null);
  assert.ok(Math.abs(p.jumpT - FINISH.dunkMoment * hang('dunk')) <= DT + 1e-9, `the ball left ${p.jumpT} s into a ${hang('dunk')} s jump (${steps} steps)`);
  assert.ok(farOf(p) < FINISH.reach && Math.abs(s.ball.x - RIM.x) < 1e-9 && s.ball.y > RIM.height, 'the ball is not at the rim');
  assert.deepEqual([s.shot.green, s.shot.finish, p.finish, p.shooting], [false, 'dunk', null, false]);
  assert.equal(scored(s), 2);
  assert.equal(s.last.score.finish, 'dunk');
  const line = personOf(s, p).stats;
  assert.deepEqual([line.fga, line.fgm, line.pts], [1, 1, 2]);
});

test('a dunk is the same whether the key is tapped or held, and the same match twice', () => {
  const play = hold => { const s = pressed('dunk', 3.2, 6, 90); for (let i = 0; i < 120; i++) tick(s, hold ? { dunk: true } : {}); const { prev, letGo, ...rest } = s.players[0]; return JSON.stringify([rest, s.ball, s.score]); };   // all but what the key itself was doing
  assert.equal(play(true), play(false));
  assert.equal(play(false), play(false));
});

const dunksMade = (n, change = () => {}) => {
  let made = 0;
  for (let seed = 1; seed <= n; seed++) { const s = driving(3.2, 6); s.seed = seed; rate(s, 0, 'inside', 90); change(s); tick(s, { ...RUN, dunk: true }); if (scored(s) === 2) made++; }
  return made / n;
};

test('an open dunk goes down 97 times in 100, whatever the level; with a defender on him, about three in four', () => {
  const open = dunksMade(300), legend = dunksMade(300, s => { s.difficulty = 'legend'; });
  assert.ok(open > 0.94 && open < 0.995, `${open} open`);
  assert.ok(legend > 0.94, `${legend} on Legend`);
  const guarded = dunksMade(300, s => at(s, 3, RIM.x - 0.35, 0.7));    // a defender standing beside the rim
  assert.ok(guarded > 0.6 && guarded < 0.9, `${guarded} guarded`);
  assert.ok(near(dunkChance(live(), live().players[0]), FINISH.dunkChance, 0.02));
});

test('a dunk can be blocked, and contact on it is reported for the rules to judge', () => {
  const setUp = seed => {
    const s = driving(3.2, 6); s.seed = seed; rate(s, 0, 'inside', 90); tick(s, { ...RUN, dunk: true });
    const p = s.players[0];
    until(s, q => q.y > 0 && q.jumpT >= FINISH.dunkMoment * hang('dunk') - 1.5 * DT);
    Object.assign(s.players[3], { x: p.x + 0.4, z: p.z + 0.3, y: 0.6, vy: 1 });
    return s;
  };
  const blocked = firstSeed(seed => { const s = setUp(seed); tick(s); return s; }, s => s.shot?.blocked, 80);
  assert.deepEqual([blocked.last.block.on, blocked.score[0]], [0, 0]);
  const s = setUp(1), events = tick(s);
  assert.deepEqual([events.release?.shooter, events.release?.defender], [0, 3]);
});

test('kept from the rim by a defender in his way, he lays it up from where he is: no ball appears at the rim', () => {
  const s = driving(3.2, 6); rate(s, 0, 'inside', 90);
  at(s, 3, RIM.x - 1.2, 0);                             // standing on his path
  tick(s, { ...RUN, dunk: true });
  const p = s.players[0];
  until(s, () => s.ball.holder === null);
  assert.ok(farOf(p) > FINISH.reach, `he got to ${farOf(p)} m`);
  assert.ok(near(s.ball.y, p.y + PLAYER.releaseHeight, 0.3) && Math.hypot(s.ball.x - RIM.x, s.ball.z) >= SHOT.minRelease - 1e-9, 'the ball was put at the rim');
  assert.equal(s.ball.info?.finish, 'layup');
});

test('the shot meter shows for a layup and not for a dunk', () => {
  const layup = pressed('shoot', 3, 5); tick(layup, { shoot: true });
  assert.notEqual(shotMeter(layup), null);
  const dunk = pressed('dunk', 3.2, 6, 90); tick(dunk);
  assert.equal(shotMeter(dunk), null);
  until(dunk, () => dunk.ball.holder === null);
  assert.equal(shotMeter(dunk), null, 'a dunk has no verdict to show');
});
