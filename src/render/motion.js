// Which motion a player shows, worked out from the match alone. No Three.js here, so it can be tested without a browser.
import { BALL, PLAYER } from '../sim/tuning.js';

// Seconds from leaving the floor to landing.
export const AIR_TIME = (2 * PLAYER.jumpV) / BALL.gravity;

// Speeds in metres per second. stick: how far past an edge he must go before the gait changes.
// minRate, maxRate: limits on how slow or fast a clip is played. fade: seconds to blend from one motion to the next.
export const MOTION = Object.freeze({ idleBelow: 0.3, walkBelow: 2.2, runBelow: 5.6, stick: 0.2, minRate: 0.6, maxRate: 1.5, fade: 0.15 });

const GAITS = ['idle', 'walk', 'run', 'sprint'];
const EDGES = [MOTION.idleBelow, MOTION.walkBelow, MOTION.runBelow];   // EDGES[i] lies between GAITS[i] and GAITS[i + 1]

// The leg motion for `player` (needs vx, vz, y, vy, jumpT). `gaits` is the natural speed of walk, run and sprint;
// `last` is the clip he showed on the previous frame.
// On the floor: { clip, rate }. In the air: { clip: 'jump', at }, with `at` from 0 at take-off to 1 at landing.
export function legMotion(player, gaits, last = null) {
  if (player.y > 0 || player.vy !== 0) return { clip: 'jump', at: Math.min(1, player.jumpT / AIR_TIME) };

  const speed = Math.hypot(player.vx, player.vz);
  let band = EDGES.findIndex(edge => speed < edge);
  if (band < 0) band = GAITS.length - 1;
  // Close to an edge he keeps the gait he is already in, so the legs do not flicker between two clips.
  const kept = GAITS.indexOf(last);
  if (Math.abs(kept - band) === 1 && kept >= 0 && Math.abs(speed - EDGES[Math.min(kept, band)]) < MOTION.stick) band = kept;

  const clip = GAITS[band];
  // Played faster or slower so the feet cover the ground he really covers.
  const rate = clip === 'idle' ? 1 : Math.min(MOTION.maxRate, Math.max(MOTION.minRate, speed / gaits[clip]));
  return { clip, rate };
}

// One frame of a cross-fade. `weights` is { clip: its share of the pose }; `step` is the share of a whole fade that
// passed this frame. Every other motion fades out and the chosen one takes what is left, so the shares always add up
// to 1: whatever is missing would be filled in with the rest pose, and limbs would flick toward it.
export function fade(weights, chosen, step) {
  let others = 0;
  for (const name in weights) if (name !== chosen) others += weights[name] = Math.max(0, weights[name] - step);
  weights[chosen] = 1 - others;
  return weights;
}

// Throws unless `facts` (assets/motion.json) gives every gait a speed: without one a moving player cannot be drawn.
export function checkGaits(facts) {
  for (const gait of GAITS.slice(1)) {
    if (!(facts?.gaits?.[gait] > 0)) throw new Error(`assets/motion.json has no speed for "${gait}"`);
  }
}
