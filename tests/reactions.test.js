// Overhaul Stage 3: the players' reactions and the team's moments between plays. The motions are made by hand
// (tools/blender/poses.py); who reacts and how is broadcast/reactions.js; the moments the players walk to are
// sim/together.js; what each shows is render/motion.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMatch, emptyIntent, personOf } from '../src/sim/state.js';
import { giveBall } from '../src/sim/players.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { callTimeout } from '../src/sim/rules.js';
import { newFreeThrow, setupFreeThrow } from '../src/sim/freethrow.js';
import { knockDown, anyoneDown, helpSpot, meetSpot, freeThrowFive, huddleSpot } from '../src/sim/together.js';
import { CLOCK, DOWN, DT, FT, HUDDLE, MEET } from '../src/sim/tuning.js';
import { REACTION_CLIPS, armMotion, drawnFacing, easedShares, floorMotion, newMarks, wholeBody } from '../src/render/motion.js';
import { benchSeats } from '../src/render/sideline.js';
import { BENCH, PALETTE, PROP, dressBench } from '../src/render/crowd.js';
import { KIT } from '../src/render/kit.js';
import { faceWants } from '../src/render/face.js';
import { REACT, SHOWN, CELEBRATIONS, celebrationOf, createReactions, react } from '../src/broadcast/reactions.js';
import { live, at, idle, only, run } from './helpers.js';

const facts = JSON.parse(readFileSync('assets/motion.json', 'utf8'));
const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const made = (team, row, more = {}) => ({ kind: 'made', moment: false, team, row, points: 2, finish: null, ...more });
const moment = (kind, team, row) => ({ kind, moment: true, team, row });
// A match of five a side in live play, everyone spread out, the scorer `by` (team 0) having just scored.
function scored(by = 1, more = {}) {
  const s = live(1, 5); s.humans = [];
  s.players.forEach((p, i) => at(s, p.id, p.team === 0 ? 4 + (i % 5) * 1.5 : -4 - (i % 5) * 1.5, (i % 5) * 1.5 - 3));
  s.last.score = { team: 0, by, row: s.players[by].person, points: 2, at: s.time, assist: null, finish: null, ...more };
  return s;
}
const traits = (s, id, t) => { personOf(s, s.players[id]).traits = { composure: 0.5, swagger: 0.5, clutch: 0.5, fire: 0.3, showman: 0.3, leader: 0.3, ...t }; };

// ---------- the motions ----------

test('every reaction is in the motion file, made by hand, as long as the broadcast shows it; the fall, the floor, the help and the huddle are of the whole body', () => {
  const whole = ['fall', 'down', 'getUp', 'helpUp', 'huddle'];
  for (const name of [...REACTION_CLIPS, 'dejected']) {
    const clip = facts.clips[name];
    assert.ok(clip && clip.from === 'hand' && clip.duration > 0, name);
    assert.equal(wholeBody(facts.clips, name), whole.includes(name), name);
    if (SHOWN[name] && !clip.loop) assert.ok(Math.abs(SHOWN[name] - clip.duration) < 0.02, `${name} is shown ${SHOWN[name]} s, its motion lasts ${clip.duration} s`);
  }
  assert.equal(facts.clips.highFiveLeft.duration, facts.clips.highFive.duration, 'the left hand\'s is the right\'s in a mirror');
});

// ---------- who celebrates, and how ----------

test('a celebration fits the man and the basket: arms up for a clincher, the flex for a showman\'s dunk, the goggles for his three; a quiet man\'s ordinary three gets none', () => {
  const quiet = { showman: 0.2, fire: 0.2 }, showman = { showman: 0.8, fire: 0.3 }, fiery = { showman: 0.2, fire: 0.8 };
  assert.equal(celebrationOf(quiet, ['winner'], 2, null), 'armsUp');
  assert.equal(celebrationOf(fiery, ['clutch'], 2, null), 'chestThump');
  assert.equal(celebrationOf(showman, [], 2, 'dunk'), 'flex');
  assert.equal(celebrationOf(fiery, [], 2, 'dunk'), 'chestThump');
  assert.equal(celebrationOf(quiet, [], 2, 'dunk'), 'fistPump');
  assert.equal(celebrationOf(showman, [], 3, null), 'goggles');
  assert.equal(celebrationOf(fiery, [], 3, null), 'fistPump');
  assert.equal(celebrationOf(quiet, [], 3, null), null, 'he jogs back');
  assert.equal(celebrationOf(quiet, ['deep'], 3, null), 'fistPump', 'a moment is celebrated by anyone');
  assert.equal(celebrationOf(showman, [], 2, null), null, 'an ordinary two is not a big play');
});

test('after a big basket the scorer celebrates, the man he scored on drops his head (his hands on it after a poster), and a leader claps; an ordinary basket gets none of it', () => {
  const s = scored(1, { finish: 'dunk' }), r = createReactions();
  traits(s, 1, { showman: 0.9 }); traits(s, 3, { leader: 0.9 });
  const out = react(r, [moment('poster', 0, s.players[1].person), made(0, s.players[1].person, { finish: 'dunk' })], s, 10);
  const beaten = s.players.find(o => o.man === 1);
  assert.deepEqual([out[1]?.clip, out[beaten.id]?.clip, out[3]?.clip], ['flex', 'headHands', 'clap']);
  // A plain two: nothing.
  const quiet = scored(2), plain = react(createReactions(), [made(0, quiet.players[2].person)], quiet, 10);
  assert.deepEqual(plain, {});
  // Each lasts as long as it is shown, then is over.
  assert.equal(react(r, [], s, 10 + SHOWN.flex + 0.01)[1], undefined);
});

test('an ordinary three is celebrated by a showman only once in REACT.again seconds; a moment always is', () => {
  const s = scored(1, { points: 3 }), r = createReactions(), row = s.players[1].person;
  traits(s, 1, { showman: 0.9 });
  assert.equal(react(r, [made(0, row, { points: 3 })], s, 10)[1]?.clip, 'goggles');
  assert.equal(react(r, [made(0, row, { points: 3 })], s, 20)[1], undefined, 'another, ten seconds on: none');
  assert.equal(react(r, [moment('deep', 0, row), made(0, row, { points: 3 })], s, 21)[1]?.clip, 'goggles', 'a moment');
  assert.equal(react(r, [made(0, row, { points: 3 })], s, 21 + REACT.again)[1]?.clip, 'goggles', 'and again once the time is up');
});

test('a blocker celebrates; a player who boils over puts his hands on his head; a fiery man called for a foul argues it, a calm one does not', () => {
  const s = scored(1), r = createReactions();
  traits(s, 6, { fire: 0.9 }); traits(s, 7, { fire: 0.1 });
  const out = react(r, [moment('block', 1, s.players[6].person), { kind: 'rattled', moment: false, team: 1, row: s.players[8].person }], s, 5);
  assert.deepEqual([out[6]?.clip, out[8]?.clip], ['chestThump', 'headHands']);
  s.last.foul = { by: 6, kind: 'reach', at: s.time };
  assert.equal(react(createReactions(), [{ kind: 'foul', moment: false, team: 1 }], s, 5)[6]?.clip, 'complain');
  s.last.foul = { by: 7, kind: 'reach', at: s.time };
  assert.equal(react(createReactions(), [{ kind: 'foul', moment: false, team: 1 }], s, 5)[7], undefined);
});

test('the scorer and the man who passed to him slap hands once they are within REACT.reach, each with the hand on the other\'s side, and not after REACT.meet', () => {
  const s = scored(1, { assist: 2 }), r = createReactions(), a = s.players[2], b = s.players[1];
  a.facing = 0; b.facing = 0;   // both facing +x
  at(s, 2, b.x, b.z + 3);
  assert.deepEqual(react(r, [made(0, b.person)], s, 10), {});
  at(s, 2, b.x, b.z + REACT.reach - 0.1);   // the passer is now on the scorer's right (+z of a man facing +x)
  const out = react(r, [], s, 10.5);
  assert.deepEqual([out[2]?.clip, out[1]?.clip], ['highFiveLeft', 'highFive']);
  // Too late, they do not.
  const late = scored(1, { assist: 2 }), r2 = createReactions();
  react(r2, [made(0, late.players[1].person)], late, 10);
  at(late, 2, late.players[1].x, late.players[1].z + 0.5);
  assert.deepEqual(react(r2, [], late, 10 + REACT.meet + 0.1), {});
});

test('a celebration shouts in the face; a dropped head or hands on it look dejected', () => {
  const p = { id: 1, shooting: false, finish: null, fading: false, move: null, stealCooldown: 0 };
  for (const clip of CELEBRATIONS) assert.equal(faceWants(p, { show: { react: { 1: { clip, t: 0 } } } }).shout, true, clip);
  for (const clip of ['dejected', 'headHands']) assert.equal(faceWants(p, { show: { react: { 1: { clip, t: 0 } } } }).dejected, true, clip);
});

test('a reaction is played on the arms, off the ball: a one-off as far through as it has run, a loop at its pace', () => {
  const s = scored(1), marks = newMarks();
  marks.show = { react: { 1: { clip: 'goggles', t: 0.65 }, 3: { clip: 'clap', t: 0.2 }, 0: { clip: 'fistPump', t: 0.1 } } };
  assert.deepEqual(armMotion(s.players[1], s, marks, facts), { clip: 'goggles', at: 0.65 / facts.clips.goggles.duration });
  assert.deepEqual(armMotion(s.players[3], s, marks, facts), { clip: 'clap', rate: 1 });
  giveBall(s, s.players[0]);
  assert.notEqual(armMotion(s.players[0], s, marks, facts)?.clip, 'fistPump', 'the man with the ball gets on with it');
});

// ---------- down on the floor ----------

test('a man who takes a charge goes down and stays there; the nearest team-mate comes to help him up; play waits for him', () => {
  // As the fouls tests run into a set defender: the first seed on which it is called a charge.
  const charging = seed => {
    const st = live(seed); st.humans = [];
    at(st, 0, 2, 0); at(st, 3, 3.5, 0); at(st, 4, 6, 2); at(st, 5, 9, -2);
    st.players[0].vx = 5.95; st.players[3].setT = 0.5;
    for (let i = 0; i < 60 && !st.call; i++) step(st, only(0, { moveX: 1, sprint: true }), DT);
    return st;
  };
  let s = null;
  for (let seed = 1; seed <= 40 && !s; seed++) { const st = charging(seed); if (st.call?.kind === 'charge') s = st; }
  assert.ok(s, 'a charge was called');
  const down = s.players[3];
  assert.ok(down.downT > 0 && s.down.id === 3 && s.down.helper === 4, JSON.stringify(s.down));
  const where = { x: down.x, z: down.z };
  // He does not move whatever he is told; the play does not restart until he is up, CLOCK.dead or not.
  for (let t = 0; t < DOWN.time - 0.2; t += DT) { const all = aiIntents(s, DT); all[3] = { ...emptyIntent(), moveX: 1, sprint: true }; step(s, all, DT); }
  assert.ok(apart(down, where) < 0.01 && anyoneDown(s) && s.phase === 'dead', `${apart(down, where)} m, ${s.phase}`);
  assert.ok(apart(s.players[4], helpSpot(s, s.players[4])) < 0.5, 'his team-mate stands by him');
  run(s, 1, st => aiIntents(st, DT), st => st.phase !== 'dead');
  assert.deepEqual([down.downT, s.down, s.phase], [0, null, 'inbound']);
});

test('down, he falls, sits, and gets up; the man helping him reaches down a moment before he rises and pulls him up with him, facing him', () => {
  const s = live(1); s.humans = [];
  const down = s.players[3]; down.facing = 0;
  knockDown(s, down);
  at(s, s.down.helper, down.x + DOWN.help, down.z);
  const helper = s.players[s.down.helper], marks = newMarks();
  const shown = t => { down.downT = DOWN.time - t; return [floorMotion(down, s), floorMotion(helper, s)]; };
  const [falling, none] = shown(0.35);
  assert.ok(falling.clip === 'fall' && Math.abs(falling.at - 0.5) < 1e-9 && none === null);
  assert.deepEqual(shown(1.5), [{ clip: 'down', rate: 1 }, null]);
  const [rising, helping] = shown(DOWN.time - DOWN.rise * 0.5);
  assert.deepEqual([rising.clip, helping.clip], ['getUp', 'helpUp']);
  assert.ok(Math.abs(rising.at - 0.5) < 1e-9 && helping.at > rising.at * 0.6, JSON.stringify([rising, helping]));
  assert.ok(Math.abs(drawnFacing(s, helper, marks) - Math.PI) < 1e-6, 'he faces the man he helps');
  assert.deepEqual(armMotion(down, s, marks, facts), rising);
});

test('a man fouled finishing at the rim sometimes goes down as he lands', () => {
  const s = live(1); s.humans = [];
  Object.assign(s.players[0], { y: 0.6, vy: -1, fallOnLanding: true });
  run(s, 1, idle(), st => st.players[0].downT > 0);
  assert.ok(s.players[0].downT > 0 && s.players[0].y === 0);
});

// ---------- the free throw ----------

test('after a made free throw with another to come, a team-mate walks in from the lane to the shooter\'s side, slaps his hand and goes back to his exact place before the next is handed over', () => {
  const s = live(1, 5); s.humans = [];
  s.freeThrow = newFreeThrow(0, 2); setupFreeThrow(s);
  const shooter = s.players[0], plan = freeThrowFive(s, shooter);
  assert.ok(plan && s.players[plan.by].team === 0 && plan.by !== 0);
  const mate = s.players[plan.by], home = { x: mate.x, z: mate.z };
  assert.ok(Math.abs(apart(plan.to, shooter) - FT.fiveSide) < 1e-9);
  Object.assign(s.freeThrow, { stage: 'pause', t: 0, left: 1, five: plan });
  s.ball.holder = null;
  let closest = Infinity, others = s.players.filter(p => p !== mate).map(p => [p.x, p.z]);
  for (let t = 0; t < FT.fiveMost + 1 && s.freeThrow.stage === 'pause'; t += DT) { step(s, aiIntents(s, DT), DT); closest = Math.min(closest, apart(mate, shooter)); }
  assert.ok(closest <= FT.fiveSide + 0.4, `he came within ${closest.toFixed(2)} m`);
  assert.deepEqual([mate.x, mate.z], [home.x, home.z], 'back in his exact place');
  assert.deepEqual(s.players.filter(p => p !== mate).map(p => [p.x, p.z]), others, 'nobody else moved');
  assert.deepEqual([s.freeThrow.stage, s.ball.holder], ['aim', 0]);
});

test('the shooter is slapped by the team-mate in the free throw\'s plan, not by the man a person controls', () => {
  const s = live(1, 5); s.humans = [0];
  s.freeThrow = newFreeThrow(0, 2); setupFreeThrow(s);
  const nearest = s.players.filter(p => p.team === 0 && p.id !== 0).reduce((a, b) => (apart(b, s.players[0]) < apart(a, s.players[0]) ? b : a));
  s.controlled = nearest.id;
  assert.notEqual(freeThrowFive(s, s.players[0]).by, nearest.id);
});

// ---------- the passer and the scorer ----------

test('after an assisted basket the passer runs to the scorer while the ball is dead, for at most MEET.time seconds', () => {
  const s = scored(1);
  s.last.score.assist = s.players[2].person;
  s.phase = 'dead'; s.phaseT = CLOCK.dead;
  at(s, 2, s.players[1].x - 4, s.players[1].z);
  const spot = meetSpot(s, s.players[2]);
  assert.ok(spot && apart(spot, s.players[1]) < 0.5);
  s.players[2].ai.timer = 0; aiIntents(s, DT);
  assert.ok(apart({ x: s.players[2].ai.targetX, z: s.players[2].ai.targetZ }, s.players[1]) < 0.5 && s.players[2].ai.sprint);
  s.time += MEET.time + 0.1;
  assert.equal(meetSpot(s, s.players[2]), null);
});

// ---------- the huddle ----------

test('at a timeout each team huddles round a middle of its own, facing it, and everyone goes back in its last seconds', () => {
  const s = live(1, 5); s.humans = [];
  s.players.forEach((p, i) => at(s, p.id, p.team === 0 ? 2 + (i % 5) * 1.8 : -2 - (i % 5) * 1.8, (i % 5) * 2 - 4));
  giveBall(s, s.players[0]);
  assert.ok(callTimeout(s, 0));
  assert.ok(Math.abs(s.phaseT - (CLOCK.timeout + HUDDLE.extra)) < 1e-9);
  const [a, b] = s.huddle.centres;
  assert.ok(apart(a, b) >= 3, 'the two huddles are apart');
  run(s, CLOCK.timeout + HUDDLE.extra - HUDDLE.back - 0.3, st => aiIntents(st, DT));
  const marks = newMarks();
  const placed = s.players.filter(p => { const spot = huddleSpot(s, p); return spot && apart(p, spot) < 0.5; });
  assert.ok(placed.length >= 9, `${placed.length} of 10 in their places`);
  for (const p of placed) {
    const c = s.huddle.centres[p.team], face = drawnFacing(s, p, marks);
    assert.ok(Math.abs(Math.atan2(Math.sin(face - Math.atan2(c.z - p.z, c.x - p.x)), Math.cos(face - Math.atan2(c.z - p.z, c.x - p.x)))) < 1e-6);
    assert.deepEqual(armMotion(p, s, marks, facts), { clip: 'huddle', rate: 1 });
  }
  run(s, 0.4, st => aiIntents(st, DT));
  assert.equal(huddleSpot(s, s.players[1]), null, 'in its last seconds everyone goes back');
  run(s, HUDDLE.back + 0.5, st => aiIntents(st, DT), st => st.phase !== 'dead');
  assert.deepEqual([s.phase, s.huddle], ['inbound', null]);
});

// ---------- the benches ----------

test('the players on the benches are their teams\' fans: five a side in its kit, the home team\'s on the home side, some with a towel', () => {
  const seats = benchSeats([3, 7]);
  assert.deepEqual([seats.length, seats.filter(b => b.team === 3).length, seats.filter(b => b.team === 7).length], [10, 5, 5]);
  assert.ok(seats.every(b => b.y > 0.3 && b.z < -8 && Math.sign(b.x) === (b.team === 3 ? -1 : 1)), 'on the chairs of the far side, the first team on the left');
  const dressed = seats.map((seat, i) => dressBench(seat, i, 7));
  for (const f of dressed) {
    assert.equal(f.shirt, PALETTE.indexOf(KIT.team[f.team]), 'his team\'s colour');
    assert.deepEqual([f.pants, f.upper, f.side, f.width], [f.shirt, f.skin, f.team === 7 ? 0 : 1, BENCH.width]);
  }
  assert.ok(dressed.some(f => f.prop === PROP.towel) && dressed.some(f => f.prop === PROP.none), 'some wave a towel, some do not');
});

// ---------- the blend ----------

test('the blend shows each motion\'s share eased: still none and all at the ends, one whole pose between, coming in at half its even rate', () => {
  assert.deepEqual(easedShares({ idle: 1, run: 0 }), { idle: 1, run: 0 });
  const mid = easedShares({ idle: 0.7, run: 0.3 });
  assert.ok(Math.abs(mid.idle + mid.run - 1) < 1e-12 && mid.run < 0.3, JSON.stringify(mid));
  const three = easedShares({ a: 0.5, b: 0.3, c: 0.2 });
  assert.ok(Math.abs(three.a + three.b + three.c - 1) < 1e-12);
  // At the start of a fade the share comes in at half the rate the cross-fade gives it.
  const tiny = 1e-6, start = easedShares({ idle: 1 - tiny, run: tiny }).run / tiny;
  assert.ok(Math.abs(start - 0.5) < 1e-3, `${start}`);
});
