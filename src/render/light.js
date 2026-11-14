import * as THREE from 'three';
import { QUALITY } from './quality.js';

// exposure: how bright the tone mapping makes the whole picture. arena: how strongly the arena's own light (the
// environment) lights and is mirrored by everything. key: the strength of the one light that casts shadows, and
// where it hangs. soft, hard: the blur of its shadow's edge, in shadow-map pixels. panel: how bright the ceiling's
// light panels are in the hidden scene the environment is made from; bowl, floor: the colours of its dark walls and
// of the light the court bounces back up.
const LIGHT = Object.freeze({
  exposure: 1.1, arena: 0.14, key: 2.4, keyAt: Object.freeze([6, 22, 9]), soft: 2.5, hard: 0.6,
  panel: 16, bowl: 0x10131a, floor: 0x6b563c,
});

// The hall as light sees it: a dark bowl, rows of bright panels under its roof, and a floor that bounces warm light
// back up. It is never drawn; the renderer turns it into the environment.
function hall() {
  const scene = new THREE.Scene();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(90, 40, 70), new THREE.MeshBasicMaterial({ color: LIGHT.bowl, side: THREE.BackSide }));
  walls.position.y = 18;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), new THREE.MeshBasicMaterial({ color: LIGHT.floor }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.9;
  scene.add(walls, ground);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.92).multiplyScalar(LIGHT.panel), side: THREE.DoubleSide });
  for (const x of [-21, -7, 7, 21]) for (const z of [-11, 0, 11]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), glow);
    panel.rotation.x = Math.PI / 2;
    panel.position.set(x, 24, z);
    scene.add(panel);
  }
  return scene;
}

// The game's light: the arena's own, built here and used as the scene's environment; one key light from high above
// that casts the shadows; and filmic tone mapping. `renderer` must already be initialised.
export function createLight(renderer, scene) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LIGHT.exposure;

  const maker = new THREE.PMREMGenerator(renderer);
  scene.environment = maker.fromScene(hall(), 0.02).texture;
  scene.environmentIntensity = LIGHT.arena;
  maker.dispose();

  const key = new THREE.DirectionalLight(0xfff4e6, LIGHT.key);
  key.position.set(...LIGHT.keyAt);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -18, right: 18, top: 12, bottom: -12, near: 1, far: 45 });
  key.shadow.bias = -0.0004;
  scene.add(key);

  return {
    // The shadow map's size and the blur of its edge at a quality level (one of QUALITY.order). The renderer resizes
    // the map before it next draws the shadow.
    setQuality(level) {
      key.shadow.mapSize.setScalar(QUALITY[level].shadow);
      key.shadow.radius = QUALITY[level].soft ? LIGHT.soft : LIGHT.hard;
    },
  };
}
