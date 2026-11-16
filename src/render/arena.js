import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA, seats, upperSeats, shown, boards } from './layout.js';
import { ROSTER } from '../sim/tuning.js';
import { arenaOf } from './arenas.js';
import { BUILDING, createBuilding } from './building.js';
import { createVideoBoard } from './videoboard.js';
import { QUALITY } from './quality.js';
import { KIT } from './kit.js';
import { ADS, adAt } from './life.js';

// concrete, seat: the colours of the stands' steps and of an empty seat's back. panels: the roof's lights, as in light.js's
// hidden hall, drawn here so the floor has them to mirror. glow: how much brighter than white the lit boards and the
// roof's lights are, so that they bloom. shirts, skins: what the crowd wears and its skin tones.
const LOOK = Object.freeze({
  concrete: 0x1b1e25, seat: 0x23324f, glow: 1.7,
  panels: Object.freeze({ xs: [-21, -7, 7, 21], zs: [-11, 0, 11], wide: 9, deep: 5, y: 24 }),
  shirts: Object.freeze([KIT.team[0], KIT.team[0], KIT.team[0], KIT.team[1], '#cfd3d8', '#cfd3d8', '#2a2d33', '#2a2d33', '#5b6570', '#8c8f96', '#6a5a4a', '#3e4c5e']),
  dim: 0.5,   // the stands are darker than the court: the crowd's colours are multiplied by this
  skins: Object.freeze(['#f0cfae', '#d9a877', '#a8744a', '#7a4f31', '#55371f']),
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

// The crowd: a seated body and a head for every seat, the upper deck's and the lower stands', in the fixed shuffled
// order, so that showing the first so many fills the stands evenly. Two batches: the bodies in their shirts, and the
// heads. Only the lower stands' fans move with the game; the upper deck's sit still.
function crowd() {
  const filled = shown([...seats(), ...upperSeats()], 1);
  const torso = new THREE.BoxGeometry(0.44, 0.56, 0.26); torso.translate(0, 0.5, 0);
  const lap = new THREE.BoxGeometry(0.4, 0.16, 0.42); lap.translate(0, 0.2, 0.2);
  const bodies = new THREE.InstancedMesh(mergeGeometries([torso, lap]), new THREE.MeshStandardMaterial({ roughness: 0.9 }), filled.length);
  const head = new THREE.SphereGeometry(0.115, 8, 6); head.translate(0, 0.94, 0.02);
  const heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ roughness: 0.75 }), filled.length);
  // Something to wave at a free-throw shooter: one for every seat behind a baseline, shown only while they wave.
  const stick = new THREE.BoxGeometry(0.07, 0.7, 0.07); stick.translate(0, 1.5, 0);
  const sticks = new THREE.InstancedMesh(stick, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }), filled.length);
  sticks.visible = false;
  const place = new THREE.Object3D(), colour = new THREE.Color(), hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  // Each seat's fan: whose he is (0 the home team's, 1 the visitors', 2 nobody's) and the end he sits behind (+1, -1, or 0).
  const fans = filled.map((seat, i) => {
    // Not Math.random: the same crowd every time. No two neighbours sit quite alike.
    const pick = (list, salt) => Math.abs(Math.round(seat.x * 37 + seat.z * 91 + seat.y * 53 + salt * i)) % list.length;
    const shirt = pick(LOOK.shirts, 3);
    bodies.setColorAt(i, colour.set(LOOK.shirts[shirt]).multiplyScalar(LOOK.dim));
    heads.setColorAt(i, colour.set(LOOK.skins[pick(LOOK.skins, 5)]).multiplyScalar(LOOK.dim + 0.15));
    return { seat, turn: seat.facing + ((i * 7) % 5 - 2) * 0.06, size: 0.94 + ((i * 13) % 7) * 0.02, of: shirt < 3 ? 0 : shirt === 3 ? 1 : 2,
      end: Math.abs(seat.x) >= ARENA.ends.first - 0.5 ? Math.sign(seat.x) : 0, upper: seat.y >= ARENA.upper.height - 0.1 };
  });
  // Puts the first `count` fans in their seats as the crowd's mood has them at `now`: on their feet and bouncing when
  // their team scores, shaking with anger at a call against the home team, and behind a hoop waving at a shooter.
  // The upper deck's are placed only when `all` (once, at the start).
  function sit(count, life, now, all = false) {
    const home = Math.min(1, life?.cheer[0] ?? 0), away = Math.min(1, life?.cheer[1] ?? 0), boo = Math.min(1, life?.boo ?? 0), wave = life?.distract ?? 0;
    for (let i = 0; i < count; i++) {
      const fan = fans[i];
      if (fan.upper && !all) { if (wave !== 0) sticks.setMatrixAt(i, hidden); continue; }   // placed once, at the start
      const waving = wave !== 0 && fan.end === wave;
      const up = waving ? 1 : fan.of === 0 ? home : fan.of === 1 ? away : home * 0.4;
      const angry = fan.of === 1 ? 0 : boo;
      place.position.set(fan.seat.x, fan.seat.y + up * (0.2 + 0.3 * Math.abs(Math.sin(now * (waving ? 11 : 8) + i * 1.7))), fan.seat.z);
      place.rotation.set(0, fan.turn + angry * 0.3 * Math.sin(now * 13 + i * 2.1), 0);
      place.scale.setScalar(fan.size);
      place.updateMatrix();
      bodies.setMatrixAt(i, place.matrix); heads.setMatrixAt(i, place.matrix);
      if (wave !== 0) {
        place.rotation.z = waving ? 0.7 * Math.sin(now * 10 + i * 1.3) : 0;
        place.scale.setScalar(waving ? fan.size : 0);
        place.updateMatrix();
        sticks.setMatrixAt(i, place.matrix);
      }
    }
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
    sticks.visible = wave !== 0;
    if (wave !== 0) { sticks.count = count; sticks.instanceMatrix.needsUpdate = true; }
  }
  sit(filled.length, null, 0, true);
  for (const batch of [bodies, heads, sticks]) batch.frustumCulled = false;
  bodies.instanceColor.needsUpdate = heads.instanceColor.needsUpdate = true;
  return { bodies, heads, sticks, seats: filled.length, sit };
}

// The home side's arena, added to `scene`: the stands and their crowd, the building round them (building.js), the lit
// boards, the scorer's table, the video board (videoboard.js), and a dark shell with the roof's lights. Returns
// { setQuality(level), show(state), live(life, now), feed(renderer, camera, picture) }: how full the stands are at a
// quality level, the match for the video board to show, the crowd's mood, and the frame just drawn for its screens.
export function createArena(scene) {
  const hall = new THREE.Group(), look = arenaOf(), R = ARENA.roof;
  // The dark shell round everything, its top the roof's underside.
  const shell = new THREE.Mesh(new THREE.BoxGeometry(2 * R.hallX, R.y, 2 * R.hallZ),
    new THREE.MeshStandardMaterial({ color: look.colour.ceiling, roughness: 1, side: THREE.BackSide }));
  shell.position.y = R.y / 2 - 0.02;
  // The video board's core and ring, and the stands' steps, are drawn with the building's own (see building.js).
  const board = createVideoBoard(hall, look, BUILDING.ribbon / 2048);
  const building = createBuilding(hall, look, ROSTER.teams[look.team], { concrete: steps(), black: board.pieces.black, ring: board.pieces.ring });
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.92).multiplyScalar(LOOK.glow) });
  // The roof's lights are one mesh: twelve separate ones would each be drawn again in the floor's mirror.
  const panels = [];
  for (const x of LOOK.panels.xs) for (const z of LOOK.panels.zs) {
    const panel = new THREE.PlaneGeometry(LOOK.panels.wide, LOOK.panels.deep);
    panel.rotateX(Math.PI / 2);
    panel.translate(x, LOOK.panels.y, z);
    panels.push(panel);
  }
  hall.add(new THREE.Mesh(mergeGeometries(panels), lit));
  const people = crowd();
  hall.add(shell, people.bodies, people.heads, people.sticks);

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

  let said = '', full = people.seats, stirred = false;
  return {
    setQuality(level) {
      full = Math.round(people.seats * QUALITY[level].crowd);
      people.bodies.count = people.heads.count = full;
      board.setQuality(level);
    },
    // The frame just drawn, onto the video board's screens (see videoboard.js).
    feed: (renderer, camera, picture) => board.copy(renderer, camera, picture),
    // The crowd and the boards at `now` seconds, as the crowd's mood (`life`, see life.js) has them: fans who have
    // gone home are no longer drawn, the rest move when there is something to move for, and each board changes its
    // advertisement in turn.
    live(life, now) {
      building.live(now);
      const count = Math.round(full * (1 - life.left));
      people.bodies.count = people.heads.count = count;
      const stirring = life.cheer[0] > 0 || life.cheer[1] > 0 || life.boo > 0 || life.distract !== 0;
      if (stirring || stirred) people.sit(count, stirring ? life : null, now);   // once more after it ends, to sit them down
      stirred = stirring;
      for (const ad of adLooks) {
        const now_ = adAt(ad.board, now);
        if (now_ !== ad.showing) { ad.showing = now_; ad.look.map = adPictures[now_]; ad.look.needsUpdate = true; }
      }
    },
    // The match, for the video board.
    show(state) { board.show(state); },
  };
}
