import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPLAY, clear, createRecorder, due, frameAt, mark, record, settle, skip, start, stopped } from '../src/replay.js';
import { KINDS, createWatch, watchStep } from '../src/broadcast/moments.js';
import { createMatch } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { DT } from '../src/sim/tuning.js';

const moment = (kind, at, more = {}) => ({ kind, moment: true, star: true, rank: KINDS.indexOf(kind), team: 0, row: 0, name: 'Cross', at, ...more });
// A match that only counts time, recorded for `seconds`: each frame knows its own time.
function rolling(seconds, rec = createRecorder(), s = Object.assign(createMatch(1, 3), { phase: 'live' })) {
  for (let t = 0; t < seconds - DT / 2; t += DT) { s.time += DT; record(rec, s); settle(rec, s); }
  return [rec, s];
}

test('the recorder keeps the last sixteen seconds of the match, a frame a step, each a copy', () => {
  const [rec, s] = rolling(20);
  const span = rec.frames[rec.frames.length - 1].time - rec.frames[0].time;
  assert.ok(Math.abs(span - REPLAY.keep) <= 2 * DT, `spans ${span}`);
  assert.ok(Math.abs(rec.frames.length - REPLAY.keep * 60) <= 2);
  s.score[0] = 99;
  assert.equal(rec.frames[rec.frames.length - 1].score[0], 0);        // a copy: what the match does next is not in it
  assert.notEqual(rec.frames[rec.frames.length - 1], s);
});

test('a moment\'s frames are set aside a second after it: the four seconds before it and the one after', () => {
  const [rec, s] = rolling(10);
  mark(rec, moment('block', s.time));
  const at = s.time;
  rolling(0.9, rec, s);
  assert.equal(rec.held, null);                                        // its second has not passed
  rolling(0.2, rec, s);
  assert.ok(rec.held && !rec.waiting);
  const { frames } = rec.held;
  assert.ok(Math.abs(frames[0].time - (at - REPLAY.before)) <= DT && Math.abs(frames[frames.length - 1].time - (at + REPLAY.after)) <= DT);
  assert.ok(Math.abs(frames.length - 5 * 60) <= 2);
});

test('when the match ends the frames there are are set aside at once', () => {
  const [rec, s] = rolling(10);
  mark(rec, moment('buzzer', s.time));
  s.phase = 'final'; settle(rec, s);
  assert.ok(rec.held);
  assert.ok(Math.abs(rec.held.frames.length - 4 * 60) <= 2);           // nothing after it: the match is over
});

test('a game-winner is shown from the basket, though it is only called when the match ends', () => {
  const [rec, s] = rolling(30);
  const basket = s.time - 9;                                           // the shot went in nine seconds before the end
  s.phase = 'final';
  mark(rec, moment('winner', s.time), basket);
  settle(rec, s);
  assert.ok(Math.abs(rec.held.frames[0].time - (basket - REPLAY.before)) <= DT);
});

test('a bigger moment takes the place of a smaller one waiting or set aside, and a smaller one does not', () => {
  const [rec, s] = rolling(10);
  mark(rec, moment('poster', s.time)); mark(rec, moment('block', s.time));
  assert.equal(rec.waiting.kind, 'block');
  mark(rec, moment('poster', s.time));
  assert.equal(rec.waiting.kind, 'block');
  rolling(1.1, rec, s);
  assert.equal(rec.held.kind, 'block');
  mark(rec, moment('andOne', s.time)); rolling(1.1, rec, s);
  assert.equal(rec.held.kind, 'block');                                // and-one is the smaller
  mark(rec, moment('buzzer', s.time)); rolling(1.1, rec, s);
  assert.equal(rec.held.kind, 'buzzer');
});

test('a replay is due only when one is set aside and play has stopped', () => {
  const [rec, s] = rolling(10);
  assert.equal(due(rec, s), false);
  mark(rec, moment('block', s.time)); rolling(1.1, rec, s);
  assert.equal(due(rec, s), false);                                    // play is on
  for (const phase of ['dead', 'quarterEnd', 'final']) { s.phase = phase; assert.equal(stopped(s), true); assert.equal(due(rec, s), true, phase); }
  for (const phase of ['live', 'inbound', 'freeThrow', 'jumpBall']) { s.phase = phase; assert.equal(due(rec, s), false, phase); }
});

test('no replay within twenty seconds of the last, except a buzzer-beater or a game-winner', () => {
  const [rec, s] = rolling(10);
  mark(rec, moment('block', s.time)); rolling(1.1, rec, s);
  s.phase = 'dead'; start(rec, s); skip(rec); s.phase = 'live';
  rolling(5, rec, s);
  mark(rec, moment('andOne', s.time)); rolling(1.1, rec, s);
  s.phase = 'dead';
  assert.equal(due(rec, s), false);                                    // six seconds after the last
  s.phase = 'live'; rolling(15, rec, s); s.phase = 'dead';
  assert.equal(due(rec, s), true);                                     // twenty-one
  const [again, t] = rolling(10);
  mark(again, moment('block', t.time)); rolling(1.1, again, t);
  t.phase = 'dead'; start(again, t); skip(again); t.phase = 'live';
  mark(again, moment('buzzer', t.time)); rolling(1.1, again, t);
  t.phase = 'quarterEnd';
  assert.equal(due(again, t), true);
});

test('a replay plays the frames that were recorded, in order, at half speed, and then it is over', () => {
  const [rec, s] = rolling(10);
  mark(rec, moment('block', s.time)); rolling(1.1, rec, s);
  const frames = [...rec.held.frames];
  s.phase = 'dead'; start(rec, s);
  assert.equal(due(rec, s), false);                                    // not another while it plays
  const drawn = [];
  let real = 0;
  for (let frame; (frame = frameAt(rec, DT)); real += DT) drawn.push(frame);
  assert.ok(Math.abs(real - 10) < 0.1, `${real} s for five seconds of the match`);
  assert.equal(rec.playing, null);
  for (let i = 1; i < drawn.length; i++) assert.ok(drawn[i].time >= drawn[i - 1].time);
  assert.deepEqual([...new Set(drawn)].length, frames.length);        // every recorded frame is shown
  for (const frame of drawn) assert.ok(frames.includes(frame));        // and nothing that was not recorded
  assert.equal(frameAt(rec, DT), null);
});

test('skipping ends it; clearing forgets everything', () => {
  const [rec, s] = rolling(10);
  mark(rec, moment('block', s.time)); rolling(1.1, rec, s);
  s.phase = 'dead'; start(rec, s);
  assert.ok(frameAt(rec, DT));
  skip(rec);
  assert.deepEqual([rec.playing, frameAt(rec, DT)], [null, null]);
  clear(rec);
  assert.deepEqual(rec, createRecorder());
});

test('a new match starts the recording again', () => {
  const [rec, s] = rolling(10);
  mark(rec, moment('block', s.time));
  const next = Object.assign(createMatch(2, 3), { phase: 'live', time: 0.5 });
  record(rec, next);
  assert.deepEqual([rec.frames.length, rec.waiting, rec.held], [1, null, null]);
});

test('recording, setting aside and replaying change nothing in the match, step for step, through a whole one', () => {
  const s = createMatch(6, 3), twin = createMatch(6, 3), rec = createRecorder(), watch = createWatch();
  startMatch(s); startMatch(twin);
  let steps = 0, replays = 0;
  while (s.phase !== 'final' && steps++ < 60 * 60 * 40) {
    const events = step(s, aiIntents(s, DT), DT);
    step(twin, aiIntents(twin, DT), DT);
    record(rec, s);
    for (const h of watchStep(watch, s, events)) if (h.star) mark(rec, h);
    settle(rec, s);
    if (due(rec, s)) { start(rec, s); replays++; while (frameAt(rec, DT)) { /* the match waits while it plays */ } }
    if (steps % 600 === 0) assert.equal(JSON.stringify(s), JSON.stringify(twin), `step ${steps}`);
  }
  assert.equal(JSON.stringify(s), JSON.stringify(twin));
  assert.ok(replays >= 1, `${replays} replays`);
});

test('a copy of the match takes well under a millisecond', () => {
  const s = createMatch(1, 5); startMatch(s);
  for (let i = 0; i < 600; i++) step(s, aiIntents(s, DT), DT);
  const from = performance.now();
  for (let i = 0; i < 600; i++) structuredClone(s);
  const each = (performance.now() - from) / 600;
  assert.ok(each < 1, `${each.toFixed(3)} ms a copy`);
});
