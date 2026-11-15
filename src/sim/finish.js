// Finishes at the rim: when a layup or a dunk may begin, with which hand, and where its two steps and its jump carry
// him. Pure: it reads the match and changes nothing.
import { BALL, BOARD, FINISH, RIM, SHOT } from './tuning.js';
import { attackSign, personOf } from './state.js';
import { rimCentre } from './ball.js';
import { rated } from './ratings.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const hoopOf = player => rimCentre(attackSign(player.team));

// Behind the backboard of the hoop he attacks, with the board between him and the rim.
export function behindBoard(player) {
  const x = attackSign(player.team) * player.x;
  if (x <= BOARD.x) return false;
  const crossing = player.z * (BOARD.x - RIM.x) / (x - RIM.x);   // where his straight line to the rim centre meets the board's plane
  return Math.abs(crossing) <= BOARD.halfWidth + BALL.radius;
}

// His speed toward `hoop`, in metres a second: less than nothing going away from it.
export function closing(player, hoop) {
  const far = dist(player, hoop) || 1;
  return (player.vx * (hoop.x - player.x) + player.vz * (hoop.z - player.z)) / far;
}

export const canDunk = (state, player) => rated(state, player, 'inside') >= FINISH.dunkAt && personOf(state, player).energy >= FINISH.dunkEnergy;

// What the key `key` ('shoot' or 'dunk') begins for a player with the ball on the floor: 'layup', 'dunk', or null:
// for the shot key the jump shot, for the dunk key nothing. A finish needs him driving at the rim from in front of the
// board's plane, within range; a dunk needs a finisher with legs left, and anybody else lays it up.
export function finishFor(state, player, key) {
  const hoop = hoopOf(player), far = dist(player, hoop);
  const inFront = attackSign(player.team) * player.x < BOARD.x && !behindBoard(player);
  if (!inFront || far < FINISH.layupNear || far > FINISH.layupFar || closing(player, hoop) < FINISH.drive) return null;
  return key === 'dunk' && canDunk(state, player) ? 'dunk' : 'layup';
}

// The hand he finishes with: the one on the side of the rim he comes from; from straight on, his right. Facing the
// baseline his right is toward +z for the team attacking +x, and toward -z for the other.
export const finishHand = player => (attackSign(player.team) * player.z < -0.2 ? 'left' : 'right');

// Where he leaves the floor: FINISH.takeoff from the rim's centre on the line from the rim to him, or where he is if
// he is nearer than that already.
export function takeoffSpot(player, finish) {
  const hoop = hoopOf(player), far = dist(player, hoop);
  if (far <= FINISH.takeoff[finish]) return { x: player.x, z: player.z };
  const k = FINISH.takeoff[finish] / far;
  return { x: hoop.x + (player.x - hoop.x) * k, z: hoop.z + (player.z - hoop.z) * k };
}

const toward = (player, point, speed) => {
  const far = dist(player, point);
  return far < 1e-9 || speed <= 0 ? { vx: 0, vz: 0 } : { vx: ((point.x - player.x) / far) * speed, vz: ((point.z - player.z) / far) * speed };
};

// How the two steps carry him: at the take-off spot as the gather ends, never faster than FINISH.gatherSpeed.
export function gatherVelocity(player, finish) {
  const spot = takeoffSpot(player, finish);
  return toward(player, spot, Math.min(FINISH.gatherSpeed, dist(player, spot) / FINISH.gather));
}

// Seconds from the take-off to the finish's moment: FINISH.dunkMoment of the jump for a dunk, SHOT.bestAt of the way
// up for a layup.
export const momentOf = finish => (finish === 'dunk' ? FINISH.dunkMoment * 2 : SHOT.bestAt) * FINISH.jump[finish] / BALL.gravity;

// How the jump carries him: FINISH.arrive in front of the rim's centre at the finish's moment; never away from it.
export function jumpVelocity(player, finish) {
  const hoop = hoopOf(player);
  return toward(player, hoop, Math.max(0, dist(player, hoop) - FINISH.arrive[finish]) / momentOf(finish));
}
