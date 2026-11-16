// A hoop as an NBA arena has it: the glass with its painted square, the rim on its bracket, the net, padding on the
// board's lower edges, a red LED strip round the glass, a shot clock with the game clock above it, and the stanchion
// behind the baseline: a padded base and upright, and steel arms out to the board. The rim flexes on a dunk. Static
// parts are merged by material, so a hoop is a few draws, not dozens.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOARD, COURT, RIM } from '../sim/tuning.js';
import { attackSign } from '../sim/state.js';
import { NET, createNet } from './net.js';
import { clockText } from './hud.js';

const f = Object.freeze;

// Where the stanchion stands, metres behind the baseline: its base from `baseFrom` to `baseTo`, `baseHigh` tall and
// `baseWide` across; its upright `post` metres behind, `postWide` across and `postDeep` along the court, up to `postTop`.
// The arms leave the upright at `armHigh` and meet the board's back at `armLow`, `armApart` apart; the braces run from
// `braceFrom` up the upright to `braceTo` along the arm. pad: the padding's thickness. clock: the shot clock's box
// above the board (`deep` along the court, `high`, `wide` across, its bottom `gap` above the glass). led: the strip's
// thickness. bracket: the plate on the glass and the neck out to the rim. flex: a dunk pulls the rim's front down by
// `angle` radians, and it springs back, `hz` times a second, its swing falling to 1/e every `fade` seconds.
export const HOOP = f({
  baseFrom: 0.8, baseTo: 1.9, baseHigh: 0.75, baseWide: 1.5, post: 1.25, postWide: 0.7, postDeep: 0.5, postTop: 3.7,
  armHigh: 3.62, armLow: 3.45, armApart: 0.44, armRadius: 0.035, braceFrom: 2.55, braceTo: 0.55,
  pad: 0.06, clock: f({ deep: 0.24, high: 0.42, wide: 0.95, gap: 0.04 }), led: 0.022,
  bracket: f({ plate: f([0.18, 0.32]), neck: f([0.04, 0.12]) }),
  flex: f({ angle: 0.14, hz: 4, fade: 0.22 }),
});

// How far the rim is tipped `t` seconds after a dunk pulled it: all the way at once, then springing back and settling.
export const flexAngle = t => (t < 0 || t > 1.5 ? 0 : HOOP.flex.angle * Math.exp(-t / HOOP.flex.fade) * Math.cos(2 * Math.PI * HOOP.flex.hz * t));

// What the hoop's clock shows and whether its lights are red, for `state`: the shot clock in whole seconds (none before
// and after a match), the game clock as the scorebug has it, and red once the shot clock or the period has run out.
export function hoopShows(state) {
  const playing = state.phase !== 'start' && state.phase !== 'final';
  return {
    shot: playing ? String(Math.max(0, Math.ceil(state.shotClock))) : '',
    clock: clockText(Math.max(0, state.gameClock)),
    red: playing && (state.shotClock <= 0 || state.gameClock <= 0),
  };
}

// The white paint on a backboard: its edge and the square above the rim. Clear everywhere else.
function paintBoard() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * (BOARD.top - BOARD.bottom) / (2 * BOARD.halfWidth));
  const g = c.getContext('2d'), per = c.width / (2 * BOARD.halfWidth);   // pixels per metre
  g.strokeStyle = '#ffffff';
  g.lineWidth = 0.05 * per;
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, c.width - g.lineWidth, c.height - g.lineWidth);
  const square = { wide: 0.61, high: 0.457 }, foot = c.height - (RIM.height - BOARD.bottom) * per;   // 24 by 18 inches, its bottom at the rim's height
  g.strokeRect((c.width - square.wide * per) / 2, foot - square.high * per, square.wide * per, square.high * per);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A mesh through the net's knots: NET.knots + 1 rows by NET.strings + 1 columns, the last column on the first, so the
// picture runs once round the net and meets itself.
function buildSleeve(material) {
  const n = NET.strings, columns = n + 1, uv = [], index = [];
  for (let row = 0; row <= NET.knots; row++) for (let col = 0; col < columns; col++) {
    uv.push(col / n, 1 - row / NET.knots);
    if (row === NET.knots || col === n) continue;
    const a = row * columns + col, b = a + columns;
    index.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(3 * columns * (NET.knots + 1)), 3);
  geometry.setAttribute('position', position.setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  const sleeve = new THREE.Mesh(geometry, material);
  sleeve.frustumCulled = false;   // its bounds would be those of where it was made, not of where the ball pushes it
  return sleeve;
}

// Puts the sleeve's points where the net's knots are now.
export function drape(sleeve, net) {
  const position = sleeve.geometry.attributes.position, p = position.array, n = NET.strings;
  for (let row = 0; row <= NET.knots; row++) {
    const to = 3 * row * (n + 1);
    p.set(net.points.subarray(3 * row * n, 3 * (row + 1) * n), to);
    p.copyWithin(to + 3 * n, to, to + 3);
  }
  position.needsUpdate = true;
}

// A box `sx` by `sy` by `sz` centred on (x, y, z), as geometry to be merged.
function box(sx, sy, sz, x, y, z) { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); return g; }

// A steel tube of radius `r` from `a` to `b` (Vector3s), as geometry to be merged.
const UP = new THREE.Vector3(0, 1, 0);
function tube(a, b, r) {
  const along = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r, r, along.length(), 10);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, along.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// The clock's face: the shot clock in red above the game clock in white, on black.
function paintClock(g, c, { shot, clock }) {
  g.fillStyle = '#050608'; g.fillRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ff2a1f'; g.font = `700 ${Math.round(c.height * 0.58)}px "Courier New", monospace`;
  g.fillText(shot, c.width / 2, c.height * 0.36);
  g.fillStyle = '#f2f2f2'; g.font = `700 ${Math.round(c.height * 0.26)}px "Courier New", monospace`;
  g.fillText(clock, c.width / 2, c.height * 0.83);
}

// The hoop at x = s * RIM.x, its net drawn in `netLook`. Returns { hoop, net, sleeve, show(state) }: the group to add
// to the scene, the net and the sleeve that draws it, and what puts this frame's clock, lights and rim flex on it.
export function createHoop(s, netLook) {
  const hoop = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.45, metalness: 0.7 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x1b2f6b, roughness: 0.9 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.35, metalness: 0.6 });
  const L = COURT.halfLength, high = BOARD.top - BOARD.bottom, wide = 2 * BOARD.halfWidth, boardY = (BOARD.top + BOARD.bottom) / 2;
  const X = metres => s * metres;   // a distance from centre court along this hoop's way

  // The glass, and the paint on the side the court sees.
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xdfeef5, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false });
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.03, high, wide), glass);
  board.position.set(X(BOARD.x + 0.015), boardY, 0);
  const marks = new THREE.Mesh(new THREE.PlaneGeometry(wide, high), new THREE.MeshBasicMaterial({ map: paintBoard(), transparent: true, depthWrite: false, toneMapped: false }));
  marks.rotation.y = -s * Math.PI / 2;
  marks.position.set(X(BOARD.x - 0.002), boardY, 0);

  // The rim and its net on a hinge at the back of the rim, where the bracket holds it, so a dunk can pull them down.
  const hingeX = RIM.x + RIM.radius + RIM.tube, hinge = new THREE.Group();
  hinge.position.set(X(hingeX), RIM.height, 0);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM.radius, RIM.tube, 10, 40), orange);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(X(RIM.x - hingeX), 0, 0);
  const net = createNet(s), sleeve = buildSleeve(netLook);
  sleeve.position.set(-X(hingeX), -RIM.height, 0);   // its points are on the court: undone here, so the hinge alone moves it
  drape(sleeve, net);
  hinge.add(rim, sleeve);

  // The bracket: a plate on the glass and a neck out to the back of the rim.
  const plate = HOOP.bracket.plate, neck = HOOP.bracket.neck, neckLong = BOARD.x - 0.02 - hingeX;
  const bracket = new THREE.Mesh(mergeGeometries([
    box(0.02, plate[0], plate[1], X(BOARD.x - 0.01), RIM.height - 0.04, 0),
    box(neckLong, neck[0], neck[1], X(hingeX + neckLong / 2), RIM.height - 0.01, 0),
  ]), orange);

  // The padding: the board's bottom edge and lower sides; the stanchion's base and upright.
  const p = HOOP.pad, baseDeep = HOOP.baseTo - HOOP.baseFrom, postHigh = HOOP.postTop - HOOP.baseHigh;
  const padding = new THREE.Mesh(mergeGeometries([
    box(0.07, p, wide + 2 * p, X(BOARD.x + 0.015), BOARD.bottom - p / 2, 0),
    ...[-1, 1].map(side => box(0.07, 0.35, p, X(BOARD.x + 0.015), BOARD.bottom + 0.175, side * (BOARD.halfWidth + p / 2))),
    box(baseDeep, HOOP.baseHigh, HOOP.baseWide, X(L + HOOP.baseFrom + baseDeep / 2), HOOP.baseHigh / 2, 0),
    box(HOOP.postDeep, postHigh, HOOP.postWide, X(L + HOOP.post), HOOP.baseHigh + postHigh / 2, 0),
  ]), pad);

  // The steel: the arms from the upright to the board's back, their braces, the plate they hold the board by, and
  // the shot clock's housing on top of the board.
  const v = (along, y, z) => new THREE.Vector3(X(along), y, z), c = HOOP.clock;
  const clockX = BOARD.x + 0.03 + c.deep / 2, clockY = BOARD.top + c.gap + c.high / 2;
  const frame = new THREE.Mesh(mergeGeometries([
    ...[-1, 1].flatMap(side => {
      const z = side * HOOP.armApart / 2;
      return [tube(v(L + HOOP.post, HOOP.armHigh, z), v(BOARD.x + 0.08, HOOP.armLow, z), HOOP.armRadius),
        tube(v(L + HOOP.post - HOOP.postDeep / 2, HOOP.braceFrom, z), v(BOARD.x + 0.08 + HOOP.braceTo, HOOP.armLow + 0.03, z), HOOP.armRadius * 0.8)];
    }),
    box(0.06, 0.5, 0.62, X(BOARD.x + 0.06), boardY, 0),
    box(c.deep, c.high, c.wide, X(clockX), clockY, 0),
  ]), steel);

  // The clock's two faces, toward the court and away from it, both from one picture redrawn when a number changes.
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const paint = canvas.getContext('2d'), face = new THREE.CanvasTexture(canvas);
  face.colorSpace = THREE.SRGBColorSpace;
  const faces = new THREE.Mesh(mergeGeometries([-1, 1].map(side => {
    const g = new THREE.PlaneGeometry(c.wide * 0.94, c.high * 0.9);
    g.rotateY(side * s > 0 ? Math.PI / 2 : -Math.PI / 2);   // each faces out of its side of the box
    g.translate(X(clockX + side * (c.deep / 2 + 0.002)), clockY, 0);
    return g;
  })), new THREE.MeshBasicMaterial({ map: face, toneMapped: false }));

  // The LED strip round the glass: dark until the shot clock or the period runs out.
  const led = HOOP.led, ledLook = new THREE.MeshBasicMaterial({ color: 0x220405, toneMapped: false });
  const strip = new THREE.Mesh(mergeGeometries([
    box(led, led, wide + 2 * led, X(BOARD.x - led / 2), BOARD.top + led / 2, 0),
    box(led, led, wide + 2 * led, X(BOARD.x - led / 2), BOARD.bottom - led / 2 - p, 0),
    ...[-1, 1].map(side => box(led, high, led, X(BOARD.x - led / 2), boardY, side * (BOARD.halfWidth + led / 2))),
  ]), ledLook);

  hoop.add(board, marks, hinge, bracket, padding, frame, faces, strip);
  for (const m of [rim, bracket, padding, frame]) m.castShadow = true;

  let shown = { shot: null, clock: null, red: null }, lastShot = null, dunkAt = -Infinity;
  return {
    hoop, net, sleeve,
    // This frame: the clock's numbers (redrawn only when one changes), the lights, and the rim's flex after a dunk at
    // this hoop.
    show(state) {
      const now = hoopShows(state);
      if (now.shot !== shown.shot || now.clock !== shown.clock) { paintClock(paint, canvas, now); face.needsUpdate = true; }
      if (now.red !== shown.red) ledLook.color.setHex(now.red ? 0xff1a1a : 0x220405);
      shown = now;
      const shot = state.shot;
      if (shot && shot !== lastShot && shot.finish === 'dunk' && attackSign(state.players[shot.shooter].team) === s) dunkAt = state.time;
      lastShot = shot;
      hinge.rotation.z = s * flexAngle(state.time - dunkAt);
    },
  };
}
