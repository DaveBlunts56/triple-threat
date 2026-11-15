import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BALL, MOVES, ROSTER } from '../sim/tuning.js';
import { onFloor } from '../sim/state.js';
import { assetUrl } from './assets.js';
import { MOTION, legMotion, armMotion, legLook, newMarks, noteChanges, drawnFacing, wholeBody } from './motion.js';
import { BALL_IN_HAND, ballHands, crossFrom, dribbleSpot, moveSpot } from './hands.js';
import { checkGaits, checkMotions, checkFacts, personName, courtPeople, sized, missingPeople, checkHands } from './checks.js';
import { easeFacing, leanOf, lookTarget, headTurn, easeHead } from './bearing.js';
import { createAnimator } from './animator.js';
import { createFace, faceWants } from './face.js';
import { ATLAS, KIT, atlasPart, atlasRect, atlasUV, kitOps, heightOps, kitColours, paintKit, normalFromHeight } from './kit.js';
import { MATERIALS, kitMaterial, partMaterial, fabricTiles, isPhysical, isDetailed } from './materials.js';
import { QUALITY, modelFor } from './quality.js';

// The size of each garment's painted picture at full quality, in pixels along each side.
const GARMENT = Object.freeze({ jersey: 1024, shorts: 512 });

const IDLE = Object.freeze({ clip: 'idle', rate: 1 });   // what everyone's legs do before and after a match
const UPRIGHT = Object.freeze({ forward: 0, side: 0 }), AHEAD = Object.freeze({ yaw: 0, pitch: 0 });
const hipsOf = root => root.getObjectByProperty('isBone', true);   // the first bone under a root: the others hang from it

// Where the palm of the hand bone `hand` is on the court, { x, y, z }: the wrist's place moved BALL_IN_HAND.palm
// toward the fingers, along the bone's own +y axis. Each person is scaled, so that axis is measured out in metres on
// the court, not in lengths of his bone.
const toFingers = new THREE.Vector3();
function palmOf(hand) {
  hand.updateWorldMatrix(true, false);   // the motion has just moved the bones, and nothing has been drawn since
  const at = hand.matrixWorld.elements;
  toFingers.set(at[4], at[5], at[6]).setLength(BALL_IN_HAND.palm);
  return { x: at[12] + toFingers.x, y: at[13] + toFingers.y, z: at[14] + toFingers.z };
}

async function json(path) {
  const response = await fetch(assetUrl(path));
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

// Loads the generated players and their motions. Resolves to six groups, one per court player, an `update` that
// places each from the match, puts the model of whoever plays there in it and plays the motions his state calls for,
// and a `setQuality` that dresses all ten for a quality level. Each is drawn in full near `camera` and as his far
// model, one mesh in one picture, beyond (see modelFor). Rejects if a file is missing or incomplete.
export async function loadPeople(camera) {
  const loader = new GLTFLoader();
  const [players, motion, facts] = await Promise.all([
    loader.loadAsync(assetUrl('assets/players.glb')),
    loader.loadAsync(assetUrl('assets/motion.glb')),
    json('assets/motion.json'),
  ]);
  const roots = players.scene.children.filter(o => o.name.startsWith('player-'));
  const missing = missingPeople(roots.map(root => root.name));
  if (missing.length) throw new Error(`assets/players.glb lacks ${missing.join(', ')}`);
  const clips = Object.fromEntries(motion.animations.map(clip => [clip.name, clip]));
  checkMotions(Object.keys(clips));
  checkGaits(facts);
  checkFacts(facts);
  const hipHeight = hipsOf(motion.scene).position.y;   // of the player the motions were made on, standing at rest

  const pending = [];   // the pictures still being made
  const dressed = [];   // [mesh, its material at each quality level], for every mesh of every person
  const tiles = fabricTiles(path => new THREE.TextureLoader().load(assetUrl(path)));

  // A picture painted with `ops` in `colours`, `size` pixels each way, as a texture: handed over as an image made off
  // the main thread, so that showing a player for the first time does not stall.
  function picture(ops, colours, size) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    paintKit(canvas.getContext('2d'), size, ops, colours);
    const made = new THREE.Texture();
    made.flipY = false;   // as in the file, where the top row of a picture is v = 0
    made.colorSpace = THREE.SRGBColorSpace;
    made.anisotropy = 4;
    pending.push(createImageBitmap(canvas).then(image => { made.image = image; made.needsUpdate = true; }));
    return made;
  }

  // What stands out of a garment (its numbers and stitching), as a normal map.
  function raised(part, number) {
    const size = KIT.size, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    paintKit(g, size, heightOps(part, number), kitColours(0));
    const made = new THREE.DataTexture(normalFromHeight(g.getImageData(0, 0, size, size).data, size), size, size, THREE.RGBAFormat);
    made.flipY = false;
    made.colorSpace = THREE.NoColorSpace;
    made.magFilter = THREE.LinearFilter; made.minFilter = THREE.LinearMipmapLinearFilter; made.generateMipmaps = true;
    made.needsUpdate = true;
    return made;
  }

  // A mesh's material at each quality level: plain, detailed and physical, each shared by the levels that use it.
  const atEachLevel = make => {
    const made = {};
    return Object.fromEntries(QUALITY.order.map(level => {
      const kind = isPhysical(level) ? 'physical' : isDetailed(level) ? 'detailed' : 'plain';
      made[kind] ??= make(level);
      return [level, made[kind]];
    }));
  };

  // His far model's one picture at `scale` times ATLAS.size: the skin, hair and shoes of the file and his kit, each
  // drawn in its own place (see ATLAS). `drawn` is { part: the file's picture of it }.
  function onePicture(drawn, team, number, scale) {
    const canvas = document.createElement('canvas'), size = Math.round(ATLAS.size * scale);
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    for (const part of Object.keys(ATLAS.cells)) {
      const [x, y, w, h] = atlasRect(part).map(n => n * size);
      if (part === 'jersey' || part === 'shorts') {
        g.save();
        g.translate(x, y); g.scale(w / KIT.size, h / KIT.size);
        paintKit(g, KIT.size, kitOps(part, number), kitColours(team));
        g.restore();
      } else if (drawn[part]) g.drawImage(drawn[part], x, y, w, h);
    }
    const made = new THREE.Texture();
    made.flipY = false;
    made.colorSpace = THREE.SRGBColorSpace;
    made.anisotropy = 4;
    pending.push(createImageBitmap(canvas).then(image => { made.image = image; made.needsUpdate = true; }));
    return made;
  }

  // How rough each part of the far model is, as a tiny picture laid out like ATLAS.cells (quarters across, halves
  // down): the green of a pixel is the roughness there.
  const roughness = (() => {
    const rough = { skin: MATERIALS.skin, jersey: MATERIALS.rough.jersey, shorts: MATERIALS.rough.shorts, hair: MATERIALS.hair, shoes: MATERIALS.shoes };
    const canvas = document.createElement('canvas');
    canvas.width = 4; canvas.height = 2;
    const g = canvas.getContext('2d');
    for (const [part, [x, y, w, h]] of Object.entries(ATLAS.cells)) {
      g.fillStyle = `rgb(0, ${Math.round(rough[part] * 255)}, 0)`;
      g.fillRect(x * 4, y * 2, w * 4, h * 2);
    }
    const made = new THREE.CanvasTexture(canvas);
    made.flipY = false;
    made.magFilter = made.minFilter = THREE.NearestFilter;
    made.generateMipmaps = false;
    return made;
  })();

  // The far model: `parts` ([mesh, its place in ATLAS]) joined into one mesh on the same skeleton, wearing one picture.
  // Each part is one more thing to draw in every pass; joined, the whole player is drawn at once.
  function farModel(parts, drawn, team, number) {
    const whole = mergeGeometries(parts.map(([part, place]) => {
      const from = part.geometry, uv = from.getAttribute('uv'), geometry = new THREE.BufferGeometry();
      // Every part's numbers in the same form, so that they can be joined; its picture's points moved to its place.
      const floats = (attribute, size) => new THREE.Float32BufferAttribute(Float32Array.from({ length: attribute.count * size }, (_, i) => attribute.getComponent(Math.floor(i / size), i % size)), size);
      geometry.setAttribute('position', floats(from.getAttribute('position'), 3));
      geometry.setAttribute('normal', floats(from.getAttribute('normal'), 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: uv.count }, (_, i) => atlasUV(place, uv.getX(i), uv.getY(i))).flat(), 2));
      const joints = from.getAttribute('skinIndex');
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from({ length: joints.count * 4 }, (_, i) => joints.getComponent(Math.floor(i / 4), i % 4)), 4));
      geometry.setAttribute('skinWeight', floats(from.getAttribute('skinWeight'), 4));
      geometry.setIndex(Array.from(from.getIndex().array));
      return geometry;
    }));
    if (!whole) throw new Error('the parts of a player could not be joined');
    const byScale = {};
    // Cut-outs instead of blending for the hair: no sorting artefacts, and it writes depth like everything else.
    const made = Object.fromEntries(QUALITY.order.map(level => [level, byScale[QUALITY[level].textures] ??= new THREE.MeshStandardMaterial({
      map: onePicture(drawn, team, number, QUALITY[level].textures), roughnessMap: roughness, roughness: 1, metalness: 0, alphaTest: MATERIALS.cutout, side: THREE.DoubleSide,
    })]));
    const [first] = parts[0], far = new THREE.SkinnedMesh(whole, made.high);
    far.name = 'far';
    far.bind(first.skeleton, first.bindMatrix);
    far.castShadow = true;
    far.frustumCulled = false;
    far.visible = false;
    first.parent.add(far);
    dressed.push([far, made]);
    return far;
  }

  // One model and animator per person, made once: a substitution only changes who is shown. `index` is his place
  // among the ten. His skin, kit, hair and shoes are meshes of their own on his skeleton, each in its own material:
  // that is his near model. His far model is the same parts joined.
  function person(model, team, number, index) {
    const near = [], parts = [], drawn = {};
    let skin = null;   // the mesh that carries his expressions
    model.traverse(part => {
      // GLTFLoader numbers the bone names that repeat in the file (mixamorigHips_1); the motions look for the plain ones.
      if (part.isBone) part.name = THREE.PropertyBinding.sanitizeNodeName(part.userData.name);
      if (!part.isMesh) return;
      const kind = part.material.name.split('-')[0];
      const place = atlasPart(part.material.name);
      if (place) parts.push([part, place]);
      if (place && part.material.map) drawn[place] = part.material.map.image;
      let made;
      if (kind === 'jersey' || kind === 'shorts') {
        const normal = raised(kind, number), colours = kitColours(team), sizes = {};
        made = atEachLevel(level => {
          const size = Math.round(GARMENT[kind] * QUALITY[level].textures);
          sizes[size] ??= picture(kitOps(kind, number), colours, size);
          return kitMaterial(level, { part: kind, map: sizes[size], normal, fabric: kind === 'jersey' ? tiles.knit : tiles.twill });
        });
      } else made = atEachLevel(level => partMaterial(level, kind, part.material.map, part.material.normalMap));
      part.material.dispose();
      part.material = made.high;
      part.castShadow = kind !== 'cornea';
      part.frustumCulled = false;   // its bounds are those of the rest pose, not of where the motion puts it
      dressed.push([part, made]);
      near.push(part);
      // The file gives every part the expressions' targets, all still but the skin's: only the skin keeps them.
      if (kind === 'skin') skin = part;
      else if (part.morphTargetInfluences) { part.geometry.morphAttributes = {}; part.morphTargetInfluences = undefined; part.morphTargetDictionary = undefined; }
    });
    if (!parts.length) throw new Error(`${model.name} has nothing to draw`);
    const far = farModel(parts, drawn, team, number);
    const scale = hipsOf(model).position.y / hipHeight;   // his size against the player the motions were made on
    const hands = { left: model.getObjectByName('mixamorigLeftHand'), right: model.getObjectByName('mixamorigRightHand') };
    checkHands(model.name, hands);   // so a broken file falls back to capsules at load, not on the first possession
    // arms: the arm motion he was given on the last frame, or null when his arms followed his legs.
    return { model, hands, near, far, drawnAs: 'near', face: createFace(skin, team * 100 + number), animator: createAnimator(model, clips, facts, scale, index), gaits: sized(facts.gaits, scale), last: 'idle', arms: null };
  }
  // Shows his `which` model ('near' or 'far') and hides the other.
  const wear = (he, which) => {
    if (he.drawnAs === which) return;
    for (const mesh of he.near) mesh.visible = which === 'near';
    he.far.visible = which === 'far';
    he.drawnAs = which;
  };
  let level = 'high';   // the quality level the players are dressed for
  const people = {};
  ROSTER.numbers.forEach((numbers, team) => numbers.forEach((number, row) => {
    const name = personName(team, number);
    people[name] = person(roots.find(root => root.name === name), team, number, team * numbers.length + row);
  }));
  await Promise.all(pending);

  const models = Array.from({ length: 10 }, () => new THREE.Group());   // one for each player a match can have; a smaller match uses the first of them
  const shown = [];   // the person whose model is in each group
  // How each group's player was drawn on the last frame: the heading the group was turned to (null before the first),
  // how far his body tipped, where his head looked, and his velocity { vx, vz }.
  const bearings = models.map(() => ({ heading: null, lean: UPRIGHT, head: AHEAD, was: null }));
  let marks = newMarks();   // what is remembered from frame to frame, for one match
  let cross = null;   // a dribbled ball crossing from one hand to the other, as crossFrom remembers it; null when none is
  // The hands its holder carries the ball in on this frame, as ballHands gives them, or null when nobody holds it and
  // on the start and final screens, where it is not drawn in them.
  const handsOf = state => {
    const id = state.ball.holder;
    return id === null || state.phase === 'start' || state.phase === 'final' ? null : ballHands(shown[id].arms.clip);
  };

  return {
    models,
    // level: one of QUALITY.order. The bench changes too, so a substitute comes on in the right pictures.
    setQuality(now) {
      level = now;
      for (const [mesh, made] of dressed) mesh.material = made[level];
    },
    // dt: the time that passed this frame, in seconds (zero while paused, so the motion pauses too).
    // `show`: who the broadcast has celebrating and dejected, { celebrate, dejected } by player id, or null.
    update(state, dt, show = null) {
      // Before and after a match nobody moves, whatever speed the last step left him with: everyone stands, and
      // nothing of that match is remembered into the next.
      const standing = state.phase === 'start' || state.phase === 'final';
      if (!standing) noteChanges(marks, state, dt);
      else if (marks.was) marks = newMarks();
      marks.show = show;
      courtPeople(state).forEach((who, i) => {
        const player = state.players[i], group = models[i], he = people[who];
        // The first frame, a substitution, or a match of another size, whose players stand in other places: he
        // comes on standing. (A model can be in one place only: adding it here takes it from where it was.)
        if (shown[i] !== he || he.model.parent !== group) {
          if (shown[i] && shown[i].model.parent === group) group.remove(shown[i].model);
          group.add(he.model);
          he.animator.reset();
          he.face.reset();
          he.last = 'idle';
          shown[i] = he;
        }
        // The heading he is drawn with turns toward the way he faces, or toward his man, at a bounded rate; his body
        // tips with his speeding up, stopping and turning, and his head turns to what he watches. Before and after a
        // match he faces the way he does, upright, with the motion's own head.
        const bearing = bearings[i], now = { vx: player.vx, vz: player.vz };
        if (standing) Object.assign(bearing, { heading: player.facing, lean: UPRIGHT, head: AHEAD });
        else {
          const wanted = drawnFacing(state, player, marks);
          bearing.heading = easeFacing(bearing.heading ?? wanted, wanted, dt);
          bearing.lean = leanOf(bearing.lean, bearing.was ?? now, now, bearing.heading, dt, onFloor(player));
          bearing.head = easeHead(bearing.head, headTurn(player, bearing.heading, lookTarget(state, player)), dt);
        }
        bearing.was = now;
        const look = standing ? null : { ...legLook(state, player, marks), facing: bearing.heading };
        const legs = standing ? IDLE : legMotion(player, he.gaits, he.last, look);
        he.last = legs.clip;
        group.position.set(player.x, player.y, player.z);
        // From the camera as the last frame placed it: a frame late, a step of a few centimetres at most.
        wear(he, modelFor(level, camera ? camera.position.distanceTo(group.position) : Infinity));
        // The model faces +z, with his left toward +x; a heading is measured from +x toward +z.
        group.rotation.y = Math.PI / 2 - bearing.heading;
        // The model tips inside the group, about his feet, so the number over his head stays where it is.
        he.model.rotation.set(bearing.lean.forward, 0, -bearing.lean.side);
        he.arms = standing ? null : armMotion(player, state, marks, facts);
        // A downloaded clip of the whole body (a move, a stumble) is played by the legs as well.
        const whole = he.arms && 'at' in he.arms && wholeBody(facts.clips, he.arms.clip) ? he.arms : null;
        he.animator.update(whole ?? legs, he.arms, dt, standing ? null : bearing.head, !standing && onFloor(player));
        he.face.update(dt, standing ? {} : faceWants(player, marks));
      });
    },
    // Forgets what is remembered from frame to frame (see actors.cut).
    cut() { marks = newMarks(); cross = null; for (const he of Object.values(people)) he.animator.unplant(); },
    // The hands the holder carries the ball in on this frame (see handsOf). To be asked after `update`.
    hands: handsOf,
    // Where the ball is in its holder's hands on this frame, { x, y, z }, or null when nobody holds it and on the
    // start and final screens. `drawn` is where the ball was drawn on the last frame. To be asked once a frame, after
    // `update`, which puts the hands where they are. The rules never read it.
    heldBall(state, drawn) {
      const side = handsOf(state), id = state.ball.holder;
      // A dribble that has just changed hands: the ball is on its way across from where it was when it changed.
      const crossing = side === 'left' || side === 'right' ? marks.switched[id] / MOTION.handSwitch : Infinity;
      cross = crossing < 1 ? crossFrom(cross, id, side, crossing, drawn) : null;
      if (!side) return null;
      const { hands, arms, animator } = shown[id], move = state.players[id].move;
      // In a dribble move it goes from the hand the move began in to the other, by the floor.
      if (side === 'move' && move) {
        const began = marks.hand[id] === 'left' ? 'left' : 'right', other = began === 'left' ? 'right' : 'left';
        const body = { x: state.players[id].x, z: state.players[id].z, heading: bearings[id].heading };
        return moveSpot(move.kind, Math.min(1, move.t / MOVES[move.kind].time), palmOf(hands[began]), palmOf(hands[other]), body, BALL.radius);
      }
      // In the jump of a finish it is in the finishing hand.
      if (side === 'carryRight' || side === 'carryLeft') return palmOf(hands[side === 'carryRight' ? 'right' : 'left']);
      if (side === 'both' || side === 'move') {
        const left = palmOf(hands.left), right = palmOf(hands.right);
        return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, z: (left.z + right.z) / 2 };
      }
      return dribbleSpot(palmOf(hands[side]), animator.phase(arms.clip), facts.clips.dribble, BALL.radius, cross, crossing);
    },
  };
}
