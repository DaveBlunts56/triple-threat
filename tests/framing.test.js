import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEHIND, BROADCAST, FRAME, createFollow, frameTarget, poseOf, relevant, stepFollow } from '../src/render/framing.js';
import { ARENA } from '../src/render/layout.js';
import { createMatch } from '../src/sim/state.js';

// A five-on-five match with team 0 attacking the hoop at +x, its players put where `spots` says ([x, z] each).
function placed(spots, controlled = 0) {
  const s = createMatch(1, 5);
  s.possession = 0; s.controlled = controlled;
  s.players.filter(p => p.team === 0).forEach((p, i) => { [p.x, p.z] = spots[i]; });
  s.players.filter(p => p.team === 1).forEach((p, i) => { [p.x, p.z] = [spots[i][0] + 1, spots[i][1]]; });
  return s;
}
const ball = (x, z) => ({ x, y: 1, z });

test('the players kept in sight: the attacking team in its half (and just behind it), and yours wherever he is', () => {
  const s = placed([[8, 0], [12, -6.5], [12, 6.5], [-FRAME.backcourt + 0.5, 1], [-9, -2]], 4);
  const who = relevant(s, 1).map(p => p.id);
  assert.deepEqual(who, [0, 1, 2, 3, 4]);   // the fifth is far back, but he is yours
  s.controlled = 0;
  assert.deepEqual(relevant(s, 1).map(p => p.id), [0, 1, 2, 3]);
  s.humans = [];
  assert.deepEqual(relevant(s, 1).map(p => p.id), [0, 1, 2, 3], 'in Watch, nobody is yours');
});

test('the camera aims between the ball and the players, and draws back only when they spread out, never past its most', () => {
  const tight = placed([[9, 0], [10, 1], [10, -1], [11, 2], [11, -2]]);
  const t = frameTarget(tight, ball(9, 0), 1);
  assert.equal(t.zoom, 1);
  const wide = placed([[8, 0], [13, -6.8], [13, 6.8], [9, -5], [9, 5]]);
  const w = frameTarget(wide, ball(8, -1), 1);
  assert.ok(w.zoom > 1 && w.zoom <= FRAME.zoom.most, `${w.zoom}`);
  assert.ok(w.x > 8 && w.x < 10.2, `${w.x}: leans from the ball toward the players`);
  const far = placed([[0, 0], [14, -12], [14, 12], [-2, -12], [-2, 12]]);   // wider than any court: held to the most
  assert.equal(frameTarget(far, ball(0, 0), 1).zoom, FRAME.zoom.most);
});

test('the broadcast camera stays where the arena is built round it and widens its view instead; the 2K camera draws back and up', () => {
  const follow = { ...createFollow(), x: 30, zoom: 1 };
  const near = poseOf(follow, 'broadcast', 16 / 9);
  assert.deepEqual(near.at.slice(1), [ARENA.camera.height, ARENA.camera.back]);
  follow.x = 5;
  const [base, wider] = [poseOf({ ...follow, zoom: 1 }, 'broadcast', 16 / 9), poseOf({ ...follow, zoom: 1.3 }, 'broadcast', 16 / 9)];
  assert.ok(Math.abs(wider.fov - base.fov * 1.3) < 1e-9 && wider.at[0] === base.at[0]);
  assert.ok(poseOf(follow, 'broadcast', 0.6).fov > BROADCAST.fov, 'a narrow window sees wider');
  const [close, back] = [poseOf({ ...createFollow(), zoom: 1 }, '2k', 16 / 9), poseOf({ ...createFollow(), zoom: 1.3 }, '2k', 16 / 9)];
  assert.deepEqual([close.at[0], close.at[1], close.fov], [-BEHIND.back, BEHIND.height, BEHIND.fov]);
  assert.ok(back.at[0] < close.at[0] && back.at[1] > close.at[1] && back.fov > close.fov);
  assert.ok(poseOf({ ...createFollow(), x: -10, zoom: 1.35 }, '2k', 16 / 9).at[0] >= -BEHIND.maxX, 'never into the stands behind the baseline');
  assert.ok(poseOf({ ...createFollow(), zoom: 1 }, '2k', 16 / 9, 5).at[0] < close.at[0], 'five on five starts further back');
});

test('the camera eases to its framing a little each frame, and turns to face the hoop the ball goes to', () => {
  const s = placed([[8, 0], [13, -6.8], [13, 6.8], [9, -5], [9, 5]]), follow = createFollow();
  stepFollow(follow, '2k', s, ball(8, -1), 1);
  assert.ok(follow.x > 0 && follow.x < 2 && follow.zoom > 1 && follow.zoom < 1.05, JSON.stringify(follow));
  for (let i = 0; i < 400; i++) stepFollow(follow, '2k', s, ball(8, -1), 1);
  const aim = frameTarget(s, ball(8, -1), 1);
  assert.ok(Math.abs(follow.x - aim.x) < 0.01 && Math.abs(follow.zoom - aim.zoom) < 0.01);
  s.possession = 1;
  for (let i = 0; i < 100; i++) stepFollow(follow, '2k', s, ball(-8, 0), -1);
  assert.ok(Math.abs(follow.turn - Math.PI) < 0.01);
  stepFollow(follow, 'broadcast', s, ball(40, 0), -1);
  for (let i = 0; i < 400; i++) stepFollow(follow, 'broadcast', s, ball(40, 0), -1);
  assert.ok(follow.x <= BROADCAST.maxX + 1e-9);
});
