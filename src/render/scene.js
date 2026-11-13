import * as THREE from 'three';
import { COURT, RIM, BOARD, THREE_PT } from '../sim/tuning.js';
import { QUALITY } from './quality.js';

const FLOOR = { length: 32, width: 19 };   // court plus run-off
const PX = 64;                             // texture pixels per metre
const CAMERA = { height: 11, back: 18, lookZ: 1, maxX: 9, ease: 0.08, fov: 40, minAcross: 60 };   // degrees; minAcross: narrowest horizontal view allowed

// The floor texture: wood, with every court line painted on.
function paintCourt() {
  const c = document.createElement('canvas');
  c.width = FLOOR.length * PX; c.height = FLOOR.width * PX;
  const g = c.getContext('2d');
  const X = x => (x + FLOOR.length / 2) * PX, Z = z => (z + FLOOR.width / 2) * PX;

  g.fillStyle = '#5b4632'; g.fillRect(0, 0, c.width, c.height);            // run-off
  g.fillStyle = '#c99a5b';                                                 // playing surface
  g.fillRect(X(-COURT.halfLength), Z(-COURT.halfWidth), 2 * COURT.halfLength * PX, 2 * COURT.halfWidth * PX);

  g.strokeStyle = '#ffffff'; g.lineWidth = 0.06 * PX;
  const line = (x1, z1, x2, z2) => { g.beginPath(); g.moveTo(X(x1), Z(z1)); g.lineTo(X(x2), Z(z2)); g.stroke(); };
  const arc = (x, z, r, from, to) => { g.beginPath(); g.arc(X(x), Z(z), r * PX, from, to); g.stroke(); };

  g.strokeRect(X(-COURT.halfLength), Z(-COURT.halfWidth), 2 * COURT.halfLength * PX, 2 * COURT.halfWidth * PX);
  line(0, -COURT.halfWidth, 0, COURT.halfWidth);
  arc(0, 0, 1.8, 0, 2 * Math.PI);

  for (const s of [1, -1]) {
    // Three-point line: an arc around the rim, straight in the corners.
    const reach = Math.asin(THREE_PT.cornerZ / THREE_PT.radius);
    const mid = s === 1 ? Math.PI : 0;                 // the arc bulges toward centre court
    arc(s * RIM.x, 0, THREE_PT.radius, mid - reach, mid + reach);
    const cornerX = s * (RIM.x - Math.sqrt(THREE_PT.radius ** 2 - THREE_PT.cornerZ ** 2));
    for (const z of [-THREE_PT.cornerZ, THREE_PT.cornerZ]) line(s * COURT.halfLength, z, cornerX, z);
    // Key and free-throw circle.
    const keyX = s * (COURT.halfLength - 5.8);
    g.strokeRect(Math.min(X(keyX), X(s * COURT.halfLength)), Z(-2.45), 5.8 * PX, 4.9 * PX);
    arc(keyX, 0, 1.8, 0, 2 * Math.PI);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function buildHoop(s) {
  const hoop = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.6 });

  const board = new THREE.Mesh(new THREE.BoxGeometry(0.05, BOARD.top - BOARD.bottom, 2 * BOARD.halfWidth), white);
  board.position.set(s * (BOARD.x + 0.025), (BOARD.top + BOARD.bottom) / 2, 0);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM.radius, RIM.tube, 8, 32), new THREE.MeshStandardMaterial({ color: 0xff5a1f }));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(s * RIM.x, RIM.height, 0);

  const net = new THREE.Mesh(
    new THREE.CylinderGeometry(RIM.radius, RIM.radius * 0.6, 0.4, 12, 3, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }),
  );
  net.position.set(s * RIM.x, RIM.height - 0.2, 0);

  const poleX = s * (COURT.halfLength + 1);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.5), steel);
  pole.position.set(poleX, 1.75, 0);
  const armLength = Math.abs(poleX) - BOARD.x;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(armLength, 0.12, 0.12), steel);
  arm.position.set(s * (BOARD.x + armLength / 2), 3.4, 0);

  hoop.add(board, rim, net, pole, arm);
  for (const m of [board, pole, arm]) m.castShadow = true;
  return hoop;
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

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR.length, FLOOR.width),
    new THREE.MeshStandardMaterial({ map: paintCourt(), roughness: 0.55 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor, buildHoop(1), buildHoop(-1));

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a44, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(4, 20, 8);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 12, bottom: -12, near: 1, far: 40 });
  scene.add(sun);

  // The render resolution and the shadow map of a quality level ('high' or 'low'). Nothing else is needed: the
  // renderer resizes its drawing buffer when the pixel ratio changes, and resizes the shadow map to mapSize, throwing
  // the old one away, before it next draws the shadow.
  const setQuality = level => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[level].pixelRatio));
    sun.shadow.mapSize.setScalar(QUALITY[level].shadow);
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

  return {
    scene, camera, backend, setQuality,
    render: () => renderer.render(scene, camera),
    // Eases the camera along the sideline toward court position x.
    follow(x) {
      followX += (Math.min(Math.max(x, -CAMERA.maxX), CAMERA.maxX) - followX) * CAMERA.ease;
      aim();
    },
  };
}
