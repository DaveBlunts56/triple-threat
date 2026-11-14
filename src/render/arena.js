import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA, seats, shown, boards, scoreLines } from './layout.js';
import { QUALITY } from './quality.js';
import { KIT } from './kit.js';

// concrete, seat: the colours of the stands' steps and of an empty seat's back. hall: half the hall's length and
// width and its height, in metres: the dark shell round everything. panels: the roof's lights, as in light.js's
// hidden hall, drawn here so the floor has them to mirror. glow: how much brighter than white the lit boards and the
// roof's lights are, so that they bloom. shirts, skins: what the crowd wears and its skin tones.
const LOOK = Object.freeze({
  concrete: 0x1b1e25, seat: 0x23324f, hall: Object.freeze({ x: 32, z: 27, y: 26 }), glow: 1.7,
  panels: Object.freeze({ xs: [-21, -7, 7, 21], zs: [-11, 0, 11], wide: 9, deep: 5, y: 24 }),
  shirts: Object.freeze([KIT.team[0], KIT.team[0], KIT.team[0], KIT.team[1], '#cfd3d8', '#cfd3d8', '#2a2d33', '#2a2d33', '#5b6570', '#8c8f96', '#6a5a4a', '#3e4c5e']),
  dim: 0.5,   // the stands are darker than the court: the crowd's colours are multiplied by this
  skins: Object.freeze(['#f0cfae', '#d9a877', '#a8744a', '#7a4f31', '#55371f']),
});

// A canvas picture of `words` in the game's lettering, `wide` by `high` metres, light on a dark field or the other
// way about, turn and turn about along a row of boards.
function wordsPicture(words, wide, high, light) {
  const c = document.createElement('canvas');
  c.height = 128; c.width = Math.round(128 * wide / high);
  const g = c.getContext('2d');
  g.fillStyle = light ? '#f2f5f8' : '#0e2a66'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = light ? '#0e2a66' : '#f2f5f8';
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

// The stands' steps: one block under every row, all in one mesh.
function steps() {
  const blocks = [], { deep, rise } = ARENA.seat;
  const block = (x, y, z, sx, sy, sz) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); blocks.push(g); };
  const row = (stand, r) => ({ at: stand.first + (r + 0.5) * deep - deep / 2, top: stand.height + r * rise });
  for (let r = 0; r < ARENA.far.rows; r++) { const { at, top } = row(ARENA.far, r); block(0, top / 2, -at, 2 * ARENA.far.half + 1, top, deep); }
  for (let r = 0; r < ARENA.near.rows; r++) { const { at, top } = row(ARENA.near, r); block(0, top / 2, at, 2 * ARENA.near.half + 1, top, deep); }
  for (const s of [1, -1]) for (let r = 0; r < ARENA.ends.rows; r++) { const { at, top } = row(ARENA.ends, r); block(s * at, top / 2, 0, deep, top, 2 * ARENA.ends.half + 1); }
  return new THREE.Mesh(mergeGeometries(blocks), new THREE.MeshStandardMaterial({ color: LOOK.concrete, roughness: 0.95 }));
}

// The crowd: a seated body and a head for every seat, in the fixed shuffled order, so that showing the first so many
// fills the stands evenly. Two batches: the bodies in their shirts, and the heads.
function crowd() {
  const filled = shown(seats(), 1);
  const torso = new THREE.BoxGeometry(0.44, 0.56, 0.26); torso.translate(0, 0.5, 0);
  const lap = new THREE.BoxGeometry(0.4, 0.16, 0.42); lap.translate(0, 0.2, 0.2);
  const bodies = new THREE.InstancedMesh(mergeGeometries([torso, lap]), new THREE.MeshStandardMaterial({ roughness: 0.9 }), filled.length);
  const head = new THREE.SphereGeometry(0.115, 8, 6); head.translate(0, 0.94, 0.02);
  const heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ roughness: 0.75 }), filled.length);
  const place = new THREE.Object3D(), colour = new THREE.Color();
  filled.forEach((seat, i) => {
    // Not Math.random: the same crowd every time. No two neighbours sit quite alike.
    const pick = (list, salt) => list[Math.abs(Math.round(seat.x * 37 + seat.z * 91 + seat.y * 53 + salt * i)) % list.length];
    place.position.set(seat.x, seat.y, seat.z);
    place.rotation.y = seat.facing + ((i * 7) % 5 - 2) * 0.06;
    place.scale.setScalar(0.94 + ((i * 13) % 7) * 0.02);
    place.updateMatrix();
    bodies.setMatrixAt(i, place.matrix); heads.setMatrixAt(i, place.matrix);
    bodies.setColorAt(i, colour.set(pick(LOOK.shirts, 3)).multiplyScalar(LOOK.dim));
    heads.setColorAt(i, colour.set(pick(LOOK.skins, 5)).multiplyScalar(LOOK.dim + 0.15));
  });
  for (const batch of [bodies, heads]) { batch.instanceMatrix.needsUpdate = true; batch.instanceColor.needsUpdate = true; batch.frustumCulled = false; }
  return { bodies, heads, seats: filled.length };
}

// The hall round the court, added to `scene`: the stands and their crowd, the lit boards, the scorer's table, the
// hanging scoreboard, and a dark shell with the roof's lights. Returns { setQuality(level), show(state) }: how full
// the stands are at a quality level, and the match for the scoreboard to show.
export function createArena(scene) {
  const hall = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(2 * LOOK.hall.x, LOOK.hall.y, 2 * LOOK.hall.z),
    new THREE.MeshStandardMaterial({ color: 0x0c0e13, roughness: 1, side: THREE.BackSide }));
  shell.position.y = LOOK.hall.y / 2 - 0.02;
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.92).multiplyScalar(LOOK.glow) });
  for (const x of LOOK.panels.xs) for (const z of LOOK.panels.zs) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(LOOK.panels.wide, LOOK.panels.deep), lit);
    panel.rotation.x = Math.PI / 2;
    panel.position.set(x, LOOK.panels.y, z);
    hall.add(panel);
  }
  const people = crowd();
  hall.add(shell, steps(), people.bodies, people.heads);

  // The boards and the table carry words; the hanging scoreboard's four faces share one picture of the score.
  const score = document.createElement('canvas');
  score.width = 512; score.height = Math.round(512 * ARENA.hanging.high / ARENA.hanging.wide);
  const scorePicture = new THREE.CanvasTexture(score);
  scorePicture.colorSpace = THREE.SRGBColorSpace;
  const scoreLook = new THREE.MeshBasicMaterial({ map: scorePicture, color: new THREE.Color().setScalar(LOOK.glow) });
  boards().forEach((board, i) => {
    if (board.words === '') { hall.add(face(board, scoreLook)); return; }
    const look = new THREE.MeshBasicMaterial({ map: wordsPicture(board.words, board.width, board.height, i % 2 === 0), color: new THREE.Color().setScalar(LOOK.glow) });
    hall.add(face(board, look));
  });
  const table = new THREE.Mesh(new THREE.BoxGeometry(ARENA.table.wide, ARENA.table.high, ARENA.table.deep), new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.8 }));
  table.position.set(0, ARENA.table.high / 2, ARENA.table.z - ARENA.table.deep / 2 - 0.01);
  const core = new THREE.Mesh(new THREE.BoxGeometry(ARENA.hanging.wide - 0.02, ARENA.hanging.high + 0.3, ARENA.hanging.wide - 0.02), new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.6, metalness: 0.5 }));
  core.position.y = ARENA.hanging.y;
  hall.add(table, core);
  scene.add(hall);

  let said = '';
  return {
    setQuality(level) {
      people.bodies.count = people.heads.count = Math.round(people.seats * QUALITY[level].crowd);
    },
    // Repaints the hanging scoreboard, only when what it says has changed.
    show(state) {
      const lines = scoreLines(state), now = `${lines.home}|${lines.away}|${lines.period}`;
      if (now === said) return;
      said = now;
      const g = score.getContext('2d'), w = score.width, h = score.height;
      g.fillStyle = '#05070b'; g.fillRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'italic 800 84px "Arial Narrow", Arial, sans-serif';
      g.fillStyle = KIT.team[0]; g.fillText(lines.home, w * 0.27, h * 0.36, w * 0.44);
      g.fillStyle = KIT.team[1]; g.fillText(lines.away, w * 0.73, h * 0.36, w * 0.44);
      g.font = '800 56px "Arial Narrow", Arial, sans-serif';
      g.fillStyle = '#ffd257'; g.fillText(lines.period, w / 2, h * 0.76);
      scorePicture.needsUpdate = true;
    },
  };
}
