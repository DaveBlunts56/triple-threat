import * as THREE from 'three';
import { COURT, RIM, BOARD, THREE_PT } from '../sim/tuning.js';
import { QUALITY } from './quality.js';
import { createLight } from './light.js';
import { createFloor } from './floor.js';
import { createArena } from './arena.js';
import { ARENA } from './layout.js';
import { NET, createNet, stepNet } from './net.js';

const MESH = 64;                           // texture pixels on a side of one cell of the net's picture
const CAMERA = { ...ARENA.camera, lookZ: 1, ease: 0.08, fov: 40, minAcross: 60 };   // degrees; minAcross: narrowest horizontal view allowed

// The net's picture: a faint white wash, and in each of its NET.strings by NET.knots cells both diagonals, so the
// cells read as a net's diamonds. The diagonals of the cells either side of it are drawn too and cut off at the edge,
// so where the picture runs round and meets itself the lines go on unbroken.
function paintNet() {
  const c = document.createElement('canvas');
  c.width = NET.strings * MESH; c.height = NET.knots * MESH;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255, 255, 255, 0.15)'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#ffffff'; g.lineWidth = 0.1 * MESH;
  g.beginPath();
  for (let col = -1; col <= NET.strings; col++) for (let row = 0; row < NET.knots; row++) {
    const x = col * MESH, y = row * MESH;
    g.moveTo(x, y); g.lineTo(x + MESH, y + MESH);
    g.moveTo(x + MESH, y); g.lineTo(x, y + MESH);
  }
  g.stroke();
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
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
function drape(sleeve, net) {
  const position = sleeve.geometry.attributes.position, p = position.array, n = NET.strings;
  for (let row = 0; row <= NET.knots; row++) {
    const to = 3 * row * (n + 1);
    p.set(net.points.subarray(3 * row * n, 3 * (row + 1) * n), to);
    p.copyWithin(to + 3 * n, to, to + 3);
  }
  position.needsUpdate = true;
}

// The hoop at x = s * RIM.x, its net drawn in `netLook`. Returns the hoop and its net, and the sleeve that shows it.
// The white paint on a backboard: its edge and the square above the rim. Clear everywhere else.
function paintBoard() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * (BOARD.top - BOARD.bottom) / (2 * BOARD.halfWidth));
  const g = c.getContext('2d'), per = c.width / (2 * BOARD.halfWidth);   // pixels per metre
  g.strokeStyle = '#ffffff';
  g.lineWidth = 0.05 * per;
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, c.width - g.lineWidth, c.height - g.lineWidth);
  const square = { wide: 0.59, high: 0.45 }, foot = c.height - (RIM.height - BOARD.bottom) * per;   // the square sits on the rim's height
  g.strokeRect((c.width - square.wide * per) / 2, foot - square.high * per, square.wide * per, square.high * per);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildHoop(s, netLook) {
  const hoop = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.45, metalness: 0.7 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x1b2f6b, roughness: 0.9 });

  // The backboard: a pane of glass, with its white edge and the shooter's square painted on the side the court sees.
  const high = BOARD.top - BOARD.bottom, wide = 2 * BOARD.halfWidth;
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xdfeef5, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false });
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.03, high, wide), glass);
  board.position.set(s * (BOARD.x + 0.015), (BOARD.top + BOARD.bottom) / 2, 0);
  const marks = new THREE.Mesh(new THREE.PlaneGeometry(wide, high),
    new THREE.MeshBasicMaterial({ map: paintBoard(), transparent: true, depthWrite: false, toneMapped: false }));
  marks.rotation.y = -s * Math.PI / 2;
  marks.position.set(s * (BOARD.x - 0.002), board.position.y, 0);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM.radius, RIM.tube, 10, 40), new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.35, metalness: 0.6 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(s * RIM.x, RIM.height, 0);

  const net = createNet(s), sleeve = buildSleeve(netLook);
  drape(sleeve, net);

  const poleX = s * (COURT.halfLength + 1);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.36, 3.5, 0.36), pad);
  pole.position.set(poleX, 1.75, 0);
  const armLength = Math.abs(poleX) - BOARD.x;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(armLength, 0.12, 0.12), steel);
  arm.position.set(s * (BOARD.x + armLength / 2), 3.4, 0);

  hoop.add(board, marks, rim, sleeve, pole, arm);
  for (const m of [rim, pole, arm]) m.castShadow = true;
  return { hoop, net, sleeve };
}

// Builds the renderer, court, hoops, lights and camera. Resolves to null (after telling the player) if nothing can draw.
export async function createScene(canvas) {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
  try {
    await renderer.init();   // falls back to WebGL 2 by itself when WebGPU is missing
  } catch {
    document.body.textContent = 'This browser supports neither WebGPU nor WebGL 2, so the game cannot run.';
    return null;
  }
  const backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);

  const floor = await createFloor(scene);
  const arena = createArena(scene);
  // The nets' picture as its colour and its see-through, unlit, both sides drawn, and not written to the depth buffer.
  const netLook = new THREE.MeshBasicMaterial({ map: paintNet(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const hoops = [buildHoop(1, netLook), buildHoop(-1, netLook)];
  scene.add(...hoops.map(h => h.hoop));
  let ball = null;   // the ball as it was on the last call of swayNets: x, y, z, vx, vy, vz

  const light = createLight(renderer, scene);

  // The render resolution and the shadow map of a quality level (one of QUALITY.order). Nothing else is needed: the
  // renderer resizes its drawing buffer when the pixel ratio changes, and resizes the shadow map to mapSize, throwing
  // the old one away, before it next draws the shadow.
  const setQuality = level => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[level].pixelRatio));
    light.setQuality(level);
    floor.setQuality(level);
    arena.setQuality(level);
  };
  setQuality('high');

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 100);
  let followX = 0;
  const aim = () => {
    camera.position.set(followX, CAMERA.height, CAMERA.back);
    camera.lookAt(followX, 0, CAMERA.lookZ);
  };
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    // On a narrow window, widen the view so enough of the court's length stays on screen.
    const needed = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA.minAcross / 2)) / camera.aspect);
    camera.fov = Math.max(CAMERA.fov, THREE.MathUtils.radToDeg(needed));
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize(); aim();
  const point = new THREE.Vector3();

  return {
    scene, camera, backend, setQuality,
    // The match, for the arena's scoreboard.
    watch: state => arena.show(state),
    render: () => renderer.render(scene, camera),
    // Eases the camera along the sideline toward court position x.
    follow(x) {
      followX += (Math.min(Math.max(x, -CAMERA.maxX), CAMERA.maxX) - followX) * CAMERA.ease;
      aim();
    },
    // Moves both nets on by dt seconds while the ball went from where it was on the last call to where `now` is.
    swayNets(now, dt) {
      const to = { x: now.x, y: now.y, z: now.z, vx: now.vx, vy: now.vy, vz: now.vz };
      for (const { net, sleeve } of hoops) { stepNet(net, ball, to, dt); drape(sleeve, net); }
      ball = to;
    },
    // Where the point (x, y, z) of the court is on the page as last drawn, in CSS pixels from the top left.
    toScreen(x, y, z) {
      point.set(x, y, z).project(camera);
      return { x: (point.x + 1) / 2 * window.innerWidth, y: (1 - point.y) / 2 * window.innerHeight };
    },
  };
}
