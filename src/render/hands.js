// Where the ball is drawn while a player has it: in his hands, bouncing under one, or crossing between them. No Three.js here.
import { MOTION } from './motion.js';

// The ball as it is drawn in a holder's hands. blend: seconds over which it is drawn across to a new place whenever
// the way it is carried changes (see carrying): it comes to a player, leaves one, or goes from one hand to both or back.
// palm: metres from the wrist bone, toward the fingers, to where the ball sits.
export const BALL_IN_HAND = Object.freeze({ blend: 0.1, palm: 0.1 });

// The point `share` of the way from `a` to `b`, each { x, y, z }.
const between = (a, b, share) => ({
  x: a.x * (1 - share) + b.x * share, y: a.y * (1 - share) + b.y * share, z: a.z * (1 - share) + b.z * share,
});

// The hands a ball is carried in for the arm motion `clip`: one for a dribble, both for everything else.
export const ballHands = clip => (clip === 'dribble' ? 'right' : clip === 'dribbleLeft' ? 'left' : 'both');

// How high a dribbled ball's centre is. `phase` is the dribble's place in its cycle (0 to 1), `dribble` its facts
// (`push`, `bounces`), `handY` the height of the hand on this frame and `radius` the ball's. From the push the ball
// goes to the floor and comes back; for the rest of the bounce, MOTION.dribbleHold of it, it is at the hand.
export function dribbleHeight(phase, dribble, handY, radius) {
  const turns = dribble.bounces * (phase - dribble.push), u = turns - Math.floor(turns);   // the share of this bounce since the push
  const trip = 1 - MOTION.dribbleHold;
  return u < trip ? radius + (handY - radius) * Math.abs(Math.cos((Math.PI * u) / trip)) : handY;
}

// The ball crossing from the hand at `from` to the hand at `to`, `share` of the way (0 to 1): straight across over
// the floor, with one bounce midway.
export function switchSpot(from, to, share, radius) {
  const spot = between(from, to, share);
  spot.y = radius + (spot.y - radius) * Math.abs(Math.cos(Math.PI * share));
  return spot;
}

// Where a dribbled ball is: under the hand whose palm is at `palm` this frame, at the height dribbleHeight gives for
// the dribble's `phase` (`dribble` its facts, `radius` the ball's). While it crosses from the other hand (`cross` as
// crossFrom remembers it, `share` of the way), it is on its way from where it set off to that same place, so the last
// frame of the crossing and the first of the dribble are one place.
export function dribbleSpot(palm, phase, dribble, radius, cross = null, share = 1) {
  const spot = { x: palm.x, y: dribbleHeight(phase, dribble, palm.y, radius), z: palm.z };
  return cross ? switchSpot(cross.from, spot, share, radius) : spot;
}

// Where the ball is drawn `since` seconds after the way it is carried last changed (see carrying): it was drawn at
// `last` then (null when it is not drawn across), and belongs at `now`. It is drawn straight across from one to the
// other over BALL_IN_HAND.blend seconds.
export function ballSpot(last, now, since) {
  return last && since < BALL_IN_HAND.blend ? between(last, now, since / BALL_IN_HAND.blend) : now;
}

// Who carries the ball and how, as one value that changes exactly when the drawn ball is to be drawn across to its new
// place: null when nobody holds it. `hands` is what ballHands gave for the holder's arms, or null when the ball is not
// drawn in them. A change from one dribbling hand to the other is no change: the ball crosses instead (switchSpot).
export function carrying(holder, hands) {
  if (holder === null) return null;
  return `${holder} ${hands === 'both' ? 'both' : hands ? 'one' : 'none'}`;
}

// Where a dribbled ball crossing to the hand `side` of player `id` set off from: the place it was drawn on the frame
// before the change, so a change while it is low in its bounce does not pull it up to the hand it left. `cross` is
// what the last frame remembered ({ id, side, share, from }, or null), `share` how far through the crossing this frame
// is (0 to 1) and `drawn` where the ball was drawn on the last frame. Returns what to remember.
export function crossFrom(cross, id, side, share, drawn) {
  if (cross && cross.id === id && cross.side === side && share >= cross.share) return { ...cross, share };
  return { id, side, share, from: { x: drawn.x, y: drawn.y, z: drawn.z } };
}

// Where a blend starts, for a ball drawn at `drawn` on a frame on which it is carried otherwise: a copy of `drawn`, or
// null, for no blend, when the rules put it with a player: it came to him and the phase is now `inbound` or
// `freeThrow` (an inbounder, a free-throw shooter, or the ball handed back for his next attempt). A ball caught as the
// phase changes (the inbound pass, a missed last free throw) is caught, not put. `before` and `after` are the last
// frame's and this frame's { holder, phase }.
export function blendFrom(drawn, before, after) {
  const placed = after.holder !== null && after.holder !== before.holder && (after.phase === 'inbound' || after.phase === 'freeThrow');
  return placed ? null : { x: drawn.x, y: drawn.y, z: drawn.z };
}
