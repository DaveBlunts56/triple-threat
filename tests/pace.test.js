import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../src/sim/state.js';
import { giveBall } from '../src/sim/players.js';
import { AI, CLOCK, RIM } from '../src/sim/tuning.js';
import { at, ai } from './helpers.js';

// Five a side, live, no coach. Team 0's handler (player 0) has had the ball a second; everyone else is parked far
// away in the back court unless a test places him. The shot clock is full.
function scene() {
  const s = createMatch(1, 5);
  s.phase = 'live'; s.playWait = [Infinity, Infinity];
  s.players.forEach((p, i) => at(s, p.id, -12 + (i % 5) * 0.8, p.team === 0 ? -6 : 6));
  giveBall(s, s.players[0]);
  s.players[0].ai.heldT = 1; s.players[0].ai.had = true;
  return s;
}
const again = s => { s.players[0].ai.timer = 0; return ai(s)[0]; };
const waited = s => { s.shotClock = CLOCK.shot - AI.patience[1] - 0.1; };   // longer than any possession waits

test('early in the shot clock the computer passes up an open shot from outside; once it has waited it takes it', () => {
  const s = scene();
  at(s, 0, 6.5, 0); at(s, 6, 9.5, 0.2);          // open and in range, his lane to the hoop not clear
  ai(s);
  assert.equal(s.players[0].ai.action, null, 'he shot with the shot clock full');
  assert.ok(s.tempo.wait >= AI.patience[0] && s.tempo.wait <= AI.patience[1], `the wait is ${s.tempo.wait}`);
  waited(s); again(s);
  assert.equal(s.players[0].ai.action, 'shoot');
});

test('a lay-up is taken whenever it comes', () => {
  const s = scene();
  at(s, 0, RIM.x - 1.6, 0.8); at(s, 6, RIM.x - 0.6, 0.2);
  ai(s);
  assert.equal(s.players[0].ai.action, 'shoot');
});

test('early on he takes a clear lane only on a fast break, with every defender well behind him; otherwise he walks the ball up', () => {
  const walk = scene();
  at(walk, 0, -2, 0); at(walk, 5, -3, 2.5);       // a defender level with him, off the line to the hoop
  ai(walk);
  assert.equal(walk.players[0].ai.sprint, false, 'he ran at a defence that is back with him');
  assert.ok(walk.players[0].ai.targetX < AI.driveX - 3, 'he went for the rim');
  const run = scene();
  at(run, 0, -2, 0);                              // everyone else is far behind him
  ai(run);
  assert.deepEqual([run.players[0].ai.sprint, run.players[0].ai.targetX], [true, AI.driveX]);
  waited(walk); again(walk);                       // later in the clock a clear lane is taken as before
  assert.deepEqual([walk.players[0].ai.sprint, walk.players[0].ai.targetX], [true, AI.driveX]);
});

test('early in the shot clock the ball is not thrown inside: an open man near the hoop is passed to only once the offence has been run', () => {
  const s = scene();
  at(s, 0, 6.5, 0); at(s, 5, 7.9, -0.6);          // the handler is covered and his lane to the hoop is not clear
  at(s, 2, 11, 2.6);                              // a team-mate open near the hoop
  assert.equal(ai(s)[0].pass, false, 'he threw it inside with the shot clock full');
  waited(s);
  assert.equal(again(s).pass, true);
});

test('the wait is drawn afresh each time the shot clock starts again, and kept while it runs down', () => {
  const s = scene();
  at(s, 0, 6.5, 0); at(s, 6, 9.5, 0.2);
  ai(s); const first = s.tempo.wait;
  s.shotClock = 15; again(s);
  assert.equal(s.tempo.wait, first);
  s.shotClock = CLOCK.shot; again(s);
  assert.notEqual(s.tempo.wait, first);
});
