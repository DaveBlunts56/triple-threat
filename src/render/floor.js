import * as THREE from 'three';
import { reflector } from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { COURT, RIM, THREE_PT } from '../sim/tuning.js';
import { FLOOR_FILES, assetUrl } from './assets.js';
import { QUALITY } from './quality.js';

// length, width: the floor, in metres: the court and the run-off round it. px: pixels of the paint's picture per metre.
// plank: metres one copy of the wood's pictures covers. full: pixels along each side of the wood's pictures as they
// come. paintGloss: how rough the paint is (the wood's own gloss comes from its picture). runOff: the stain on the
// floor outside the court's lines. lift: how far the paint lies above the wood, so the two never fight for the same depth.
// tone: what the wood's colour is multiplied by, to lighten the scanned walnut toward a court's maple.
// mirror: how much of the game's reflection the floor adds to itself, where a level has one. blur: how far that
// reflection is smeared, in pixels, on a level that draws it small.
const FLOOR = Object.freeze({ length: 32, width: 19, px: 64, plank: 1.7, full: 2048, paintGloss: 0.4, runOff: 'rgba(52, 34, 20, 0.6)', lift: 0.004,
  tone: Object.freeze([1.55, 1.45, 1.22]), mirror: 0.3, blur: 3 });

// The court's paint: every line, and a darker stain over the run-off. With `wood` the playing surface and the run-off
// are painted as wood-coloured blocks under the lines (the floor of the game before it had real wood, and still the
// floor if the wood's pictures cannot be loaded); without it everything but the paint is clear.
function paintCourt(wood) {
  const c = document.createElement('canvas');
  c.width = FLOOR.length * FLOOR.px; c.height = FLOOR.width * FLOOR.px;
  const g = c.getContext('2d'), PX = FLOOR.px;
  const X = x => (x + FLOOR.length / 2) * PX, Z = z => (z + FLOOR.width / 2) * PX;
  const court = [X(-COURT.halfLength), Z(-COURT.halfWidth), 2 * COURT.halfLength * PX, 2 * COURT.halfWidth * PX];

  if (wood) {
    g.fillStyle = '#5b4632'; g.fillRect(0, 0, c.width, c.height);            // run-off
    g.fillStyle = '#c99a5b'; g.fillRect(...court);                           // playing surface
  } else {
    g.fillStyle = FLOOR.runOff; g.fillRect(0, 0, c.width, c.height);
    g.clearRect(...court);
  }

  g.strokeStyle = '#ffffff'; g.lineWidth = 0.06 * PX;
  const line = (x1, z1, x2, z2) => { g.beginPath(); g.moveTo(X(x1), Z(z1)); g.lineTo(X(x2), Z(z2)); g.stroke(); };
  const arc = (x, z, r, from, to) => { g.beginPath(); g.arc(X(x), Z(z), r * PX, from, to); g.stroke(); };

  g.strokeRect(...court);
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

// A flat sheet the size of the floor, `lift` metres above the ground, that takes shadows.
function sheet(material, lift = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR.length, FLOOR.width), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = lift;
  mesh.receiveShadow = true;
  return mesh;
}

// One of the wood's pictures, repeated every FLOOR.plank metres, with the planks running along the court's length.
async function wood(path, colour) {
  const picture = await new THREE.TextureLoader().loadAsync(assetUrl(path));
  picture.wrapS = picture.wrapT = THREE.RepeatWrapping;
  picture.rotation = Math.PI / 2;   // as they come the planks run across the court
  picture.repeat.set(FLOOR.width / FLOOR.plank, FLOOR.length / FLOOR.plank);
  picture.anisotropy = 8;
  if (colour) picture.colorSpace = THREE.SRGBColorSpace;
  return picture;
}

// A copy of `picture` at `size` pixels a side, alike in everything else. The browser makes the smaller image a moment
// later; until then the copy shows the original's.
function shrunk(picture, size) {
  const copy = picture.clone();
  createImageBitmap(picture.image, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' }).then(image => {
    copy.source = new THREE.TextureSource(image);
    copy.needsUpdate = true;
  });
  return copy;
}

// The hall's floor, added to `scene`: scanned wood under the court's paint. Resolves to { setQuality(level) }, which
// gives the wood the pictures of a quality level (one of QUALITY.order). If the wood's pictures cannot be loaded the
// floor is the painted one the game had before, and the game plays on.
export async function createFloor(scene) {
  let pictures;
  try {
    pictures = await Promise.all([wood(FLOOR_FILES.colour, true), wood(FLOOR_FILES.bumps), wood(FLOOR_FILES.gloss)]);
  } catch (error) {
    console.warn('The floor\'s wood could not be loaded; using the painted floor.', error);
    scene.add(sheet(new THREE.MeshStandardMaterial({ map: paintCourt(true), roughness: 0.55 })));
    return { setQuality: () => null };
  }
  // Each picture at each size a level asks for: the full ones as they came, the smaller ones made here.
  const sizes = new Map([[FLOOR.full, pictures]]);
  for (const level of QUALITY.order) {
    const size = QUALITY[level].floor;
    if (!sizes.has(size)) sizes.set(size, pictures.map(picture => shrunk(picture, size)));
  }
  const planks = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(...FLOOR.tone), roughness: 1, metalness: 0 });
  const paint = new THREE.MeshStandardMaterial({ map: paintCourt(false), transparent: true, depthWrite: false, roughness: FLOOR.paintGloss });
  const boards = sheet(planks);
  scene.add(boards, sheet(paint, FLOOR.lift));
  let mirror = null;   // the floor's reflection of the game, on the levels that have one
  return {
    // The wood's pictures and the mirror of a level. Returns the words for what could not be done here, or null.
    setQuality(level) {
      [planks.map, planks.normalMap, planks.roughnessMap] = sizes.get(QUALITY[level].floor);
      if (mirror) { boards.remove(mirror.target); mirror.dispose(); mirror = null; planks.emissiveNode = null; }
      let failed = null;
      const size = QUALITY[level].mirror;
      if (size > 0) {
        try {
          // The scene is drawn again as the floor would mirror it, and that picture is added to the wood's own light.
          mirror = reflector({ resolutionScale: size });
          boards.add(mirror.target);
          planks.emissiveNode = (size < 1 ? gaussianBlur(mirror, null, FLOOR.blur) : mirror).rgb.mul(FLOOR.mirror);
        } catch (error) {
          console.warn('No floor reflections here.', error);
          if (mirror) boards.remove(mirror.target);
          mirror = null; planks.emissiveNode = null; failed = 'floor reflections';
        }
      }
      planks.needsUpdate = true;
      return failed;
    },
  };
}
