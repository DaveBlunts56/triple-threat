// The two quality levels, and the one time the game picks between them by itself. No Three.js and no page here,
// so it can be tested without a browser.

const f = Object.freeze;

// pixelRatio: drawn pixels across one CSS pixel (never more than the screen has). shadow: pixels along each side of
// the sun's shadow map. textures: the players' pictures, as a share of their full width and height.
// autoAfter: seconds of play measured before the game chooses for itself. autoBelow: it chooses Low under this many
// frames a second. longest: the most one frame counts for, in milliseconds.
export const QUALITY = f({
  high: f({ label: 'High', pixelRatio: 2, shadow: 2048, textures: 1 }),
  low: f({ label: 'Low', pixelRatio: 0.75, shadow: 1024, textures: 0.5 }),
  autoAfter: 3, autoBelow: 40, longest: 100,
});

// level: 'high' or 'low'. seconds, frames: the play measured so far. settled: the level is no longer the game's to choose.
export const createQuality = () => ({ level: 'high', seconds: 0, frames: 0, settled: false });

// One frame that took `ms` real milliseconds; `playing` while a match is in play and not paused. Only playing frames
// are measured, and a stall is one long frame, not proof of a slow computer. Once enough play has been measured the
// level is settled for good: Low if the frames came too slowly. Returns true on the frame the level changes.
export function autoQuality(q, ms, playing) {
  if (q.settled || !playing) return false;
  q.seconds += Math.min(ms, QUALITY.longest) / 1000;
  q.frames += 1;
  if (q.seconds < QUALITY.autoAfter) return false;
  q.settled = true;
  if (q.frames / q.seconds >= QUALITY.autoBelow) return false;
  q.level = 'low';
  return true;
}

// The G key: the other level, and from now on the game leaves the choice alone.
export function toggleQuality(q) {
  q.level = q.level === 'high' ? 'low' : 'high';
  q.settled = true;
}
