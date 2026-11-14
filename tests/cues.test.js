import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUE, createEars, frameCues, listen } from '../src/audio/cues.js';
import { createLife } from '../src/render/life.js';
import { SOUNDS } from '../src/render/assets.js';
import { createWatch, watchStep } from '../src/broadcast/moments.js';
import { createMatch, emptyEvents } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { DT, PLAYER } from '../src/sim/tuning.js';
import { live } from './helpers.js';

// A live match the ears have listened to once, so that only what happens next is heard.
function heardOnce(s = live()) {
  const ears = createEars();
  s.players.forEach(p => { p.vx = 0; p.vz = 0; });
  listen(ears, s, emptyEvents());
  return [s, ears];
}
// One more step in which `events` happen (the match's clock moves on).
const then = (s, ears, events = {}) => { s.time += DT; listen(ears, s, { ...emptyEvents(), ...events }); return ears.queue.splice(0).map(c => c.name); };
const names = cues => cues.shots.map(c => c.name);

test('a ball that bounces is heard, quieter the lower the bounce, each of three takes in turn; one that rolls is not', () => {
  const [s, ears] = heardOnce();
  s.ball.holder = null; s.ball.mode = 'loose';
  const out = [];
  for (const vy of [5, 3, 1]) { s.ball.vy = vy; s.time += 0.5; listen(ears, s, { ...emptyEvents(), hitFloor: true }); out.push(...ears.queue.splice(0)); }
  assert.deepEqual(out.map(c => c.name), ['bounce1', 'bounce2', 'bounce3']);
  assert.ok(out[0].gain > out[1].gain && out[1].gain > out[2].gain && out[2].gain >= 0.25);
  s.ball.vy = 0.2;
  assert.deepEqual(then(s, ears, { hitFloor: true }), []);
});

test('the rim and the backboard are heard when the ball hits them, the two rim takes in turn', () => {
  const [s, ears] = heardOnce();
  s.ball.holder = null; s.ball.mode = 'shot';
  assert.deepEqual(then(s, ears, { hitRim: true }), ['rim1']);
  s.time += 0.2;
  assert.deepEqual(then(s, ears, { hitRim: true }), ['rim2']);
  assert.deepEqual(then(s, ears, { hitRim: true }), []);              // the next step: the same touch
  s.time += 0.2;
  assert.deepEqual(then(s, ears, { hitBoard: true }), ['board']);
});

test('a basket that touched nothing swishes; one that touched the rim or the glass drops through the net', () => {
  const [s, ears] = heardOnce();
  s.ball.holder = null; s.ball.mode = 'shot';
  then(s, ears, { release: { shooter: 0 } });
  assert.deepEqual(then(s, ears, { scored: 1 }), ['swish']);
  then(s, ears, { release: { shooter: 0 } }); s.time += 0.3;
  then(s, ears, { hitRim: true }); s.time += 0.3;
  assert.deepEqual(then(s, ears, { scored: 1 }), ['net']);
  then(s, ears, { release: { shooter: 0 } });
  assert.deepEqual(then(s, ears, { scored: 1 }), ['swish']);          // the touch was the last shot's
});

test('a dribble is heard at its own beat while he runs with the ball, and not while he stands or holds it', () => {
  const [s, ears] = heardOnce();
  s.players[0].vx = 3;
  let beats = 0;
  for (let i = 0; i < 120; i++) beats += then(s, ears).filter(n => n.startsWith('bounce')).length;   // two seconds
  assert.ok(Math.abs(beats - 2 * PLAYER.dribbleRate) <= 1, `${beats} beats`);   // two a second, give or take the one on the edge
  s.players[0].vx = 0;
  let still = 0;
  for (let i = 0; i < 120; i++) still += then(s, ears).length;
  assert.equal(still, 0);
  s.players[0].vx = 3; s.players[0].held = true;
  for (let i = 0; i < 120; i++) still += then(s, ears).filter(n => n.startsWith('bounce')).length;
  assert.equal(still, 0);
});

test('a pass caught is heard', () => {
  const [s, ears] = heardOnce();
  s.ball.holder = null; s.ball.mode = 'pass'; then(s, ears);
  s.ball.holder = 1; s.ball.mode = 'held';
  assert.deepEqual(then(s, ears), ['catch']);
});

test('a player who stops dead from a sprint squeaks once, not on every step; one who jogs to a stop does not', () => {
  const [s, ears] = heardOnce();
  s.ball.holder = null;
  const run = (speed, steps) => { let out = []; s.players[4].vx = speed; for (let i = 0; i < steps; i++) out.push(...then(s, ears)); return out; };
  run(6, 20);
  const stopped = run(0, 40);
  assert.deepEqual(stopped.filter(n => n.startsWith('squeak')).length, 1);
  run(2, 20);
  assert.deepEqual(run(0, 40).filter(n => n.startsWith('squeak')), []);
});

test('a sharp cut at speed squeaks, and so does the start of a move', () => {
  const [s, ears] = heardOnce();
  s.ball.holder = null;
  s.players[4].vx = 5; for (let i = 0; i < 20; i++) then(s, ears);
  s.players[4].vx = 0; s.players[4].vz = 5;
  let out = []; for (let i = 0; i < 12; i++) out.push(...then(s, ears));
  assert.equal(out.filter(n => n.startsWith('squeak')).length, 1);
  s.time += 1.5;
  s.players[2].move = { kind: 'cross', t: 0, dx: 0, dz: 1, cx: 0, cz: 0, push: 1 };
  assert.equal(then(s, ears).filter(n => n.startsWith('squeak')).length, 1);
});

test('a whistle for a call, the buzzer for the shot clock, and the horn with a long whistle at the end of a period', () => {
  const [s, ears] = heardOnce();
  s.call = { kind: 'travel', team: 0 };
  assert.deepEqual(then(s, ears), ['whistle']);
  assert.deepEqual(then(s, ears), []);
  s.call = { kind: 'shotClock', team: 0 };
  assert.deepEqual(then(s, ears), ['buzzer']);
  s.phase = 'quarterEnd';
  assert.deepEqual(then(s, ears), ['horn', 'whistleLong']);
  assert.deepEqual(then(s, ears), []);
});

test('the home crowd cheers its baskets, louder for a three and loudest for a big moment, and groans at the visitors\'', () => {
  const [s, ears] = heardOnce();
  const life = createLife();
  const hear = h => frameCues(ears, s, [h], life).shots;
  const two = hear({ kind: 'made', moment: false, team: 0, points: 2 }), three = hear({ kind: 'made', moment: false, team: 0, points: 3 });
  assert.deepEqual([two[0].name, three[0].name], ['cheer', 'cheer']);
  assert.ok(three[0].gain > two[0].gain);
  assert.deepEqual(names(frameCues(ears, s, [{ kind: 'deep', moment: true, team: 0 }], life)), ['cheerBig']);
  assert.deepEqual(names(frameCues(ears, s, [{ kind: 'made', moment: false, team: 1, points: 2 }], life)), ['groan']);
  assert.deepEqual(names(frameCues(ears, s, [{ kind: 'block', moment: true, team: 1 }], life)), ['groan']);
  assert.deepEqual(names(frameCues(ears, s, [{ kind: 'rebound', moment: false, team: 0 }], life)), []);
});

test('a call against the home team is booed, once', () => {
  const [s, ears] = heardOnce(), life = createLife();
  life.boo = 2.6;
  assert.deepEqual(names(frameCues(ears, s, [], life)), ['boo']);
  life.boo = 2.5;
  assert.deepEqual(names(frameCues(ears, s, [], life)), []);
});

test('the murmur is louder in a close game late on, thinner when the crowd has left, and the free-throw noise is on for a visitor at the line', () => {
  const life = createLife(), ears = createEars();
  const at = (quarter, clock, score, left = 0, distract = 0) => {
    const s = live(); Object.assign(s, { quarter, gameClock: clock, score }); Object.assign(life, { left, distract });
    return frameCues(ears, s, [], life);
  };
  const early = at(1, 170, [4, 2]), late = at(4, 30, [60, 60]), blowout = at(4, 30, [80, 50]), empty = at(4, 30, [80, 50], 0.45);
  assert.ok(late.bed > early.bed && late.bed > blowout.bed && blowout.bed > empty.bed, JSON.stringify([early.bed, late.bed, blowout.bed, empty.bed]));
  assert.ok(empty.bed >= 0.05 && late.bed <= 1);
  assert.equal(at(2, 90, [20, 20], 0, -1).distract, CUE.distract);
  assert.equal(at(2, 90, [20, 20]).distract, 0);
  const menu = frameCues(ears, createMatch(), [], createLife());
  assert.deepEqual([menu.bed, menu.distract], [CUE.bedMenu, 0]);
});

test('no two hits are played at quite the same speed, and every speed is within a tenth of true', () => {
  const [s, ears] = heardOnce();
  s.ball.holder = null; s.ball.mode = 'loose'; s.ball.vy = 4;
  const rates = [];
  for (let i = 0; i < 6; i++) { s.time += 0.5; listen(ears, s, { ...emptyEvents(), hitFloor: true }); rates.push(ears.queue.pop().rate); }
  assert.equal(new Set(rates).size, 6);
  for (const rate of rates) assert.ok(Math.abs(rate - 1) <= 0.06 + 1e-9);
});

test('through a whole match every sound asked for is one the game has, the ears change nothing, and draw no number', () => {
  const s = createMatch(7, 3), twin = createMatch(7, 3), ears = createEars(), watch = createWatch(), life = createLife();
  startMatch(s); startMatch(twin);
  const counts = {};
  let steps = 0;
  while (s.phase !== 'final' && steps++ < 60 * 60 * 40) {
    const events = step(s, aiIntents(s, DT), DT);
    step(twin, aiIntents(twin, DT), DT);
    listen(ears, s, events);
    for (const c of frameCues(ears, s, watchStep(watch, s, events), life).shots) {
      assert.ok(SOUNDS.includes(c.name), c.name);
      assert.ok(c.gain > 0 && c.gain <= 1);
      counts[c.name] = (counts[c.name] ?? 0) + 1;
    }
    if (steps % 900 === 0) assert.equal(JSON.stringify(s), JSON.stringify(twin), `step ${steps}`);
  }
  assert.equal(JSON.stringify(s), JSON.stringify(twin));               // the seed is part of the state: nothing was drawn
  for (const name of ['bounce1', 'rim1', 'net', 'catch', 'squeak1', 'whistle', 'horn', 'cheer', 'groan']) assert.ok(counts[name] > 0, `${name} never heard: ${JSON.stringify(counts)}`);
  const minutes = s.time / 60, squeaks = counts.squeak1 + counts.squeak2 + counts.squeak3;
  assert.ok(squeaks / minutes > 4 && squeaks / minutes < 45, `${(squeaks / minutes).toFixed(0)} squeaks a minute`);
});
