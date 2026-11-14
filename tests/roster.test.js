import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onCourt, benchOf, substitute, queueSub, applySubs } from '../src/sim/roster.js';
import { step } from '../src/sim/step.js';
import { DT, FOUL } from '../src/sim/tuning.js';
import { live as whole, idle } from './helpers.js';

// These tests were written when a team had five people, two of them on the bench of a three-a-side match. The three
// who joined since are fouled out here, so that the bench is those two again and each test reads as it did.
function live(...args) {
  const s = whole(...args);
  for (const roster of s.rosters) for (const person of roster.slice(5)) person.fouls = FOUL.limit;
  return s;
}

test('a substitution changes who the court player is, not where he stands or who you control', () => {
  const s = live(); Object.assign(s.players[1], { x: 3, z: 4 }); s.controlled = 1;
  assert.equal(substitute(s, 1, 3), true);
  assert.deepEqual([s.players[1].person, s.players[1].x, s.players[1].z, s.players[1].slot, s.controlled], [3, 3, 4, 1, 1]);
  assert.deepEqual(onCourt(s, 0), [0, 3, 2]);
  assert.deepEqual(benchOf(s, 0), [1, 4]);
});

test('a player already on court, or one who has fouled out, cannot come on', () => {
  const s = live(); s.rosters[0][4].fouls = 3;
  assert.equal(substitute(s, 1, 2), false);
  assert.equal(substitute(s, 1, 4), false);
  assert.deepEqual(benchOf(s, 0), [3]);
});

test('queueSub takes the pair in either order, rejects bad pairs, and the same pair again cancels', () => {
  const s = live();
  assert.equal(queueSub(s, 0, 3, 1), true);
  assert.deepEqual(s.subQueue, [{ team: 0, out: 1, in: 3 }]);
  assert.equal(queueSub(s, 0, 0, 1), false);           // both on court
  assert.equal(queueSub(s, 0, 3, 4), false);           // both on the bench
  assert.equal(queueSub(s, 0, 1, 3), true);            // same pair: cancelled
  assert.deepEqual(s.subQueue, []);
});

test('applySubs makes the queued swap and empties the queue', () => {
  const s = live(); queueSub(s, 0, 1, 3);
  applySubs(s);
  assert.equal(s.players[1].person, 3);
  assert.deepEqual(s.subQueue, []);
});

test('a tired player comes off for a fresh one, at 35% and 70%', () => {
  const tired = (court, bench) => { const s = live(); s.rosters[0][0].energy = court; s.rosters[0][3].energy = bench; s.rosters[0][4].energy = 0; applySubs(s); return s.players[0].person; };
  assert.equal(tired(0.3, 0.8), 3);
  assert.equal(tired(0.4, 0.8), 0);                    // not tired enough
  assert.equal(tired(0.3, 0.6), 0);                    // nobody fresh enough
});

test('a player one foul from fouling out is rested for a fresh player with fewer fouls', () => {
  const rested = (energy, fouls) => { const s = live(); s.rosters[0][0].fouls = 2; Object.assign(s.rosters[0][3], { energy, fouls }); s.rosters[0][4].energy = 0; applySubs(s); return s.players[0].person; };
  assert.equal(rested(1, 0), 3);
  assert.equal(rested(0.6, 0), 0);                     // not fresh enough
  assert.equal(rested(1, 2), 0);                       // in the same foul trouble
});

test('with automatic substitutions off, a tired player stays on', () => {
  const s = live(); s.autoSubs[0] = false; s.rosters[0][0].energy = 0.1;
  applySubs(s);
  assert.equal(s.players[0].person, 0);
});

test('a fouled-out player is always replaced, by the freshest eligible player', () => {
  const s = live(); s.autoSubs[0] = false;
  s.rosters[0][0].fouls = 3; s.rosters[0][3].energy = 0.2; s.rosters[0][4].energy = 0.4;
  applySubs(s);
  assert.equal(s.players[0].person, 4);
});

test('with nobody eligible on the bench a fouled-out player stays on and nothing throws', () => {
  const s = live(); s.rosters[0][0].fouls = 3; s.rosters[0][3].fouls = 3; s.rosters[0][4].fouls = 3;
  applySubs(s);
  assert.equal(s.players[0].person, 0);
});

test('the free-throw shooter is not replaced until he has shot', () => {
  const s = live(); s.freeThrow = { shooter: 0 }; s.rosters[0][0].energy = 0.1;
  applySubs(s);
  assert.equal(s.players[0].person, 0);
  s.freeThrow = null; applySubs(s);
  assert.equal(s.players[0].person, 3);
});

test('a swap queued for the free-throw shooter waits until he has shot', () => {
  const s = live(); s.autoSubs[0] = false; s.freeThrow = { shooter: 1 }; queueSub(s, 0, 1, 3);
  applySubs(s);
  assert.deepEqual([s.players[1].person, s.subQueue.length], [1, 1]);
  s.freeThrow = null; applySubs(s);
  assert.deepEqual([s.players[1].person, s.subQueue.length], [3, 0]);
});

test('a player you bring on yourself is not taken back off by the automatic rules', () => {
  for (const benched of [{ fouls: 2 }, { energy: 0.2 }]) {   // in foul trouble, or tired: the computer would not have picked him
    const s = live(); Object.assign(s.rosters[0][3], benched);
    queueSub(s, 0, 0, 3);
    applySubs(s);
    assert.deepEqual([s.players[0].person, s.subQueue.length], [3, 0]);
    applySubs(s);                                       // nor at the next stoppage
    assert.equal(s.players[0].person, 3);
  }
});

test('once he comes off, the automatic rules apply to him again; and he is still replaced if he fouls out', () => {
  const s = live(); s.rosters[0][4].energy = 0;         // person 4 plays no part
  queueSub(s, 0, 0, 3); applySubs(s);
  queueSub(s, 0, 3, 0); applySubs(s);                   // you take him off again
  assert.equal(s.players[0].person, 0);
  s.rosters[0][1].energy = 0.1;
  applySubs(s);                                         // this time the automatic rule brings him on, for the tired person 1
  assert.equal(s.players[1].person, 3);
  s.rosters[0][3].energy = 0.1; s.rosters[0][1].energy = 0.9;
  applySubs(s);                                         // so it may take him off again
  assert.equal(s.players[1].person, 1);

  const t = live(); queueSub(t, 0, 0, 3); applySubs(t);
  t.rosters[0][3].fouls = 3;
  applySubs(t);
  assert.notEqual(t.players[0].person, 3);
});

test('the computer team is substituted by the same rules', () => {
  const s = live(); s.rosters[1][2].energy = 0.2;
  applySubs(s);
  assert.equal(s.players[5].person, 3);
});

test('a swap queued during a dead ball is made as soon as play steps again', () => {
  const s = live(); s.phase = 'dead'; s.phaseT = 1; s.controlled = 1;
  queueSub(s, 0, 1, 3);
  step(s, idle(), DT);
  assert.deepEqual([s.players[1].person, s.controlled, s.subQueue.length], [3, 1, 0]);
});

test('with eight a side the bench of a three-a-side match is five, and a swap reaches the newest of them', () => {
  const s = whole();
  assert.deepEqual([onCourt(s, 0), benchOf(s, 0)], [[0, 1, 2], [3, 4, 5, 6, 7]]);
  assert.equal(queueSub(s, 0, 7, 1), true);                                 // given in either order
  applySubs(s);
  assert.deepEqual([s.players[1].person, s.rosters[0][7].manual, benchOf(s, 0)], [7, true, [1, 3, 4, 5, 6]]);
});

test('in five a side the bench is the three newest, and a tired starter is rested for the freshest of them', () => {
  const s = whole(1, 5);
  assert.deepEqual([onCourt(s, 0), benchOf(s, 0), benchOf(s, 1)], [[0, 1, 2, 3, 4], [5, 6, 7], [5, 6, 7]]);
  s.rosters[0][3].energy = 0.2; s.rosters[0][5].energy = 0.8; s.rosters[0][6].energy = 0.95; s.rosters[0][7].energy = 0.75;
  applySubs(s);
  assert.deepEqual([s.players[3].person, s.players[3].slot, onCourt(s, 0)], [6, 3, [0, 1, 2, 6, 4]]);
});
