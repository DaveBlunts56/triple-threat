import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyEvents } from '../src/sim/state.js';
import { judgeContacts, recordFoul } from '../src/sim/fouls.js';
import { substitute } from '../src/sim/roster.js';
import { applyRules } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { DT, FOUL, RIM } from '../src/sim/tuning.js';
import { live, idle, only, run, firstSeed, at, shotAt, pressWhenAiming } from './helpers.js';

// Over seeds 1..600, the share of [state, events] = make(seed) that judgeContacts calls a foul of `kind` (any foul when null).
function share(make, kind) {
  let n = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const foul = judgeContacts(...make(seed), DT);
    if (foul && (kind === null || foul.kind === kind)) n++;
  }
  return n / 600;
}

// Holder 0 at (5, 0) moving +x at `speed` has run into defender 3, who has stood still for `setT` seconds.
function crash(seed, { speed = 5.95, setT = 0.5, ahead = true } = {}) {
  const s = live(seed);
  Object.assign(s.players[0], { x: 5, z: 0, vx: speed, vz: 0 });
  Object.assign(s.players[3], { x: ahead ? 5.5 : 4.5, z: 0, setT });
  return [s, { ...emptyEvents(), contacts: [[0, 3]] }];
}

// Holder 0 stands at (2, 0) facing +x with defender 3 right behind him, about to reach in.
function stealing(seed, { shotClock = 24, teamFouls = [0, 0], fouls = 0, benchFouls = 0, gameClock = 180 } = {}) {
  const s = live(seed);
  at(s, 0, 2, 0); at(s, 3, 1.2, 0);
  s.players[0].facing = 0;
  Object.assign(s, { shotClock, teamFouls, gameClock });
  s.rosters[1][0].fouls = fouls;
  s.rosters[1][3].fouls = s.rosters[1][4].fouls = benchFouls;
  return s;
}
const stealKeys = s => only(3, { steal: Math.round(s.time / DT) % 2 === 0 });   // player 3 keeps pressing steal

// The first seed where `setup(seed)`, played with `keys` for up to 3 seconds, ends in a call of `kind`.
const fouled = (setup, kind = 'reach', keys = stealKeys) =>
  firstSeed(setup, st => { run(st, 3, keys, x => x.call !== null || x.phase !== 'live'); return st.call?.kind === kind; });

test('a failed steal is a reach-in 12% of the time from the front, 30% from behind', () => {
  const reach = front => share(seed => [live(seed), { ...emptyEvents(), stealMisses: [{ by: 3, on: 0, front }] }], 'reach');
  assert.ok(Math.abs(reach(true) - 0.12) < 0.05);
  assert.ok(Math.abs(reach(false) - 0.3) < 0.06);
});

test('an airborne defender on top of the shooter fouls him a quarter of the time; a clean block never', () => {
  const shot = release => share(seed => [live(seed), { ...emptyEvents(), release }], 'shooting');
  assert.ok(Math.abs(shot({ shooter: 0, defender: 3, blocked: false }) - 0.25) < 0.06);
  assert.equal(shot({ shooter: 0, defender: null, blocked: false }), 0);
  assert.equal(shot({ shooter: 0, defender: 3, blocked: true }), 0);
});

test('running into a set defender is a charge 60% of the time; into a moving one, a block 15%', () => {
  assert.ok(Math.abs(share(seed => crash(seed, {}), 'charge') - 0.6) < 0.07);
  assert.ok(Math.abs(share(seed => crash(seed, { setT: 0 }), 'block') - 0.15) < 0.05);
});

test('no collision foul below 5.5 m/s, or with a defender behind the handler', () => {
  assert.equal(share(seed => crash(seed, { speed: 5 }), null), 0);
  assert.equal(share(seed => crash(seed, { ahead: false }), null), 0);
});

test('the same defender is judged at most once a second', () => {
  const [s, events] = crash(1, { setT: 0 });
  judgeContacts(s, events, DT);
  assert.equal(s.players[3].foulCooldown, FOUL.cooldown);
  assert.equal(share(seed => { const [st, ev] = crash(seed, {}); st.players[3].foulCooldown = 0.5; return [st, ev]; }, null), 0);
});

test('a foul counts against the player and his team; the 3rd team foul starts the bonus', () => {
  const s = live();
  assert.deepEqual(recordFoul(s, { kind: 'reach', by: 3, on: 0 }), { shots: 0, ball: 0 });
  assert.deepEqual(recordFoul(s, { kind: 'block', by: 4, on: 0 }), { shots: 0, ball: 0 });
  assert.deepEqual(recordFoul(s, { kind: 'reach', by: 3, on: 0 }), { shots: 2, ball: 0 });
  assert.deepEqual([s.rosters[1][0].fouls, s.rosters[1][1].fouls, s.teamFouls], [2, 1, [0, 3]]);
});

test('a charge gives the ball to the defence and never free throws', () => {
  const s = live(); s.teamFouls = [5, 0];
  assert.deepEqual(recordFoul(s, { kind: 'charge', by: 0, on: 3 }), { shots: 0, ball: 1 });
  assert.equal(s.teamFouls[0], 6);
});

// The tests below go through step().
test('a reach-in outside the bonus: the fouled team inbounds and the shot clock is at least 14', () => {
  const s = fouled(seed => stealing(seed, { shotClock: 5 }));
  assert.deepEqual(s.call, { kind: 'reach', team: 1, ball: 0, number: 5, shots: 0 });
  assert.deepEqual([s.phase, s.possession, s.freeThrow, s.shotClock], ['dead', 0, null, 14]);
});

test('the shot clock is left alone when it is above 14', () => {
  const s = fouled(seed => stealing(seed, { shotClock: 20 }));
  assert.ok(Math.abs(s.shotClock - (20 - s.time)) < 0.1, `shot clock ${s.shotClock} after ${s.time} s`);
});

test('in the bonus the same foul gives two shots', () => {
  const s = fouled(seed => stealing(seed, { teamFouls: [0, 2] }));
  assert.equal(s.call.shots, 2);
  run(s, 3, idle(), st => st.phase === 'freeThrow');
  assert.deepEqual([s.phase, s.freeThrow.shooter, s.freeThrow.total], ['freeThrow', 0, 2]);
});

test('play carries on until a fouled shot has finished', () => {
  const s = live(); s.pendingFoul = { by: 3, on: 0, shots: 2 };
  shotAt(s, { x: 9, y: 4, z: 0 });
  step(s, idle(), DT);
  assert.equal(s.phase, 'live');
});

test('a fouled shot that misses gives two shots, or three from behind the arc', () => {
  for (const shots of [2, 3]) {
    const s = live(); s.pendingFoul = { by: 3, on: 0, shots };
    shotAt(s, { x: 9, y: 0.5, z: 5 }, shots);           // an airball about to land
    run(s, 1, idle(), st => st.phase === 'dead');
    assert.deepEqual([s.call.kind, s.call.shots, s.freeThrow.total, s.pendingFoul, s.score], ['shooting', shots, shots, null, [0, 0]]);
  }
});

test('a fouled shot that goes in counts, with one free throw', () => {
  const s = live(); s.pendingFoul = { by: 3, on: 0, shots: 2 };
  shotAt(s, { x: RIM.x, y: 3.5, z: 0 }, 2);             // dropping through the hoop
  run(s, 1, idle(), st => st.phase === 'dead');
  assert.deepEqual([s.score, s.call.kind, s.call.shots, s.freeThrow.total, s.possession], [[2, 0], 'shooting', 1, 1, 0]);
});

test('a fouled shot that flies into the stands is still a foul', () => {
  const s = live(); s.pendingFoul = { by: 3, on: 0, shots: 2 };
  shotAt(s, { x: 15.4, y: 3, z: 0 });
  s.ball.vx = 5;
  run(s, 1, idle(), st => st.phase === 'dead');
  assert.deepEqual([s.call.kind, s.freeThrow.total, s.pendingFoul], ['shooting', 2, null]);
});

test('a defender in the air on top of the shooter at the release can be called for a shooting foul', () => {
  const up = seed => { const s = live(seed); at(s, 0, 6, 0); at(s, 3, 6.6, 0); Object.assign(s.players[3], { y: 0.5, vy: 2 }); return s; };
  const jumpShot = s => only(0, { shoot: s.time < 0.3 });                              // goes up, lets go in the air
  const s = firstSeed(up, st => { run(st, 0.5, jumpShot, x => x.pendingFoul !== null || x.ball.holder === null); return st.pendingFoul !== null; });
  assert.deepEqual(s.pendingFoul, { by: 3, on: 0, shots: 2 });
  assert.equal(s.phase, 'live');
});

test('a charge is a turnover even in the bonus', () => {
  const charging = seed => { const s = live(seed); at(s, 0, 2, 0); at(s, 3, 3.5, 0); s.players[0].vx = 5.95; s.players[3].setT = 0.5; s.teamFouls = [2, 0]; return s; };
  const s = fouled(charging, 'charge', only(0, { moveX: 1, sprint: true }));
  assert.deepEqual(s.call, { kind: 'charge', team: 0, ball: 1, number: 4, shots: 0 });
  assert.deepEqual([s.possession, s.freeThrow, s.teamFouls, s.shotClock], [1, null, [3, 0], 24]);
});

test('a player with three fouls is replaced during the stoppage and cannot come back', () => {
  const s = fouled(seed => stealing(seed, { fouls: 2 }));           // the stealer already has two
  step(s, idle(), DT);
  assert.notEqual(s.players[3].person, 0);
  assert.equal(substitute(s, 4, 0), false);
});

test('with no eligible bench player he stays on and the match carries on', () => {
  const s = fouled(seed => stealing(seed, { fouls: 2, benchFouls: 3 }));
  run(s, 3, idle(), st => st.phase === 'inbound');
  assert.deepEqual([s.players[3].person, s.phase], [0, 'inbound']);
});

test('a foul and a travel in the same step give one call, the foul', () => {
  const s = firstSeed(seed => { const [st, ev] = crash(seed, {}); st.players[0].held = true; st.players[0].steps = 2; applyRules(st, ev, DT, idle()); return st; },
    st => st.call?.kind === 'charge');
  assert.deepEqual([s.phase, s.call.kind, s.teamFouls], ['dead', 'charge', [1, 0]]);
});

test('a foul at the buzzer: the shots are taken, then the period ends', () => {
  const s = fouled(seed => stealing(seed, { teamFouls: [0, 2], gameClock: 0 }));      // the foul comes on the very step the clock ran out
  assert.equal(s.phase, 'dead');
  const phases = new Set();
  run(s, 40, pressWhenAiming, st => { phases.add(st.phase); return st.phase === 'quarterEnd'; });
  assert.deepEqual([...phases], ['dead', 'freeThrow', 'quarterEnd']);
});

test('team fouls reset each quarter, but overtime carries on from the 4th', () => {
  const s = live(); s.teamFouls = [2, 1]; s.gameClock = 0.01;
  run(s, 5, idle(), st => st.quarter === 2);
  assert.deepEqual([s.quarter, s.teamFouls], [2, [0, 0]]);
  const t = live(); Object.assign(t, { quarter: 4, score: [10, 10], teamFouls: [2, 1], gameClock: 0.01 });
  run(t, 5, idle(), st => st.quarter === 5);
  assert.deepEqual([t.quarter, t.teamFouls], [5, [2, 1]]);
});

test('nobody is fouled during a dead ball, and an inbounder cannot be fouled', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const dead = stealing(seed); dead.phase = 'dead'; dead.phaseT = 2;
    run(dead, 1.5, stealKeys);
    const inbound = stealing(seed); inbound.phase = 'inbound'; inbound.players[0].inbounder = true;
    run(inbound, 1.5, stealKeys);
    assert.deepEqual([dead.teamFouls, inbound.teamFouls, inbound.ball.holder], [[0, 0], [0, 0], 0]);
  }
});
