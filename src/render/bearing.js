// Which way a player is drawn facing, how he leans, and where his head and chest turn. No Three.js here.
import { PLAYER } from '../sim/tuning.js';
import { attackSign } from '../sim/state.js';
import { rimCentre } from '../sim/ball.js';
import { MOTION, ARM_CLIPS, dist, nearestOpponent, defending } from './motion.js';
import { manOf } from '../sim/matchups.js';

const rad = degrees => (degrees * Math.PI) / 180;

const within = (value, most) => Math.max(-most, Math.min(most, value));   // held between -most and most

// The same angle, from -π (not included) to π. One already in that range is returned as it is.
const wrap = angle => angle - 2 * Math.PI * Math.ceil((angle - Math.PI) / (2 * Math.PI));

// The heading he is drawn with one frame of `dt` seconds after `drawn`: turned toward `wanted` the short way round, by
// MOTION.turnRate at most, so he never snaps round. From -π to π.
export function easeFacing(drawn, wanted, dt) {
  const gap = wrap(wanted - drawn), most = rad(MOTION.turnRate) * dt;
  return Math.abs(gap) <= most ? wrap(wanted) : wrap(drawn + Math.sign(gap) * most);
}

// How far his body tips one frame of `dt` seconds after `lean`, { forward, side } in radians: a positive forward puts
// his head ahead of his feet, a positive side puts it toward his left. `was` and `now` are his { vx, vz } one frame
// apart and `facing` the heading he is drawn with. He tips into the way he speeds up: his speeding up along his heading,
// and toward his left, as a share of PLAYER.accel, to MOTION.leanForward and MOTION.leanSide at most; off the floor not
// at all. The lean covers the share 1 - exp(-dt / MOTION.leanEase) of the way to that each frame.
export function leanOf(lean, was, now, facing, dt, grounded = true) {
  if (dt === 0) return lean;
  const ax = (now.vx - was.vx) / dt, az = (now.vz - was.vz) / dt;
  const share = a => (grounded ? within(a / PLAYER.accel, 1) : 0);
  const forward = share(ax * Math.cos(facing) + az * Math.sin(facing)) * rad(MOTION.leanForward);
  const side = share(ax * Math.sin(facing) - az * Math.cos(facing)) * rad(MOTION.leanSide);
  const k = 1 - Math.exp(-dt / MOTION.leanEase);
  return { forward: lean.forward + (forward - lean.forward) * k, side: lean.side + (side - lean.side) * k };
}

// Where `player`'s eyes are: MOTION.eye above his feet.
const eyes = player => ({ x: player.x, y: player.y + MOTION.eye, z: player.z });

// What `player` looks at, { x, y, z }, or null on the start and final screens, where the motion's own head stays. The
// first that fits: a shooter looks at the rim he attacks; the ball handler at the nearest opponent's eyes if he is within
// MOTION.guardDist and no more than MOTION.headBehind round from the way he faces (the rules' facing), otherwise at that
// rim; the passer, while his pass is in the air, at his receiver's eyes; a defender within MOTION.guardDist of his man
// at his man's eyes; anyone else, a shooter once the ball has left too, at the ball: a ball somebody holds at
// MOTION.ballHeld above its holder's feet, so that heads do not nod with its bounce, any other where it is.
export function lookTarget(state, player) {
  if (state.phase === 'start' || state.phase === 'final') return null;
  const { ball } = state, rim = rimCentre(attackSign(player.team));
  if (player.shooting) return rim;
  if (ball.holder === player.id) {
    const nearest = nearestOpponent(state, player);
    const round = wrap(Math.atan2(nearest.z - player.z, nearest.x - player.x) - player.facing);
    return dist(nearest, player) <= MOTION.guardDist && Math.abs(round) <= rad(MOTION.headBehind) ? eyes(nearest) : rim;
  }
  if (ball.mode === 'pass' && ball.noPickupId === player.id && ball.target !== null) return eyes(state.players[ball.target]);
  const man = manOf(state, player);
  if (defending(state, player) && dist(man, player) <= MOTION.guardDist) return eyes(man);
  return { x: ball.x, y: ball.holder === null ? ball.y : state.players[ball.holder].y + MOTION.ballHeld, z: ball.z };
}

// How far his head turns from the heading he is drawn with, `facing`, to look at `target` from his eyes, MOTION.eye
// above his feet: { yaw, pitch } in radians, yaw toward his right and pitch upward, held within MOTION.headYaw and
// MOTION.headPitch. No target, or one more than MOTION.headBehind round from his heading: no turn, he looks where he
// is going.
export function headTurn(player, facing, target) {
  if (!target) return { yaw: 0, pitch: 0 };
  const dx = target.x - player.x, dz = target.z - player.z, up = target.y - (player.y + MOTION.eye);
  const round = wrap(Math.atan2(dz, dx) - facing);
  if (Math.abs(round) > rad(MOTION.headBehind)) return { yaw: 0, pitch: 0 };
  return { yaw: within(round, rad(MOTION.headYaw)), pitch: within(Math.atan2(up, Math.hypot(dx, dz)), rad(MOTION.headPitch)) };
}

// The head one frame of `dt` seconds after `head`, both { yaw, pitch }: each covers the share
// 1 - exp(-MOTION.headEase * dt) of the way to `wanted`, and MOTION.headRate times `dt` at most.
export function easeHead(head, wanted, dt) {
  const k = 1 - Math.exp(-MOTION.headEase * dt), most = rad(MOTION.headRate) * dt;
  const toward = (from, to) => from + within((to - from) * k, most);
  return { yaw: toward(head.yaw, wanted.yaw), pitch: toward(head.pitch, wanted.pitch) };
}

const DRIBBLES = ['dribble', 'dribbleLeft'];

// How far to tip the chest forward over the pose the two layers give, in radians (negative: back). `pitch` is how far
// forward that pose's chest leans, in radians, and `arms` each arms-layer motion's share of it. The dribble was made on
// legs that lean, so on legs that lean less it asks for the chest to come forward to MOTION.chestDribble; the poses made
// by hand were made on upright legs, so on legs that lean more they ask for it to come back to MOTION.chestMade; the arms
// that follow the legs ask for nothing, and nor does a motion of the whole body (`whole`: their names), which brought
// its own legs. Each asks by its share.
export function chestTip(pitch, arms, whole = []) {
  let tip = 0;
  for (const name in arms) {
    if (whole.includes(name)) continue;
    if (DRIBBLES.includes(name)) tip += arms[name] * Math.max(0, rad(MOTION.chestDribble) - pitch);
    else if (ARM_CLIPS.includes(name)) tip += arms[name] * Math.min(0, rad(MOTION.chestMade) - pitch);
  }
  return tip;
}
