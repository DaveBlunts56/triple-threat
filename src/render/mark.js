import { manOf, guardOf } from '../sim/matchups.js';

// The arrow and the ring that show the player you control who his man is. colour: of both, so that they do not read
// as your own ring. near: metres within which the arrow is left out and the ring alone shows. start, stop: how far from
// your player the arrow begins, and how far short of the man it ends. wide, head: the shaft's width and the head's
// length, in metres.
export const MARK = Object.freeze({ colour: 0xff5a3c, near: 1.5, start: 0.6, stop: 0.7, wide: 0.16, head: 0.45 });

// What to draw on the floor, or null when nothing is: only live play and inbounds have it, and only in a match you play. Your team defending: a ring
// under your man, and an arrow toward him from your player ({ x, z }: its tail; angle: measured as a player's facing
// is; length: tail to tip) unless he is near. Your team attacking: a ring under the defender guarding you, no arrow.
export function matchupMark(state) {
  if (state.phase !== 'live' && state.phase !== 'inbound') return null;
  if (!(state.humans ?? [0]).includes(0)) return null;   // in a match nobody plays there is no player of yours
  const me = state.players[state.controlled];
  const other = state.possession === me.team ? guardOf(state, me) : manOf(state, me);
  const ring = { x: other.x, z: other.z }, dx = other.x - me.x, dz = other.z - me.z, far = Math.hypot(dx, dz);
  if (state.possession === me.team || far <= MARK.near) return { ring, arrow: null };
  return { ring, arrow: { x: me.x + (dx / far) * MARK.start, z: me.z + (dz / far) * MARK.start, angle: Math.atan2(dz, dx), length: far - MARK.start - MARK.stop } };
}
