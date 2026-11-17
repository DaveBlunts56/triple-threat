import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, TUTORIAL, createTutorial, handBack, idle, keepPractising, placeAside, stepTutorial, tutorialSpot, tutorialWords } from '../src/tutorial.js';
import { createMatch, emptyIntent } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { setStyle } from '../src/sim/styles.js';
import { aiIntents } from '../src/sim/ai.js';
import { step } from '../src/sim/step.js';
import { callPlay, playsFor } from '../src/sim/plays.js';
import { CLOCK, DT } from '../src/sim/tuning.js';
import { DEFAULT_KEYS } from '../src/keys.js';

// A practice: three on three, your ball, the other team aside.
function practice() {
  const s = createMatch(3, 3, [2, 9]);
  setStyle(s, 'arcade'); s.humans = [0]; startMatch(s); handBack(s);
  return { s, tut: createTutorial(s) };
}
const run = (s, seconds, mine = emptyIntent()) => {
  for (let t = 0; t < seconds; t += DT) {
    const intents = idle(s, aiIntents(s, DT));
    intents[s.controlled] = mine;
    step(s, intents, DT);
  }
};

test('the steps: move, sprint, pass, shoot, dunk, call a play and run it, each asked in the player\'s own keys', () => {
  assert.deepEqual(STEPS.map(x => x.key), ['move', 'sprint', 'pass', 'shoot', 'dunk', 'play', 'run']);
  const { s, tut } = practice();
  assert.match(tutorialWords(tut, DEFAULT_KEYS), /^W A S D move/);
  tut.step = STEPS.findIndex(x => x.key === 'shoot');
  assert.match(tutorialWords(tut, { ...DEFAULT_KEYS, shoot: 'KeyJ' }), /Hold J to rise/);
  tut.step = STEPS.length;
  assert.match(tutorialWords(tut, DEFAULT_KEYS), /Press Enter to go back to the menu/);
  assert.equal(tutorialSpot(tut, s), null);
});

test('the practice starts live with your ball, the other team aside at the far end and standing still', () => {
  const { s } = practice();
  assert.deepEqual([s.phase, s.possession, s.players[s.ball.holder].team, s.ball.holder], ['live', 0, 0, s.controlled]);
  assert.ok(s.players.filter(p => p.team === 1).every(p => p.x <= -TUTORIAL.aside + 0.01));
  const intents = idle(s, aiIntents(s, DT));
  assert.ok(s.players.filter(p => p.team === 1).every(p => JSON.stringify(intents[p.id]) === JSON.stringify(emptyIntent())));
});

test('walking to the spot ticks Move; reaching the next one ticks Sprint only if sprinting', () => {
  const { s, tut } = practice(), me = s.players[s.controlled];
  assert.equal(stepTutorial(tut, s), null);
  Object.assign(me, tutorialSpot(tut, s));
  assert.equal(stepTutorial(tut, s), 'move');
  Object.assign(me, tutorialSpot(tut, s));
  assert.equal(stepTutorial(tut, s, emptyIntent()), null);
  assert.equal(stepTutorial(tut, s, { ...emptyIntent(), sprint: true }), 'sprint');
});

test('a pass caught by a teammate ticks Pass, and you then play as him', () => {
  const { s, tut } = practice();
  tut.step = STEPS.findIndex(x => x.key === 'pass');
  const passer = s.controlled;
  run(s, 0.1, { ...emptyIntent(), pass: true });
  for (let i = 0; i < 120 && !stepTutorial(tut, s); i++) run(s, DT);
  assert.equal(tut.step, STEPS.findIndex(x => x.key === 'shoot'));
  assert.notEqual(s.controlled, passer);
});

test('any shot ticks Shoot; only a dunk ticks Dunk; a play called ticks Call a play, and a pass in it Run the play', () => {
  const { s, tut } = practice(), me = s.players[s.controlled];
  tut.step = STEPS.findIndex(x => x.key === 'shoot');
  s.shot = { shooter: me.id, at: s.time, finish: null };
  assert.equal(stepTutorial(tut, s), 'shoot');
  s.shot = { shooter: me.id, at: s.time, finish: 'layup' };
  assert.equal(stepTutorial(tut, s), null);
  s.shot = { shooter: me.id, at: s.time, finish: 'dunk' };
  assert.equal(stepTutorial(tut, s), 'dunk');
  assert.equal(stepTutorial(tut, s), null);
  callPlay(s, 0, playsFor(s.size)[0]);
  assert.equal(stepTutorial(tut, s), 'play');
  handBack(s, TUTORIAL.top);   // over half court, where a play can start
  run(s, 0.5);
  assert.ok(s.plays[0], 'the play starts');
  s.plays[0].passAt = s.plays[0].t;
  assert.equal(stepTutorial(tut, s), 'run');
  assert.equal(tut.step, STEPS.length);
});

test('the clocks are held, and a moment after the ball is lost it is handed back to you, the other team put aside again', () => {
  const { s, tut } = practice();
  s.shotClock = 3; s.gameClock = 2;
  keepPractising(tut, s);
  assert.deepEqual([s.shotClock, s.gameClock], [CLOCK.shot, 60]);
  const thief = s.players.find(p => p.team === 1);
  thief.x = 0;
  s.ball.holder = thief.id; s.possession = 1;
  assert.equal(keepPractising(tut, s), false);   // not at once
  s.time += TUTORIAL.back + DT;
  assert.equal(keepPractising(tut, s), true);
  assert.deepEqual([s.possession, s.players[s.ball.holder].team, s.phase], [0, 0, 'live']);
  assert.ok(thief.x <= -TUTORIAL.aside + 0.01);
  // From the passing step on, it is handed back at the top of the key, where a shot, a drive or a play is at hand.
  tut.step = STEPS.findIndex(x => x.key === 'shoot'); s.possession = 1; s.time += TUTORIAL.back;
  keepPractising(tut, s); s.time += TUTORIAL.back + DT; keepPractising(tut, s);
  assert.deepEqual([s.players[s.ball.holder].x, s.players[s.ball.holder].z], [TUTORIAL.top[0], TUTORIAL.top[1]]);
  placeAside(s);
});
