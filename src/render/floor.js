import * as THREE from 'three';
import { reflector } from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { COURT, LANE } from '../sim/tuning.js';
import { drawLogo } from './arenas.js';
import { MARKS, courtMarks } from './markings.js';
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

// The court's paint: every line, and a darker stain over the run-off; and the home arena's (`look`, see arenas.js): the
// lanes and the centre circle stained in its colour, its team's mark at centre court, its city along the baselines
// and its name along the sidelines. With `wood` the playing surface and the run-off are painted as wood-coloured blocks
// under the lines (the floor of the game before it had real wood, and still the floor if the wood's pictures cannot
// be loaded); without it everything but the paint is clear.
function paintCourt(wood, look) {
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

  // The lanes and the centre circle, stained in the home team's colour.
  const L = COURT.halfLength, W = COURT.halfWidth;
  g.globalAlpha = look.colour.laneShade; g.fillStyle = look.colour.lane;
  for (const s of [1, -1]) g.fillRect(Math.min(X(s * L), X(s * (L - LANE.depth))), Z(-LANE.halfWidth), LANE.depth * PX, 2 * LANE.halfWidth * PX);
  g.beginPath(); g.arc(X(0), Z(0), LANE.centre * PX, 0, 2 * Math.PI); g.fill();
  g.globalAlpha = 1;
  // The city along the run-off behind each baseline, read from the court; the arena's name along each sideline's.
  const words = (text, x, z, turn, high) => {
    g.save(); g.translate(X(x), Z(z)); g.rotate(turn);
    g.font = `italic 900 ${Math.round(high * PX)}px "Arial Narrow", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = look.colour.lane; g.globalAlpha = 0.85; g.fillText(text, 0, 0, 12 * PX); g.restore();
  };
  const runEnd = (FLOOR.length / 2 + L) / 2, runSide = (FLOOR.width / 2 + W) / 2;
  for (const s of [1, -1]) {
    words(look.city, s * runEnd, 0, s * Math.PI / 2, 1.0);
    words(look.name, 0, s * runSide, 0, 0.9);
  }
  g.globalAlpha = 1;

  // The lines and blocks of an NBA floor (see markings.js), in white.
  g.strokeStyle = g.fillStyle = '#ffffff'; g.lineWidth = MARKS.line * PX;
  for (const mark of courtMarks()) {
    g.beginPath();
    if (mark.kind === 'block') {
      const [[x1, z1], [x2, z2]] = [mark.from, mark.to];
      g.fillRect(Math.min(X(x1), X(x2)), Math.min(Z(z1), Z(z2)), Math.abs(X(x2) - X(x1)), Math.abs(Z(z2) - Z(z1)));
      continue;
    }
    g.setLineDash(mark.dashed ? [MARKS.dash * PX, MARKS.dash * PX] : []);
    if (mark.kind === 'line') { g.moveTo(X(mark.from[0]), Z(mark.from[1])); g.lineTo(X(mark.to[0]), Z(mark.to[1])); }
    else g.arc(X(mark.at[0]), Z(mark.at[1]), mark.r * PX, mark.from, mark.to);
    g.stroke();
  }
  g.setLineDash([]);
  // The home team's mark at centre court, over the lines, inside the circle.
  drawLogo(g, look.team, X(0), Z(0), 2 * (LANE.centre - 0.25) * PX);
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

// The hall's floor, added to `scene`: scanned wood under the court's paint, dressed for the home arena (`look`, see
// arenas.js). Resolves to { setQuality(level), dress(look) }: the wood's pictures for a quality level (one of
// QUALITY.order), and the paint of another arena. If the wood's pictures cannot be loaded the floor is the painted one
// the game had before, and the game plays on.
export async function createFloor(scene, look) {
  let pictures;
  try {
    pictures = await Promise.all([wood(FLOOR_FILES.colour, true), wood(FLOOR_FILES.bumps), wood(FLOOR_FILES.gloss)]);
  } catch (error) {
    console.warn('The floor\'s wood could not be loaded; using the painted floor.', error);
    const painted = new THREE.MeshStandardMaterial({ map: paintCourt(true, look), roughness: 0.55 });
    scene.add(sheet(painted));
    return { setQuality: () => null, dress: to => { painted.map.dispose(); painted.map = paintCourt(true, to); painted.needsUpdate = true; } };
  }
  // Each picture at each size a level asks for: the full ones as they came, the smaller ones made here.
  const sizes = new Map([[FLOOR.full, pictures]]);
  for (const level of QUALITY.order) {
    const size = QUALITY[level].floor;
    if (!sizes.has(size)) sizes.set(size, pictures.map(picture => shrunk(picture, size)));
  }
  const planks = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(...FLOOR.tone), roughness: 1, metalness: 0 });
  const paint = new THREE.MeshStandardMaterial({ map: paintCourt(false, look), transparent: true, depthWrite: false, roughness: FLOOR.paintGloss });
  const boards = sheet(planks);
  scene.add(boards, sheet(paint, FLOOR.lift));
  let mirror = null, smear = null;   // the floor's reflection of the game, on the levels that have one, and its blur
  return {
    // The court's paint for the arena `to`.
    dress(to) { paint.map.dispose(); paint.map = paintCourt(false, to); paint.needsUpdate = true; },
    // The wood's pictures and the mirror of a level. Returns the words for what could not be done here, or null.
    setQuality(level) {
      [planks.map, planks.normalMap, planks.roughnessMap] = sizes.get(QUALITY[level].floor);
      if (mirror) { boards.remove(mirror.target); mirror.dispose(); smear?.dispose(); mirror = smear = null; planks.emissiveNode = null; }
      let failed = null;
      const size = QUALITY[level].mirror;
      if (size > 0) {
        try {
          // The scene is drawn again as the floor would mirror it, and that picture is added to the wood's own light.
          mirror = reflector({ resolutionScale: size });
          boards.add(mirror.target);
          smear = size < 1 ? gaussianBlur(mirror, null, FLOOR.blur) : null;
          planks.emissiveNode = (smear ?? mirror).rgb.mul(FLOOR.mirror);
        } catch (error) {
          console.warn('No floor reflections here.', error);
          if (mirror) boards.remove(mirror.target);
          mirror = smear = null; planks.emissiveNode = null; failed = 'floor reflections';
        }
      }
      planks.needsUpdate = true;
      return failed;
    },
  };
}
