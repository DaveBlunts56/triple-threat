// Where the game's two cameras stand and look, worked out from the match: plain numbers, no Three.js, so the framing
// can be measured and tested without a browser (scene.js puts the camera there).
//
// Both cameras follow the ball, but frame the play round it: the point they follow leans toward the players who
// matter (the team with the ball in the half it attacks, and the player you control wherever he is), and they draw
// back, or widen, when those players spread out, so a corner shooter or a cutter on the weak side stays in the picture.
import { ARENA } from './layout.js';

const f = Object.freeze;

// The 2K camera, behind the team with the ball. height, back: how high it sits and how far behind the point it follows.
// ahead: how far beyond that point it looks. swing: the share of a turn to the other hoop it makes each frame. maxX:
// it never goes further along the court than this, so it stays out of the stands behind the baselines. fov: degrees.
export const BEHIND = f({ height: 6, back: 12.5, ahead: 5, fov: 42, swing: 0.1, maxX: 16 });
// The broadcast camera on the sideline (ARENA.camera: its height, distance back and how far it may slide).
export const BROADCAST = f({ ...ARENA.camera, lookZ: 1, fov: 40, minAcross: 60 });
// lean: the share of the way from the ball to the middle of the players who matter that the followed point goes, along
// the court and across it. backcourt: metres behind half court a player of the attacking team may be and still count
// (a guard bringing it up). wide, deep: how far across and along the court those players may spread round the point
// before the camera draws back; zoom: the most it draws back (or widens) by, and the 2K camera's height and view
// follow it this much of the way (rise, open). ease: the share of the way to its new framing it goes each frame.
// five: how much further back the 2K camera starts in five on five, where more players stand wider.
export const FRAME = f({ lean: f({ x: 0.35, z: 0.45 }), backcourt: 3, wide: 6.5, deep: 9.5, zoom: f({ most: 1.35, rise: 0.6, open: 0.35 }),
  ease: f({ point: 0.08, zoom: 0.04 }), five: 1.1 });

// The players the framing keeps in sight: the attacking team's, in its front court (and a little behind half court),
// and the player you control wherever he is, when you play. `sign`: the way the team with the ball attacks (+1: the
// hoop at +x).
export function relevant(state, sign) {
  const yours = (state.humans ?? [0]).includes(0) ? state.players[state.controlled] : null;
  return state.players.filter(p => p === yours || (p.team === state.possession && sign * p.x > -FRAME.backcourt));
}

// What the cameras aim for at this moment: the point to follow ({ x, z }) and how far to draw back (1 or more).
export function frameTarget(state, ball, sign) {
  const who = relevant(state, sign);
  if (!who.length) return { x: ball.x, z: ball.z, zoom: 1 };
  const mx = who.reduce((sum, p) => sum + p.x, 0) / who.length, mz = who.reduce((sum, p) => sum + p.z, 0) / who.length;
  const x = ball.x + (mx - ball.x) * FRAME.lean.x, z = ball.z + (mz - ball.z) * FRAME.lean.z;
  const across = Math.max(...who.map(p => Math.abs(p.z - z))), along = Math.max(...who.map(p => Math.abs(p.x - x)));
  const zoom = Math.min(FRAME.zoom.most, Math.max(1, across / FRAME.wide, along / FRAME.deep));
  return { x, z, zoom };
}

// The camera's own following: the point it follows, the way the 2K camera looks (`turn`, an angle: 0 toward +x, a half
// turn toward -x) and where it is turning to, and how far back it is drawn.
export const createFollow = () => ({ x: 0, z: 0, turn: 0, turnTo: 0, zoom: 1 });

// One frame of following the ball (`ball`, attacking toward `sign`) in `mode` ('2k' or 'broadcast'), eased.
export function stepFollow(follow, mode, state, ball, sign) {
  const aim = frameTarget(state, ball, sign);
  if (mode === 'broadcast') {
    follow.x += (Math.min(Math.max(aim.x, -BROADCAST.maxX), BROADCAST.maxX) - follow.x) * FRAME.ease.point;
    follow.z = 0;
  } else {
    follow.x += (aim.x - follow.x) * FRAME.ease.point;
    follow.z += (aim.z * 0.5 - follow.z) * FRAME.ease.point;
    follow.turnTo = sign > 0 ? 0 : Math.PI;
    follow.turn += (follow.turnTo - follow.turn) * BEHIND.swing;
  }
  follow.zoom += (aim.zoom - follow.zoom) * FRAME.ease.zoom;
  return follow;
}

// Where the camera stands and what it looks at, and its view (vertical degrees), for a window of `aspect` (width over
// height): { at: [x, y, z], look: [x, y, z], fov }. The broadcast camera stays where it stands (the arena is built
// round it: see layout.js) and widens its view instead; the 2K camera draws back and up, and a little wider.
export function poseOf(follow, mode, aspect, size = 3) {
  if (mode === 'broadcast') {
    const needed = 2 * Math.atan(Math.tan((BROADCAST.minAcross / 2) * Math.PI / 180) / aspect) * 180 / Math.PI;
    return { at: [follow.x, BROADCAST.height, BROADCAST.back], look: [follow.x, 0, BROADCAST.lookZ], fov: Math.max(BROADCAST.fov, needed) * follow.zoom };
  }
  const zoom = follow.zoom * (size === 5 ? FRAME.five : 1), hx = Math.cos(follow.turn), hz = -Math.sin(follow.turn);
  const back = BEHIND.back * zoom, x = Math.min(Math.max(follow.x - hx * back, -BEHIND.maxX), BEHIND.maxX);
  return { at: [x, BEHIND.height * (1 + (zoom - 1) * FRAME.zoom.rise), follow.z - hz * back],
    look: [follow.x + hx * BEHIND.ahead, 0, follow.z + hz * BEHIND.ahead], fov: BEHIND.fov * (1 + (zoom - 1) * FRAME.zoom.open) };
}
