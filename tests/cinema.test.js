// Overhaul Stage 4: the broadcast's close-ups in dead time (broadcast/cinema.js) and the camera easing to them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, personOf } from '../src/sim/state.js';
import { CINEMA, closeCard, closeUp, createCinema, cue, skipClose } from '../src/broadcast/cinema.js';
import { startHuddle } from '../src/sim/together.js';

// A five-a-side match whose player 1 (team 0) has just scored: the ball dead, his celebration begun.
function scored(phase = 'dead') {
  const s = createMatch(1, 5); s.humans = [];
  s.players.forEach((p, i) => Object.assign(p, { x: (i % 5) * 2 - 4, z: p.team ? 3 : -3, facing: 0 }));
  s.phase = phase;
  s.last.score = { team: 0, by: 1, row: s.players[1].person, points: 3, at: 0, assist: null };
  return s;
}
const celebrating = { 1: { clip: 'goggles', t: 0 } };

test('after a big basket, with the ball dead, the camera comes in on the scorer as he celebrates; never in live play, never twice for one basket', () => {
  const s = scored(), c = createCinema();
  assert.equal(cue(c, s, 10, celebrating).kind, 'scorer');
  assert.equal(c.on.id, 1);
  const live = scored('live'), c2 = createCinema();
  assert.equal(cue(c2, live, 10, celebrating), null, 'not while the ball is live');
  skipClose(c);
  assert.equal(cue(c, s, 10.1, celebrating), null, 'the same basket is not shown again');
  assert.equal(cue(createCinema(), s, 10, { 1: { clip: 'clap', t: 0 } }), null, 'only a celebration');
});

test('a close-up ends when play goes live, when its time is up, at any key, or when a replay has the screen', () => {
  const run = (end, at = 10.5) => { const s = scored(), c = createCinema(); cue(c, s, 10, celebrating); end(s, c); return cue(c, s, at, {}); };
  assert.notEqual(run(() => {}), null);
  assert.equal(run(s => { s.phase = 'live'; }), null);
  assert.equal(run(() => {}, 10 + CINEMA.basket + 0.01), null);
  assert.equal(run((s, c) => skipClose(c)), null);
  const s = scored(), c = createCinema(); cue(c, s, 10, celebrating);
  assert.equal(cue(c, s, 10.2, {}, true), null, 'blocked');
});

test('scorers\' close-ups are CINEMA.gap apart, but a clinching basket always has one', () => {
  const c = createCinema(), first = scored();
  cue(c, first, 10, celebrating); skipClose(c);
  const second = scored(); second.last.score = { ...second.last.score };
  assert.equal(cue(c, second, 10 + CINEMA.gap - 1, celebrating), null);
  assert.equal(cue(c, second, 10 + CINEMA.gap - 1, { 1: { clip: 'armsUp', t: 0 } })?.kind, 'scorer');
  const third = scored(); third.last.score = { ...third.last.score }; skipClose(c);
  assert.equal(cue(c, third, 10 + 2 * CINEMA.gap, celebrating)?.kind, 'scorer');
});

test('the camera eases in from the game\'s, stands in front of the scorer looking at him and pushes in, and eases back out', () => {
  const s = scored(), c = createCinema(); cue(c, s, 10, celebrating);
  const p = s.players[1], at = t => closeUp(c, s, 10 + t);
  assert.equal(at(0).blend, 0);
  assert.ok(at(CINEMA.ease / 2).blend > 0.3 && at(CINEMA.ease / 2).blend < 0.7);
  assert.equal(at(1.4).blend, 1);
  assert.ok(at(CINEMA.basket - 0.01).blend < 0.05, 'back out by the end');
  const early = at(0.7), late = at(2.2), from = pose => Math.hypot(pose.at[0] - p.x, pose.at[2] - p.z);
  assert.ok(early.at[0] > p.x && Math.abs(early.look[0] - p.x) < 1e-9 && early.look[1] === CINEMA.look, 'in front of him (he faces +x), looking at him');
  assert.ok(from(late) < from(early), 'pushing in');
  assert.ok(Math.abs(early.at[0]) <= CINEMA.court.x && Math.abs(early.at[2]) <= CINEMA.court.z);
});

test('at a timeout the camera goes round the huddle of the team that called it; the card names it, or the scorer and his night', () => {
  const s = scored(); s.call = { kind: 'timeout', team: 1 }; s.huddle = null; startHuddle(s);
  const c = createCinema();
  assert.equal(cue(c, s, 5, {}).kind, 'huddle');
  const m = s.huddle.centres[1], a = closeUp(c, s, 6), b = closeUp(c, s, 8);
  assert.ok(Math.abs(Math.hypot(a.at[0] - m.x, a.at[2] - m.z) - CINEMA.ring) < 0.5 && a.look[0] === m.x);
  assert.notDeepEqual(a.at, b.at, 'going round');
  assert.match(closeCard(c, s).title, /HUDDLE$/);
  assert.match(closeCard(c, s).lines[0], /^Timeout · \d+ left$/);
  const t = scored(), c2 = createCinema(); cue(c2, t, 10, celebrating);
  Object.assign(personOf(t, t.players[1]).stats, { pts: 21, reb: 5, ast: 3, fgm: 8, fga: 14 });
  assert.deepEqual(closeCard(c2, t), { title: personOf(t, t.players[1]).name.toUpperCase(), lines: ['21 PTS · 5 REB · 3 AST · 8/14 FG'] });
});
