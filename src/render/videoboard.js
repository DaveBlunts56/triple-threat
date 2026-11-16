// The video board hung over centre court: four screens, a ring of moving lights above them and a strip with the score
// below, round a dark core. Its screens show the score, the clock and the teams on every level; on the levels that
// have a live picture (High and Ultra) they show the game as it is drawn, replays and all, copied small from the frame
// before whenever the board is in view.
import * as THREE from 'three';
import { uv } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA, scoreLines } from './layout.js';
import { ROSTER } from '../sim/tuning.js';
import { clockText, periodWord } from './hud.js';
import { drawLogo } from './arenas.js';

const f = Object.freeze;

// live: the levels whose screens show the game. feed: the picture's size, in pixels. ring, strip: the heights of the
// lights above the screens and of the score strip below them. glow: how much brighter than white the screens are.
// (The ring's picture is the building's scrolling one: see building.js.)
export const BOARD_LOOK = f({ live: f(['high', 'ultra']), feed: f([512, 294]), ring: 0.55, strip: 0.75, glow: 1.25 });

// What the board says: the two teams' marks, names and points, the period and the clock. `bottom`: the strip's line.
export const boardWords = state => {
  const lines = scoreLines(state);
  return { home: ROSTER.abbr[0], away: ROSTER.abbr[1], score: [state.score[0], state.score[1]], period: lines.period,
    clock: clockText(Math.max(0, state.gameClock)), bottom: `${lines.home}   ${lines.away}   ${periodWord(state.quarter)} ${clockText(Math.max(0, state.gameClock))}` };
};

function canvas(wide, high) {
  const c = document.createElement('canvas');
  c.width = wide; c.height = high;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { c, g: c.getContext('2d'), t };
}

// The screens' picture when they show no live game: each team's mark, name and points, and the period and clock.
function paintScreen({ g, c }, words, look) {
  const w = c.width, h = c.height;
  const back = g.createLinearGradient(0, 0, 0, h);
  back.addColorStop(0, '#0b1424'); back.addColorStop(1, '#03060c');
  g.fillStyle = back; g.fillRect(0, 0, w, h);
  g.fillStyle = look.colour.accent; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#c9d6e6'; g.font = '700 22px "Arial Narrow", Arial, sans-serif'; g.fillText(look.name, w / 2, 30);
  for (const [team, x] of [[0, w * 0.22], [1, w * 0.78]]) {
    drawLogo(g, team, x, h * 0.36, 78);
    g.fillStyle = '#ffffff'; g.font = '800 30px "Arial Narrow", Arial, sans-serif'; g.fillText(team ? words.away : words.home, x, h * 0.6);
    g.font = '900 64px "Arial Narrow", Arial, sans-serif'; g.fillText(String(words.score[team]), x, h * 0.8);
  }
  g.fillStyle = '#ffd257'; g.font = '800 34px "Arial Narrow", Arial, sans-serif'; g.fillText(words.period, w / 2, h * 0.42);
  g.fillStyle = '#ffffff'; g.font = '700 46px "Courier New", monospace'; g.fillText(words.clock, w / 2, h * 0.64);
}

// The strip under the screens: the score, the period and the clock in one line.
function paintStrip({ g, c }, words, look) {
  g.fillStyle = '#04060a'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = look.colour.accent; g.fillRect(0, 0, c.width, 4); g.fillRect(0, c.height - 4, c.width, 4);
  g.fillStyle = '#ffffff'; g.font = '800 40px "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(words.bottom, c.width / 2, c.height / 2 + 2, c.width * 0.95);
}

// The board, added to `group`, in the arena's `look`. Returns { pieces, setQuality(level), show(state),
// copy(renderer, camera, source) }. pieces: its core (`black`) and its ring of lights (`ring`, its pictures'
// coordinates along `ribbon` metres of picture per metre), as geometry on the court, for the building to draw with its
// own (see building.js). copy puts the frame just drawn (the scene pass's picture, `source`, a texture node) on the
// screens, when the level shows a live game and the board is in the camera's view.
export function createVideoBoard(group, look, ribbon) {
  const { y, wide, high } = ARENA.hanging, half = wide / 2;
  const board = new THREE.Group();
  board.position.y = y;
  const coreHigh = high + BOARD_LOOK.ring + BOARD_LOOK.strip + 0.5;
  const core = new THREE.BoxGeometry(wide - 0.04, coreHigh, wide - 0.04);
  core.translate(0, y + (BOARD_LOOK.ring - BOARD_LOOK.strip) / 2, 0);
  // Four faces of a kind, `height` tall, centred `at` above the board's middle (and `lift` higher, on the court), their
  // pictures' coordinates running `along` turns of their picture each.
  const faces = (height, at, lift = 0, along = 1) => mergeGeometries([0, 1, 2, 3].map(k => {
    const turn = k * Math.PI / 2, g = new THREE.PlaneGeometry(wide, height), uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * along);
    g.rotateY(turn); g.translate(Math.sin(turn) * half, at + lift, Math.cos(turn) * half);
    return g;
  }));
  const screenPicture = canvas(512, 294), strip = canvas(1024, 64);
  const glow = new THREE.Color().setScalar(BOARD_LOOK.glow);
  const screenLook = new THREE.MeshBasicMaterial({ map: screenPicture.t, color: glow });
  const screens = new THREE.Mesh(faces(high, 0), screenLook);
  const strips = new THREE.Mesh(faces(BOARD_LOOK.strip, -high / 2 - BOARD_LOOK.strip / 2 - 0.08), new THREE.MeshBasicMaterial({ map: strip.t, color: glow }));
  board.add(screens, strips);
  group.add(board);
  const pieces = { black: [core], ring: [faces(BOARD_LOOK.ring, high / 2 + BOARD_LOOK.ring / 2 + 0.08, y, wide * ribbon)] };

  // The live picture: the frame drawn small into its own target, by a quad that samples the scene pass's picture.
  const feed = new THREE.RenderTarget(...BOARD_LOOK.feed);
  const feedLook = new THREE.MeshBasicMaterial({ map: feed.texture, color: glow });
  let quad = null, from = null, live = false;
  const bounds = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, y, 0), new THREE.Vector3(wide, high + 2, wide));
  const frustum = new THREE.Frustum(), view = new THREE.Matrix4();

  let said = '';
  return {
    pieces,
    setQuality(level) { live = BOARD_LOOK.live.includes(level); screens.material = live ? feedLook : screenLook; },
    // The words, repainted only when they change.
    show(state) {
      const words = boardWords(state), now = JSON.stringify(words);
      if (now === said) return;
      said = now;
      paintScreen(screenPicture, words, look); screenPicture.t.needsUpdate = true;
      paintStrip(strip, words, look); strip.t.needsUpdate = true;
    },
    copy(renderer, camera, source) {
      if (!live || !source) return;
      view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      if (!frustum.setFromProjectionMatrix(view).intersectsBox(bounds)) return;
      // A drawn picture's first row is its top (on both backends: three makes WebGL draw as WebGPU does), while the
      // screens' pictures run from the bottom up: the copy turns it over once.
      if (source !== from) { quad?.material.dispose(); quad = new THREE.QuadMesh(new THREE.MeshBasicNodeMaterial({ colorNode: source.sample(uv().flipY()) })); from = source; }
      const before = renderer.getRenderTarget();
      renderer.setRenderTarget(feed);
      quad.render(renderer);
      renderer.setRenderTarget(before);
    },
  };
}
