// The four quality levels, and how the game picks between them by itself. No Three.js and no page here, so it can be
// tested without a browser.

const f = Object.freeze;

// pixelRatio: drawn pixels across one CSS pixel (never more than the screen has). pixels: the most pixels the level
// draws in all, so a big screen costs no more than a full HD one does on High. shadow: pixels along each side of
// the key light's shadow map; soft: whether its edge is blurred. textures: the players' pictures, as a share of their
// full width and height. floor: pixels along each side of the floor's wood pictures. crowd: the share of the seats
// that are filled. aa: how edges are smoothed: 'none', 'fxaa' or 'smaa'. ao: ambient occlusion. bloom: the glow round
// lights, with the vignette. mirror: the floor's reflection of the game, as a share of the screen's size (0: none).
// order: the levels from cheapest to dearest, which is the order G steps through them.
// autoAfter: seconds of play measured before the game chooses for itself. autoBelow: it steps down a level under this
// many frames a second. longest: the most one frame counts for, in milliseconds.
export const QUALITY = f({
  low: f({ label: 'Low', pixelRatio: 0.75, pixels: 600000, shadow: 1024, soft: false, textures: 0.5, floor: 1024, crowd: 0.15, aa: 'none', ao: false, bloom: false, mirror: 0 }),
  medium: f({ label: 'Medium', pixelRatio: 1, pixels: 1100000, shadow: 1024, soft: true, textures: 0.5, floor: 1024, crowd: 0.5, aa: 'fxaa', ao: false, bloom: false, mirror: 0 }),
  high: f({ label: 'High', pixelRatio: 2, pixels: 2100000, shadow: 2048, soft: true, textures: 1, floor: 2048, crowd: 1, aa: 'smaa', ao: true, bloom: true, mirror: 0.5 }),
  ultra: f({ label: 'Ultra', pixelRatio: 2, pixels: 3700000, shadow: 4096, soft: true, textures: 1, floor: 2048, crowd: 1, aa: 'smaa', ao: true, bloom: true, mirror: 1 }),
  order: f(['low', 'medium', 'high', 'ultra']),
  autoAfter: 3, autoBelow: 50, longest: 100,
});

// level: one of QUALITY.order. seconds, frames: the play measured so far. settled: the level is no longer the game's to choose.
export const createQuality = () => ({ level: 'high', seconds: 0, frames: 0, settled: false });

// One frame that took `ms` real milliseconds; `playing` while a match is in play and not paused. Only playing frames
// are measured, and a stall is one long frame, not proof of a slow computer. Each time enough play has been measured:
// if the frames came fast enough the level is settled for good; if not, the game steps down one level and measures
// again, settling when it reaches Low. It never steps up. Returns true on a frame the level changes.
export function autoQuality(q, ms, playing) {
  if (q.settled || !playing) return false;
  q.seconds += Math.min(ms, QUALITY.longest) / 1000;
  q.frames += 1;
  if (q.seconds < QUALITY.autoAfter) return false;
  const slow = q.frames / q.seconds < QUALITY.autoBelow, at = QUALITY.order.indexOf(q.level);
  q.seconds = q.frames = 0;
  if (!slow || at === 0) { q.settled = true; return false; }
  q.level = QUALITY.order[at - 1];
  q.settled = at === 1;
  return true;
}

// The G key: the next level, round from Ultra to Low, and from now on the game leaves the choice alone.
export function stepQuality(q) {
  q.level = QUALITY.order[(QUALITY.order.indexOf(q.level) + 1) % QUALITY.order.length];
  q.settled = true;
}

// How many pixels to draw across one CSS pixel at `level`, in a window `width` by `height` CSS pixels on a screen with
// `screen` device pixels to the CSS pixel: the level's own ratio, never more than the screen has, and less when the
// window is so big that the level's budget of pixels would be passed.
export function pixelRatioFor(level, width, height, screen) {
  const { pixelRatio, pixels } = QUALITY[level];
  return Math.min(screen, pixelRatio, Math.sqrt(pixels / Math.max(width * height, 1)));
}

// Should the game draw with WebGL 2 even where the browser offers WebGPU? Yes in Firefox, whose WebGPU ran the game at
// a quarter of the speed of its WebGL 2 (Firefox 146 on Linux, measured 2026-11-13). The page's address has the last
// word: #webgl asks for WebGL 2 in any browser, #webgpu for WebGPU even in Firefox.
export function prefersWebGL(userAgent = '', hash = '') {
  if (hash.includes('webgpu')) return false;
  return hash.includes('webgl') || /firefox/i.test(userAgent);
}
