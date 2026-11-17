import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, emptyIntent } from '../src/sim/state.js';
import { giveBall } from '../src/sim/players.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { COURT, DT, RIM, CLOCK } from '../src/sim/tuning.js';

const OUT = 0.5;   // an inbounder stands this far outside the line

const idle = () => Array.from({ length: 6 }, emptyIntent);
const intents = (id, intent) => Array.from({ length: 6 }, (_, i) => (i === id ? { ...emptyIntent(), ...intent } : emptyIntent()));
// Steps with empty intents until `done(state)` or the time runs out. Returns true if `done` fired.
function run(s, seconds, done) {
  for (let t = 0; t < seconds; t += DT) {
    step(s, idle(), DT);
    if (done?.(s)) return true;
  }
  return false;
}

// A match in live play: team 0 at x=5, team 1 at x=-5, player 0 holding the ball.
function live() {
  const s = createMatch();
  startMatch(s);
  s.players.forEach(p => { p.inbounder = false; p.x = p.team === 0 ? 5 : -5; p.z = (p.slot - 1) * 3; });
  s.phase = 'live';
  giveBall(s, s.players[0]);
  return s;
}
function freeBall(s, pos, extra = {}) {
  Object.assign(s.ball, { holder: null, mode: 'loose', shooter: null, shotValue: 0, vx: 0, vy: 0, vz: 0, ...pos, ...extra });
}
const shotAt = (s, pos, shotValue = 2) => freeBall(s, pos, { mode: 'shot', shooter: 0, shotValue });
const aboveHoop = sign => ({ x: sign * RIM.x, y: 3.5, z: 0 });

// The start of quarter 2. The match itself now opens with a jump ball (tests/tip.test.js);
// with no tip played, team 0 counts as its winner, so team 1 starts this quarter.
function inbounding() {
  const s = createMatch();
  startMatch(s);
  Object.assign(s, { phase: 'quarterEnd', phaseT: 0 });
  step(s, idle(), DT);
  return s;
}

test('a later period starts with an inbound from the baseline, clocks stopped', () => {
  const s = inbounding();
  assert.equal(s.phase, 'inbound');
  assert.equal(s.possession, 1);
  const inbounders = s.players.filter(p => p.inbounder);
  assert.equal(inbounders.length, 1);
  assert.equal(inbounders[0].team, 1);
  assert.equal(inbounders[0].x, COURT.halfLength + OUT);   // team 1 defends the hoop at +x
  assert.equal(s.ball.holder, inbounders[0].id);
  run(s, 2);
  assert.equal(s.gameClock, 180);
  assert.equal(s.shotClock, 24);
});

test('clock starts when the inbound pass is caught', () => {
  const s = inbounding();
  const k = s.players.find(p => p.inbounder).id;
  step(s, intents(k, { pass: true }), DT);
  assert.equal(s.ball.mode, 'pass');
  assert.ok(run(s, 2, st => st.phase === 'live'), 'never went live');
  assert.ok(s.players.every(p => !p.inbounder));
  run(s, 1);
  assert.ok(s.gameClock < 180);
});

test('a made two scores 2 and gives the ball to the other team under that hoop', () => {
  const s = live();
  shotAt(s, aboveHoop(1), 2);
  run(s, 1, st => st.phase !== 'live');
  assert.deepEqual(s.score, [2, 0]);
  assert.equal(s.phase, 'dead');
  assert.equal(s.possession, 1);
  assert.equal(s.inboundSpot.x, COURT.halfLength + OUT);
});

test('a made three scores 3', () => {
  const s = live();
  shotAt(s, aboveHoop(1), 3);
  run(s, 1, st => st.phase !== 'live');
  assert.deepEqual(s.score, [3, 0]);
});

test('a ball through the hoop with no shooter scores 2', () => {
  const s = live();
  freeBall(s, aboveHoop(1));
  run(s, 1, st => st.phase !== 'live');
  assert.deepEqual(s.score, [2, 0]);
});

test('the -x hoop scores for team 1', () => {
  const s = live();
  freeBall(s, aboveHoop(-1));
  run(s, 1, st => st.phase !== 'live');
  assert.deepEqual(s.score, [0, 2]);
  assert.equal(s.possession, 0);
  assert.equal(s.inboundSpot.x, -(COURT.halfLength + OUT));
});

test('after a basket the other team inbounds from the baseline once the dead time passes', () => {
  const s = live();
  shotAt(s, aboveHoop(1));
  run(s, 1, st => st.phase === 'dead');
  assert.ok(run(s, CLOCK.dead + 0.2, st => st.phase === 'inbound'), 'never reached inbound');
  const inb = s.players.find(p => p.inbounder);
  assert.equal(inb.team, 1);
  assert.equal(inb.x, COURT.halfLength + OUT);
  assert.equal(s.ball.holder, inb.id);
  assert.equal(s.shotClock, 24);
});

test('a new quarter starts as after a basket: an inbound from the baseline under the hoop the team with the ball defends', () => {
  for (const [quarter, tipWinner] of [[2, 0], [3, 0], [2, 1]]) {
    const s = createMatch();
    startMatch(s);
    Object.assign(s, { phase: 'quarterEnd', phaseT: 0, quarter: quarter - 1, tipWinner });
    step(s, idle(), DT);
    const team = quarter % 2 === 1 ? tipWinner : 1 - tipWinner, own = team === 0 ? -1 : 1;   // team 0 attacks +x
    const inb = s.players.find(p => p.inbounder);
    assert.deepEqual([s.quarter, s.phase, s.possession, inb.team, s.ball.holder], [quarter, 'inbound', team, team, inb.id]);
    assert.equal(inb.x, own * (COURT.halfLength + OUT), `quarter ${quarter}: from its own baseline`);
  }
});

test('loose ball landing out of bounds goes to the team that did not touch it last', () => {
  const s = live();
  freeBall(s, { x: 0, y: 0.5, z: COURT.halfWidth + 0.3 });
  s.lastTouch = 0;
  assert.ok(run(s, 1, st => st.phase === 'dead'));
  assert.equal(s.possession, 1);
  assert.equal(s.inboundSpot.z, COURT.halfWidth + OUT);
  assert.ok(Math.abs(s.inboundSpot.x) < 0.5);
});

test('a ball out over the baseline is not inbounded from behind the backboard', () => {
  const s = live();
  freeBall(s, { x: COURT.halfLength + 0.3, y: 0.5, z: 0.3 });
  s.lastTouch = 1;
  assert.ok(run(s, 1, st => st.phase === 'dead'));
  assert.equal(s.possession, 0);
  assert.equal(s.inboundSpot.x, COURT.halfLength + OUT);
  assert.ok(Math.abs(s.inboundSpot.z) >= 1.5);
});

test('a holder stepping out of bounds loses the ball', () => {
  const s = live();
  s.players[0].x = COURT.halfLength + 0.2;
  step(s, idle(), DT);
  assert.equal(s.phase, 'dead');
  assert.equal(s.possession, 1);
});

test('shot clock expiry is a turnover', () => {
  const s = live();
  s.shotClock = 0.01;
  step(s, idle(), DT);
  assert.equal(s.phase, 'dead');
  assert.equal(s.possession, 1);
  assert.equal(Math.abs(s.inboundSpot.z), COURT.halfWidth + OUT);
});

test('shot clock resets to 24 when the ball hits the rim', () => {
  const s = live();
  s.shotClock = 5;
  shotAt(s, { x: RIM.x - RIM.radius, y: 3.3, z: 0 });
  run(s, 0.5);
  assert.ok(s.shotClock > 23, `shot clock ${s.shotClock}`);
});

test('a shot in the air at shot-clock zero is not a violation if it hits the rim', () => {
  const s = live();
  s.shotClock = 0.01;
  shotAt(s, { x: RIM.x - RIM.radius, y: 3.6, z: 0 });
  run(s, 0.1);
  assert.equal(s.phase, 'live');
  assert.equal(s.shotClock, 0);
  run(s, 0.4);
  assert.equal(s.phase, 'live');
  assert.ok(s.shotClock > 23);
});

test('an airball at shot-clock zero is a violation when it lands', () => {
  const s = live();
  s.shotClock = 0.01;
  shotAt(s, { x: 9, y: 2.5, z: 5 });
  run(s, 0.3);
  assert.equal(s.phase, 'live');
  assert.ok(run(s, 1, st => st.phase === 'dead'));
  assert.equal(s.possession, 1);
});

test('a shot in the air when the game clock hits zero still counts', () => {
  const s = live();
  s.gameClock = 0.05;
  shotAt(s, { ...aboveHoop(1), y: 4.5 });
  run(s, 0.2);
  assert.equal(s.gameClock, 0);
  assert.equal(s.phase, 'live');
  assert.ok(run(s, 2, st => st.phase === 'quarterEnd'));
  assert.deepEqual(s.score, [2, 0]);
});

test('the period ends at zero when no shot is in the air', () => {
  const s = live();
  s.gameClock = 0.01;
  step(s, idle(), DT);
  assert.equal(s.phase, 'quarterEnd');
});

test('quarter 1 ends into quarter 2 with team 1 inbounding', () => {
  const s = live();
  s.gameClock = 0.01;
  assert.ok(run(s, CLOCK.quarterBreak + 0.5, st => st.phase === 'inbound'));
  assert.equal(s.quarter, 2);
  assert.equal(s.gameClock, 180);
  assert.equal(s.possession, 1);
  assert.equal(s.players.find(p => p.inbounder).team, 1);
});

test('a lead after quarter 4 ends the match', () => {
  const s = live();
  s.quarter = 4; s.score = [10, 8]; s.gameClock = 0.01;
  run(s, CLOCK.quarterBreak + 0.5);
  assert.equal(s.phase, 'final');
});

test('a tie after quarter 4 starts a 60-second overtime', () => {
  const s = live();
  s.quarter = 4; s.score = [10, 10]; s.gameClock = 0.01;
  assert.ok(run(s, CLOCK.quarterBreak + 0.5, st => st.phase === 'inbound'));
  assert.equal(s.quarter, 5);
  assert.equal(s.gameClock, 60);
});

test('step does nothing in start and final phases', () => {
  for (const phase of ['start', 'final']) {
    const s = createMatch();
    s.phase = phase;
    const x = s.players[0].x;
    step(s, intents(0, { moveX: 1 }), DT);
    assert.equal(s.players[0].x, x);
    assert.equal(s.time, 0);
  }
});

test('nobody can pick up the ball or score during a dead phase', () => {
  const s = live();
  s.phase = 'dead'; s.phaseT = 1;
  freeBall(s, { x: s.players[1].x, y: 0.12, z: s.players[1].z });
  run(s, 0.2);
  assert.equal(s.ball.holder, null);
  freeBall(s, aboveHoop(1));
  run(s, 0.6);
  assert.deepEqual(s.score, [0, 0]);
});

test('a ball flying well past the sideline is out before it lands, and stays near the court', () => {
  const s = live();
  freeBall(s, { x: 0, y: 2, z: 7 }, { vz: 14, vy: 4 });
  s.lastTouch = 0;
  let furthest = 0;
  const out = run(s, 0.4, st => { furthest = Math.max(furthest, Math.abs(st.ball.z)); return st.phase === 'dead'; });
  assert.ok(out, 'still live with the ball in the stands');
  run(s, 1, st => { furthest = Math.max(furthest, Math.abs(st.ball.z)); });
  assert.ok(furthest < 11, `ball got to z=${furthest}`);
  assert.equal(s.possession, 1);
});

test('a key held when control moves to a teammate is not a fresh press for him', () => {
  const s = live();
  freeBall(s, { x: s.players[1].x + 0.3, y: 0.12, z: s.players[1].z });
  s.controlled = 0;
  const held = () => intents(s.controlled, { shoot: true });   // the human is holding Space to jump
  for (let i = 0; i < 10; i++) step(s, held(), DT);
  assert.equal(s.ball.holder, 1);
  assert.equal(s.controlled, 1);
  assert.equal(s.players[1].shooting, false, 'the teammate went up for a shot nobody asked for');
});

test('a key already held when play resumes is not a fresh press', () => {
  const s = live();
  s.phase = 'dead'; s.phaseT = 10;
  for (let i = 0; i < 6; i++) step(s, intents(1, { shoot: true }), DT);
  s.phase = 'live';
  for (let i = 0; i < 3; i++) step(s, intents(1, { shoot: true }), DT);
  assert.equal(s.players[1].y, 0);
  assert.equal(s.players[1].vy, 0);
});
