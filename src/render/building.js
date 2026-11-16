// The arena's building round the stands (layout.js's ARENA, in an arena's look from arenas.js):
// - the walls behind the lower stands, and the corner blocks between them with a tunnel in each;
// - the ring of suites, the LED ribbon above them, and the upper deck with its railing and back wall;
// - handrails down the aisles;
// - the roof: its trusses, the catwalks, the housings of the light rigs, and the banners.
// Everything of one material is one mesh, so the whole building is a handful of draws.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA } from './layout.js';

const f = Object.freeze;

// wall: the walls' thickness. rail: the upper deck's glass railing, `high` tall; handrail: the aisles' rails, `high`
// above the steps. truss: chord and web radii, and the wave's height and length (for a 'wave' roof). catwalk: its
// width and its rails' height. housing: how much bigger than a roof light its housing is. banner: `wide` by `high`,
// hung `top` up, `x` out over each end, at each `z`. suites: metres along the ring a suite's window is. ribbon: its
// picture's pixels per metre. scroll: metres a second the ribbon's picture runs.
export const BUILDING = f({
  wall: 0.3, rail: f({ high: 1.05 }), handrail: f({ high: 0.85, radius: 0.025 }),
  truss: f({ chord: 0.14, web: 0.06, wave: 1.1, length: 22, step: 2 }),
  catwalk: f({ wide: 1, rail: 1.05 }), housing: 0.5,
  banner: f({ wide: 2.4, high: 5.2, top: 28.4, x: 33.5, z: f([-9, -3, 3, 9]) }),
  suites: 4, ribbon: 40, scroll: 1.4,
});

const UP = new THREE.Vector3(0, 1, 0);

// Pieces of geometry to be merged: a box `sx` by `sy` by `sz` centred on (x, y, z); a tube of radius `r` from `a`
// to `b` ([x, y, z]); a flat face `wide` by `high`, centred on (x, y, z), facing `facing` (round the upright axis:
// 0 faces +z) with its picture's u running from `u0` to `u1`.
function box(sx, sy, sz, x, y, z) { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); return g; }
function tube([ax, ay, az], [bx, by, bz], r, sides = 6) {
  const along = new THREE.Vector3(bx - ax, by - ay, bz - az), g = new THREE.CylinderGeometry(r, r, along.length(), sides, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, along.normalize()));
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return g;
}
function plane(wide, high, x, y, z, facing, u0 = 0, u1 = 1) {
  const g = new THREE.PlaneGeometry(wide, high), uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + (u1 - u0) * uv.getX(i));
  g.rotateY(facing); g.translate(x, y, z);
  return g;
}

// The faces of the ring round the bowl that look at the court, at `inset` metres in front of its walls, each
// { along, x, z, facing }: the far side and the two ends; the near side (behind the camera) when `near`.
function ringFaces(near, inset = 0) {
  const { far, end } = ARENA.ring, nearZ = ARENA.upper.near, span = 2 * end, ends = far + nearZ;
  const faces = [
    { along: span, x: 0, z: -far + inset, facing: 0 },
    { along: ends, x: end - inset, z: (nearZ - far) / 2, facing: -Math.PI / 2 },
    { along: ends, x: -end + inset, z: (nearZ - far) / 2, facing: Math.PI / 2 },
  ];
  if (near) faces.push({ along: span, x: 0, z: nearZ - inset, facing: Math.PI });
  return faces;
}

// The building's one fixed picture, ATLAS pixels square-ish, holding everything drawn flat and unlit: the banners
// side by side along the top, the suites' window, black (for the tunnels and the video board's core), and the tunnels'
// signs. Returns { texture, rect: { banner(i), suite, black, sign(word) } }, each rect [u0, v0, u1, v1].
const ATLAS = f({ wide: 2048, high: 1024, banner: f([256, 512]), suite: f([1024, 0, 256, 64]), black: f([1280, 0, 32, 32]), sign: f([512, 96]), signsAt: 512 });
function atlasPicture(look, words) {
  const c = document.createElement('canvas');
  c.width = ATLAS.wide; c.height = ATLAS.high;
  const g = c.getContext('2d'), C = look.colour;
  // The banners: each the team's colour, its words, a stripe of the accent.
  look.banners.forEach((b, i) => {
    const x = i * ATLAS.banner[0], [w, h] = ATLAS.banner;
    g.fillStyle = C.lane; g.fillRect(x, 0, w, h);
    g.fillStyle = C.accent; g.fillRect(x, h - 70, w, 18);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 22px "Arial Narrow", Arial, sans-serif'; g.fillText(b.top, x + w / 2, 60, w - 26);
    g.font = `900 ${b.big.length > 2 ? 104 : 190}px "Arial Narrow", Arial, sans-serif`; g.fillText(b.big, x + w / 2, h * 0.48, w - 26);
    g.font = '700 24px "Arial Narrow", Arial, sans-serif'; g.fillText(b.bottom, x + w / 2, h - 110, w - 26);
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(x + 12, 12, w - 24, h - 24);
  });
  // A suite's window: dark glass, a warm glow behind it, its frame, a figure or two.
  const [sx, sy, sw, sh] = ATLAS.suite;
  g.fillStyle = '#0a0d14'; g.fillRect(sx, sy, sw, sh);
  const glow = g.createLinearGradient(0, sy, 0, sy + sh);
  glow.addColorStop(0, C.warm); glow.addColorStop(1, '#3a2614');
  g.globalAlpha = 0.55; g.fillStyle = glow; g.fillRect(sx + 8, sy + 10, sw - 16, sh - 14);
  g.globalAlpha = 1; g.fillStyle = '#10141c';
  for (const at of [0.28, 0.36, 0.71]) { const x = sx + sw * at; g.beginPath(); g.arc(x, sy + sh * 0.62, 6, 0, 2 * Math.PI); g.fill(); g.fillRect(x - 7, sy + sh * 0.7, 14, sh * 0.3); }
  g.fillStyle = C.steel; g.fillRect(sx, sy, 6, sh); g.fillRect(sx, sy, sw, 6); g.fillRect(sx, sy + sh - 4, sw, 4);
  // Black.
  g.fillStyle = '#020305'; g.fillRect(...ATLAS.black);
  // The signs: their words in white on the accent.
  words.forEach((word, i) => {
    const x = i * ATLAS.sign[0], y = ATLAS.signsAt, [w, h] = ATLAS.sign;
    g.fillStyle = C.accent; g.fillRect(x, y, w, h);
    g.fillStyle = '#ffffff'; g.font = 'italic 800 58px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(word, x + w / 2, y + h / 2 + 3, w * 0.9);
  });
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // A pixel rect as uv, a little inside, so neighbours never bleed in.
  const uv = ([x, y, w, h]) => [(x + 1) / ATLAS.wide, 1 - (y + h - 1) / ATLAS.high, (x + w - 1) / ATLAS.wide, 1 - (y + 1) / ATLAS.high];
  return { texture, rect: {
    banner: i => uv([i * ATLAS.banner[0], 0, ...ATLAS.banner]), suite: uv(ATLAS.suite), black: uv(ATLAS.black),
    sign: word => uv([words.indexOf(word) * ATLAS.sign[0], ATLAS.signsAt, ...ATLAS.sign]),
  } };
}

// The picture that runs round: two rows, the ribbon's (the arena's name, the home team, the game's own words, over and
// over, between bars of the accent) and the video board's ring (the arena and its city). Both scroll together.
const SCROLL = f({ wide: 2048, high: 128, rows: f([f([8, 48]), f([72, 48])]) });
export function scrollPicture(look, team) {
  const c = document.createElement('canvas');
  c.width = SCROLL.wide; c.height = SCROLL.high;
  const g = c.getContext('2d');
  g.fillStyle = '#04060a'; g.fillRect(0, 0, c.width, c.height);
  g.textBaseline = 'middle';
  const row = ([y, h], words, bar) => {
    g.font = 'italic 800 34px "Arial Narrow", Arial, sans-serif';
    for (let x = 20, i = 0; x < c.width; i++) {
      const word = words[i % words.length];
      g.fillStyle = i % 2 ? '#ffffff' : look.colour.accent; g.fillText(word, x, y + h / 2 + 2);
      x += g.measureText(word).width + 30;
      if (bar) { g.fillStyle = look.colour.lane; g.fillRect(x - 18, y + 8, 6, h - 16); }
    }
  };
  row(SCROLL.rows[0], [look.name, team, 'TRIPLE THREAT', look.city], true);
  row(SCROLL.rows[1], [look.name, look.city], false);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  const v = ([y, h]) => [1 - (y + h - 1) / SCROLL.high, 1 - (y + 1) / SCROLL.high];
  return { texture, ribbon: v(SCROLL.rows[0]), ring: v(SCROLL.rows[1]) };
}

// `g`'s pictures' coordinates (0 to 1 each way, as a plane or a box face has them) moved into the rect [u0, v0, u1,
// v1]; or, for a row of a scrolling picture, u0 to u1 along (more than one turn of it) and v0 to v1 across.
export function fit(g, [u0, v0, u1, v1]) {
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
  return g;
}

// Every point of `g` on one spot of a picture: the middle of `rect`.
export function spot(g, [u0, v0, u1, v1]) {
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (u0 + u1) / 2, (v0 + v1) / 2);
  return g;
}

// The roof's trusses, across the hall at every `every` metres along it, and the height of a chord at (x, z): rolling
// for a 'wave' roof's, folded into straight-sided ridges for an 'angle' roof's.
function chordAt(look, x, z, base) {
  const t = BUILDING.truss;
  if (look.trusses === 'angle') { const u = z / t.length + 0.25; return base + t.wave * (1 - 4 * Math.abs(u - Math.floor(u) - 0.5)); }
  return base + t.wave * Math.sin((2 * Math.PI * z) / t.length + x / 9);
}

// Builds the arena in `look` (see arenas.js) into `group`. `team`: the home team's full name. `extra`: pieces made
// elsewhere to be drawn with the building's own, so that they cost no draws of their own: `concrete` (the lower
// stands' steps), `black` (the video board's core) and `ring` (the video board's ring of lights, its pictures'
// coordinates running along a row of the scrolling picture). Returns { live(now) }: what moves, the words that run.
export function createBuilding(group, look, team, extra = {}) {
  const C = look.colour, L = ARENA.ring, U = ARENA.upper, S = ARENA.suites, R = ARENA.roof, W = BUILDING.wall;
  const concrete = [...(extra.concrete ?? [])], fascia = [], steel = [], glass = [], black = [...(extra.black ?? [])];
  const suites = [], ribbon = [], signs = [], banners = [];
  const nearZ = U.near, top = U.height + (U.rows - 1) * U.rise, back = U.gap + U.rows * U.deep;

  // The walls behind the lower stands, up to the suites' floor; the near one stays low, under the camera's view.
  fascia.push(box(2 * L.end, S.floor, W, 0, S.floor / 2, -L.far - W / 2));
  for (const s of [1, -1]) fascia.push(box(W, S.floor, L.far + nearZ, s * (L.end + W / 2), S.floor / 2, (nearZ - L.far) / 2));
  fascia.push(box(2 * L.end, 2.6, W, 0, 1.3, L.near + W / 2));

  // The corner blocks between the stands, each with a tunnel: the far corners the teams', the near ones exits.
  const blockFrom = ARENA.far.half + 0.6, sideFrom = ARENA.ends.half + 0.5, tun = ARENA.corner;
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const to = sz > 0 ? L.near : L.far, deep = to - sideFrom, wide = L.end - blockFrom;
    fascia.push(box(wide, S.floor, deep, sx * (blockFrom + wide / 2), S.floor / 2, sz * (sideFrom + deep / 2)));
    const z = sz * (sideFrom + tun.tunnelWide / 2 + 0.4);
    black.push(plane(tun.tunnelWide, tun.tunnelHigh, sx * (blockFrom - 0.01), tun.tunnelHigh / 2, z, -sx * Math.PI / 2));
    signs.push({ words: sz < 0 ? (sx > 0 ? team.toUpperCase() : 'VISITORS') : 'EXIT', at: [sx * (blockFrom - 0.02), tun.tunnelHigh + 0.5, z], facing: -sx * Math.PI / 2 });
  }

  // The suites: a ring of windows from their floor to their ceiling, the box behind them, and the ribbon above.
  for (const face of ringFaces(true, -0.01)) {
    // One window each so many metres, side by side along the face (whose own +x runs along (cos, -sin) of its turn).
    const n = Math.max(1, Math.round(face.along / BUILDING.suites)), wide = face.along / n;
    for (let k = 0; k < n; k++) {
      const off = (k + 0.5 - n / 2) * wide;
      suites.push(plane(wide, S.ceiling - S.floor, face.x + off * Math.cos(face.facing), (S.floor + S.ceiling) / 2, face.z - off * Math.sin(face.facing), face.facing));
    }
    ribbon.push(plane(face.along, ARENA.ribbon.high - ARENA.ribbon.low, face.x, (ARENA.ribbon.low + ARENA.ribbon.high) / 2, face.z, face.facing, 0, face.along * BUILDING.ribbon / 2048));
  }
  // Under the suites' windows and above the ribbon, a band of fascia, and its accent-coloured edges.
  for (const face of ringFaces(true, -0.005)) {
    fascia.push(plane(face.along, 0.1, face.x, ARENA.ribbon.high + 0.05, face.z, face.facing), plane(face.along, 0.1, face.x, S.ceiling + 0.05, face.z, face.facing));
  }

  // The upper deck: its steps, its fascia over the ribbon, the glass railing at its front, and the wall behind it.
  for (let row = 0; row < U.rows; row++) {
    const y = U.height + row * U.rise, under = ARENA.ribbon.high, at = U.gap + row * U.deep + U.deep / 2;
    const h = y - under, mid = (y + under) / 2;
    concrete.push(box(2 * U.half + 1, h, U.deep, 0, mid, -(L.far + at)), box(2 * U.half + 1, h, U.deep, 0, mid, nearZ + at));
    for (const s of [1, -1]) concrete.push(box(U.deep, h, 2 * U.ends + 1, s * (L.end + at), mid, 0));
  }
  for (const face of ringFaces(true, 0)) {
    const into = -U.gap / 2, x = face.x + Math.sin(face.facing) * into, z = face.z + Math.cos(face.facing) * into;   // just behind the ribbon
    glass.push(plane(face.along, BUILDING.rail.high, x, U.height + BUILDING.rail.high / 2 - 0.2, z, face.facing));
    steel.push(box(Math.abs(Math.cos(face.facing)) > 0.5 ? face.along : 0.06, 0.06, Math.abs(Math.cos(face.facing)) > 0.5 ? 0.06 : face.along, x, U.height + BUILDING.rail.high - 0.2, z));
  }
  // Its corners, where the sides' rows and the ends' do not reach: solid blocks up to its top row.
  const cornerHigh = top + 1 - ARENA.ribbon.high, cornerMid = (top + 1 + ARENA.ribbon.high) / 2;
  // (Behind the ring only: one block behind each end's corner and one behind each side's.)
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const ring = sz > 0 ? nearZ : L.far, z0 = U.ends + 0.5, x0 = U.half + 0.5;
    fascia.push(box(back, cornerHigh, ring + back - z0, sx * (L.end + back / 2), cornerMid, sz * (z0 + ring + back) / 2));
    fascia.push(box(L.end - x0, cornerHigh, back, sx * (x0 + L.end) / 2, cornerMid, sz * (ring + back / 2)));
  }
  const wallHigh = R.y - ARENA.ribbon.high, wallMid = (R.y + ARENA.ribbon.high) / 2;
  fascia.push(box(2 * (L.end + back), wallHigh, W, 0, wallMid, -(L.far + back + W / 2)), box(2 * (L.end + back), wallHigh, W, 0, wallMid, nearZ + back + W / 2));
  for (const s of [1, -1]) fascia.push(box(W, wallHigh, L.far + nearZ + 2 * back, s * (L.end + back + W / 2), wallMid, (nearZ - L.far) / 2));

  // Handrails down the middle of every aisle of the lower stands.
  const { every } = ARENA.aisle, hr = BUILDING.handrail;
  const rail = (stand, line) => {
    const z0 = stand.first, z1 = stand.first + (stand.rows - 1) * ARENA.seat.deep;
    const y0 = stand.height + hr.high, y1 = stand.height + (stand.rows - 1) * ARENA.seat.rise + hr.high;
    steel.push(line(z0, y0, z1, y1));
  };
  for (let x = -Math.floor(ARENA.far.half / every) * every; x <= ARENA.far.half; x += every) {
    rail(ARENA.far, (a, ya, b, yb) => tube([x, ya, -a], [x, yb, -b], hr.radius));
    rail(ARENA.near, (a, ya, b, yb) => tube([x, ya, a], [x, yb, b], hr.radius));
  }
  for (let z = -Math.floor(ARENA.ends.half / every) * every; z <= ARENA.ends.half; z += every)
    for (const s of [1, -1]) rail(ARENA.ends, (a, ya, b, yb) => tube([s * a, ya, z], [s * b, yb, z], hr.radius));

  // The roof: trusses across the hall, every so often along it; catwalks along it, hung from the trusses.
  const t = BUILDING.truss, zFrom = -(L.far + back), zTo = nearZ + back;
  for (let x = -Math.floor(R.hallX / R.every) * R.every; x <= R.hallX; x += R.every) {
    let last = null;
    for (let z = zFrom, i = 0; z <= zTo + 1e-9; z += t.step, i++) {
      const lo = [x, chordAt(look, x, z, R.low), z], hi = [x, chordAt(look, x, z, R.high), z];
      if (last) {
        steel.push(tube(last.lo, lo, t.chord), tube(last.hi, hi, t.chord));
        steel.push(i % 2 ? tube(last.lo, hi, t.web) : tube(last.hi, lo, t.web));
      }
      steel.push(tube(lo, hi, t.web));
      last = { lo, hi };
    }
  }
  const cw = BUILDING.catwalk;
  for (const z of R.catwalkZ) {
    steel.push(box(2 * R.hallX, 0.05, cw.wide, 0, R.catwalk, z));
    for (const side of [-1, 1]) steel.push(tube([-R.hallX, R.catwalk + cw.rail, z + side * cw.wide / 2], [R.hallX, R.catwalk + cw.rail, z + side * cw.wide / 2], 0.025));
    for (let x = -Math.floor(R.hallX / R.every) * R.every; x <= R.hallX; x += R.every) steel.push(tube([x, R.catwalk, z], [x, chordAt(look, x, z, R.low), z], 0.03));
  }

  // The banners, hung over each end, facing the court.
  const B = BUILDING.banner, n = look.banners.length;
  for (const s of [1, -1]) B.z.forEach((z, i) => banners.push({ i: i % n, g: plane(B.wide, B.high, s * B.x, B.top - B.high / 2, z, -s * Math.PI / 2) }));

  // Materials, and the meshes.
  const mesh = (list, material) => { const m = new THREE.Mesh(mergeGeometries(list), material); group.add(m); return m; };
  mesh(concrete, new THREE.MeshStandardMaterial({ color: C.concrete, roughness: 0.95 }));
  mesh(fascia, new THREE.MeshStandardMaterial({ color: C.fascia, roughness: 0.7, metalness: 0.2 }));
  // The steel glows a little of its own: under a dark roof, lit from below only by what the court throws up, the
  // rafters would otherwise be lost.
  mesh(steel, new THREE.MeshStandardMaterial({ color: C.steel, roughness: 0.55, metalness: 0.35, emissive: new THREE.Color(C.steel).multiplyScalar(0.12) }));
  mesh(glass, new THREE.MeshStandardMaterial({ color: C.glass, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
  // Everything flat and unlit in one mesh on one picture: the suites' windows, the banners, the tunnels and the video
  // board's core in black, and the tunnels' signs.
  const words = [...new Set(signs.map(s => s.words))], atlas = atlasPicture(look, words);
  mesh([
    ...suites.map(g => fit(g, atlas.rect.suite)),
    ...banners.map(b => fit(b.g, atlas.rect.banner(b.i))),
    ...black.map(g => spot(g, atlas.rect.black)),
    ...signs.map(s => fit(plane(2.6, 0.5, ...s.at, s.facing), atlas.rect.sign(s.words))),
  ], new THREE.MeshBasicMaterial({ map: atlas.texture, side: THREE.DoubleSide }));
  // What runs round, the ribbon's words and the video board's ring, in one mesh on one scrolling picture.
  const run = scrollPicture(look, team);
  mesh([
    ...ribbon.map(g => fit(g, [0, run.ribbon[0], 1, run.ribbon[1]])),
    ...(extra.ring ?? []).map(g => fit(g, [0, run.ring[0], 1, run.ring[1]])),
  ], new THREE.MeshBasicMaterial({ map: run.texture, color: new THREE.Color().setScalar(1.5) }));

  return {
    // The ribbon's words run round the arena.
    live(now) { run.texture.offset.x = (now * BUILDING.scroll * BUILDING.ribbon / 2048) % 1; },
  };
}
