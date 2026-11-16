import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA, seats, upperSeats, shown, boards } from './layout.js';
import { ROSTER } from '../sim/tuning.js';
import { BUILDING, createBuilding } from './building.js';
import { createVideoBoard } from './videoboard.js';
import { QUALITY } from './quality.js';
import { ADS, adAt } from './life.js';
import { dressCrowd } from './crowd.js';
import { createFans } from './fans.js';
import { courtsideSeats } from './sideline.js';

// panels: the roof's lights, as in light.js's hidden hall, drawn here so the floor has them to mirror. glow: how much
// brighter than white the lit boards and the roof's lights are, so that they bloom.
const LOOK = Object.freeze({
  glow: 1.7,
  panels: Object.freeze({ xs: [-21, -7, 7, 21], zs: [-11, 0, 11], wide: 9, deep: 5, y: 24 }),
});

// A canvas picture of `words` in the game's lettering, `wide` by `high` metres, in `ink` on `back`.
function wordsPicture(words, wide, high, back, ink) {
  const c = document.createElement('canvas');
  c.height = 128; c.width = Math.round(128 * wide / high);
  const g = c.getContext('2d');
  g.fillStyle = back; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = ink;
  g.font = 'italic 800 64px "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(words, c.width / 2, c.height / 2 + 4, c.width * 0.9);
  const picture = new THREE.CanvasTexture(c);
  picture.colorSpace = THREE.SRGBColorSpace;
  picture.anisotropy = 4;
  return picture;
}

// A flat face `width` by `height` at a board's place, turned the way it faces.
function face(board, material) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(board.width, board.height), material);
  mesh.position.set(board.x, board.y, board.z);
  mesh.rotation.y = board.facing;
  return mesh;
}

// The stands' steps: one block under every row, as geometry for the building's concrete (see building.js).
function steps() {
  const blocks = [], { deep, rise } = ARENA.seat;
  const block = (x, y, z, sx, sy, sz) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); blocks.push(g); };
  const row = (stand, r) => ({ at: stand.first + (r + 0.5) * deep - deep / 2, top: stand.height + r * rise });
  for (let r = 0; r < ARENA.far.rows; r++) { const { at, top } = row(ARENA.far, r); block(0, top / 2, -at, 2 * ARENA.far.half + 1, top, deep); }
  for (let r = 0; r < ARENA.near.rows; r++) { const { at, top } = row(ARENA.near, r); block(0, top / 2, at, 2 * ARENA.near.half + 1, top, deep); }
  for (const s of [1, -1]) for (let r = 0; r < ARENA.ends.rows; r++) { const { at, top } = row(ARENA.ends, r); block(s * at, top / 2, 0, deep, top, 2 * ARENA.ends.half + 1); }
  return blocks;
}

// The home side's arena (`look`, see arenas.js), added to `scene`: the stands and their crowd, the building round them
// (building.js), the lit boards, the scorer's table, the video board (videoboard.js), and a dark shell with the roof's
// lights. Returns { setQuality(level), show(state), live(life, now), feed(renderer, camera, picture), dispose() }: how
// full the stands are at a quality level, the match for the video board to show, the crowd's mood, the frame just
// drawn for its screens, and taking it all down again (for another arena).
export function createArena(scene, look) {
  const hall = new THREE.Group(), R = ARENA.roof;
  // The dark shell round everything, its top the roof's underside.
  const shell = new THREE.Mesh(new THREE.BoxGeometry(2 * R.hallX, R.y, 2 * R.hallZ),
    new THREE.MeshStandardMaterial({ color: look.colour.ceiling, roughness: 1, side: THREE.BackSide }));
  shell.position.y = R.y / 2 - 0.02;
  // The video board's core and ring, and the stands' steps, are drawn with the building's own (see building.js).
  const board = createVideoBoard(hall, look, BUILDING.ribbon / 2048);
  const building = createBuilding(hall, look, ROSTER.teams[look.team], { concrete: steps(), black: board.pieces.black, ring: board.pieces.ring });
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(...look.colour.lights).multiplyScalar(LOOK.glow) });
  // The roof's lights are one mesh: twelve separate ones would each be drawn again in the floor's mirror.
  const panels = [];
  for (const x of LOOK.panels.xs) for (const z of LOOK.panels.zs) {
    const panel = new THREE.PlaneGeometry(LOOK.panels.wide, LOOK.panels.deep);
    panel.rotateX(Math.PI / 2);
    panel.translate(x, LOOK.panels.y, z);
    panels.push(panel);
  }
  hall.add(new THREE.Mesh(mergeGeometries(panels), lit));
  hall.add(shell);
  // The fans: the courtside seats always filled, then the stands, the first so many of them in a fixed shuffled order.
  const stands = shown([...seats(), ...upperSeats()], 1);
  const fans = createFans(hall, dressCrowd(stands, courtsideSeats(), ARENA.upper.height - 0.1, look.team), look.team);
  const courtside = fans.seats - stands.length;

  // The boards and the table carry words. (The video board's faces are its own: see videoboard.js.)
  // The boards along the far side and behind the baselines show advertisements, each changing in its turn; the
  // table's face keeps the game's name.
  const adBoards = ARENA.sideBoards.count + 2 * ARENA.endBoards.count, adPictures = [], adLooks = [];
  boards().forEach((board, i) => {
    if (board.words === '') return;
    if (i < adBoards && !adPictures.length) for (const ad of ADS) adPictures.push(wordsPicture(ad.words, board.width, board.height, ad.back, ad.ink));
    const picture = i < adBoards ? adPictures[adAt(i, 0)] : wordsPicture(board.words, board.width, board.height, '#0e2a66', '#f2f5f8');
    const look = new THREE.MeshBasicMaterial({ map: picture, color: new THREE.Color().setScalar(LOOK.glow) });
    if (i < adBoards) adLooks.push({ look, board: i, showing: adAt(i, 0) });
    hall.add(face(board, look));
  });
  const table = new THREE.Mesh(new THREE.BoxGeometry(ARENA.table.wide, ARENA.table.high, ARENA.table.deep), new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.8 }));
  table.position.set(0, ARENA.table.high / 2, ARENA.table.z - ARENA.table.deep / 2 - 0.01);
  hall.add(table);
  scene.add(hall);

  let full = stands.length;
  return {
    setQuality(level) {
      full = Math.round(stands.length * QUALITY[level].crowd);
      fans.setQuality(level);
      board.setQuality(level);
    },
    // The frame just drawn, onto the video board's screens (see videoboard.js).
    feed: (renderer, camera, picture) => board.copy(renderer, camera, picture),
    // The crowd and the boards at `now` seconds, as the crowd's mood (`life`, see life.js) has them: fans in the stands
    // who have gone home are no longer drawn, the rest react as the mood has them, and each board changes its
    // advertisement in turn.
    live(life, now) {
      building.live(now);
      fans.live(life, now, courtside + Math.round(full * (1 - life.left)));
      for (const ad of adLooks) {
        const now_ = adAt(ad.board, now);
        if (now_ !== ad.showing) { ad.showing = now_; ad.look.map = adPictures[now_]; ad.look.needsUpdate = true; }
      }
    },
    // The match, for the video board.
    show(state) { board.show(state); },
    dispose() {
      scene.remove(hall);
      const done = new Set();
      const free = thing => { if (thing && !done.has(thing)) { done.add(thing); thing.dispose(); } };
      hall.traverse(part => {
        free(part.geometry);
        for (const material of [part.material ?? []].flat()) { free(material.map); free(material); }
      });
      for (const picture of adPictures) free(picture);
      board.dispose(); fans.dispose();
    },
  };
}
