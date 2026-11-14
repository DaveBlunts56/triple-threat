import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, emptyIntent } from '../src/sim/state.js';
import { movePlayers, carryBall, jump } from '../src/sim/players.js';
import { DT, COURT, PLAYER, BALL } from '../src/sim/tuning.js';
import { plain } from './helpers.js';

// A match with everyone spread far apart so nobody bumps into the player under test.
function spread() {
  const s = plain(createMatch());   // plain players: these are the game's own speeds
  s.players.forEach((p, i) => { p.x = -10 + i * 4; p.z = -5; });
  return s;
}
const intentsFor = (id, intent) => Array.from({ length: 6 }, (_, i) => (i === id ? { ...emptyIntent(), ...intent } : emptyIntent()));
function run(s, seconds, intents) {
  for (let t = 0; t < seconds - 1e-9; t += DT) movePlayers(s, intents, DT);
}
const speed = p => Math.hypot(p.vx, p.vz);

test('reaches run speed 4.5 and sprint speed 6.3', () => {
  const s = spread();
  run(s, 1, intentsFor(0, { moveZ: 1 }));
  assert.ok(Math.abs(speed(s.players[0]) - 4.5) < 0.05);
  run(s, 1, intentsFor(0, { moveZ: 1, sprint: true }));
  assert.ok(Math.abs(speed(s.players[0]) - 6.3) < 0.05);
  assert.deepEqual([PLAYER.run, PLAYER.sprint], [4.5, 6.3]);
});

test('diagonal input is no faster than straight', () => {
  const s = spread();
  run(s, 1, intentsFor(0, { moveX: 1, moveZ: 1 }));
  assert.ok(speed(s.players[0]) <= PLAYER.run + 0.05, `speed ${speed(s.players[0])}`);
  assert.ok(speed(s.players[0]) >= PLAYER.run - 0.1);
});

test('stops when input is released', () => {
  const s = spread();
  run(s, 1, intentsFor(0, { moveZ: 1 }));
  run(s, 0.5, intentsFor(0, {}));
  assert.ok(speed(s.players[0]) < 0.1);
});

test('faces the direction of travel', () => {
  const s = spread();
  run(s, 1, intentsFor(0, { moveZ: 1 }));
  assert.ok(Math.abs(s.players[0].facing - Math.PI / 2) < 0.05);
});

test('jump rises about 0.82 m and lands', () => {
  const s = spread(), p = s.players[0];
  jump(p);
  let peak = 0;
  for (let t = 0; t < 1; t += DT) { movePlayers(s, intentsFor(0, {}), DT); peak = Math.max(peak, p.y); }
  assert.ok(Math.abs(peak - (PLAYER.jumpV ** 2) / (2 * BALL.gravity)) < 0.05, `peak ${peak}`);
  assert.equal(p.y, 0);
  assert.equal(p.vy, 0);
});

test('jump does nothing in the air', () => {
  const s = spread(), p = s.players[0];
  jump(p);
  run(s, 0.2, intentsFor(0, {}));
  const vy = p.vy;
  jump(p);
  assert.equal(p.vy, vy);
});

test('movement input is ignored in the air', () => {
  const s = spread(), p = s.players[0];
  jump(p);
  run(s, 0.3, intentsFor(0, { moveZ: 1 }));
  assert.equal(speed(p), 0);
});

test('overlapping players are pushed apart', () => {
  const s = spread(), [a, b] = s.players;
  b.x = a.x + 0.2; b.z = a.z;
  run(s, 0.5, intentsFor(0, {}));
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 2 * PLAYER.radius - 1e-6);
});

test('identical positions separate without NaN', () => {
  const s = spread(), [a, b] = s.players;
  b.x = a.x; b.z = a.z;
  run(s, 0.1, intentsFor(0, {}));
  for (const p of [a, b]) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 0);
});

test('players cannot leave the court margin', () => {
  const s = spread();
  run(s, 10, intentsFor(0, { moveX: 1, moveZ: 1 }));
  assert.ok(s.players[0].x <= COURT.halfLength + COURT.margin + 1e-9);
  assert.ok(s.players[0].z <= COURT.halfWidth + COURT.margin + 1e-9);
});

test('inbounder does not move and is not pushed', () => {
  const s = spread(), [a, b] = s.players;
  a.inbounder = true; a.x = 0; a.z = 8.5;
  b.x = 0.1; b.z = 8.5;
  run(s, 0.5, intentsFor(0, { moveX: 1 }));
  assert.equal(a.x, 0);
  assert.equal(a.z, 8.5);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 2 * PLAYER.radius - 1e-6);
});

test('held ball follows its holder', () => {
  const s = spread(), p = s.players[0];
  s.ball.holder = 0; s.ball.mode = 'held';
  p.facing = Math.PI / 2;
  carryBall(s, DT);
  assert.ok(Math.abs(Math.hypot(s.ball.x - p.x, s.ball.z - p.z) - 0.4) < 0.05);
  assert.ok(s.ball.z > p.z);
});

test('ball rises with a jumping holder', () => {
  const s = spread(), p = s.players[0];
  s.ball.holder = 0; s.ball.mode = 'held';
  carryBall(s, DT);
  const standing = s.ball.y;
  p.y = 0.5;
  carryBall(s, DT);
  assert.ok(s.ball.y >= standing + 0.5 - 1e-9);
});

test('jumping while sprinting keeps only a little of the run-up', () => {
  const s = spread(), p = s.players[0];
  run(s, 1, intentsFor(0, { moveZ: 1, sprint: true }));
  const z = p.z;
  jump(p);
  run(s, 0.9, intentsFor(0, {}));
  assert.equal(p.y, 0);
  assert.ok(p.z - z < 1.6, `flew ${p.z - z} m`);
});

test('a ball carrier is slower than a free runner', () => {
  const s = spread();
  s.ball.holder = 0; s.ball.mode = 'held';
  run(s, 1, [intentsFor(0, { moveZ: 1, sprint: true })[0], intentsFor(0, { moveZ: 1, sprint: true })[0], ...intentsFor(9, {}).slice(2)]);
  assert.ok(speed(s.players[0]) < speed(s.players[1]) - 0.5, `${speed(s.players[0])} vs ${speed(s.players[1])}`);
  assert.ok(Math.abs(speed(s.players[1]) - PLAYER.sprint) < 0.05);
});
