import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BALL, ROSTER } from '../sim/tuning.js';
import { assetUrl } from './assets.js';
import {
  MOTION, BALL_IN_HAND, legMotion, armMotion, legLook, newMarks, noteChanges, checkGaits, checkMotions, checkFacts, personName,
  courtPeople, sized, missingPeople, ballHands, dribbleHeight, switchSpot, crossFrom,
} from './motion.js';
import { createAnimator } from './animator.js';
import { KIT, kitOps, paintKit } from './kit.js';
import { QUALITY } from './quality.js';

// cutout: hair, brows and lashes: a pixel is drawn if it is at least this opaque.
const PEOPLE = Object.freeze({ cutout: 0.4 });
const SHADOWED = /^(skin|jersey|shorts|hair|shoes)/;   // materials of the parts that cast a shadow: not eyes, brows or lashes

const IDLE = Object.freeze({ clip: 'idle', rate: 1 });   // what everyone's legs do before and after a match
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

// A copy of `picture` that is `scale` times as wide and as tall, and alike in everything else: colour space, wrapping,
// flipY and filtering. The browser makes the smaller image a moment later: the promise of it is added to `pending`.
// (Drawn on a canvas instead, the browser puts the work off until the copy is first shown, and the game stalls then.)
function shrunk(picture, scale, pending) {
  const { width, height } = picture.image;
  const copy = picture.clone();   // which shares the original's image until its own arrives
  // premultiplyAlpha 'none', as the loader's own images are: hair keeps the colour under its clear pixels.
  const size = { resizeWidth: Math.ceil(width * scale), resizeHeight: Math.ceil(height * scale), resizeQuality: 'high' };
  pending.push(createImageBitmap(picture.image, { ...size, premultiplyAlpha: 'none' }).then(image => {
    copy.source = new THREE.TextureSource(image);
    copy.needsUpdate = true;
  }));
  return copy;
}

// What `make` returns for the size of the players' pictures at each quality level: 1 is full size.
const atEachLevel = make => ({ high: make(QUALITY.high.textures), low: make(QUALITY.low.textures) });

// Loads the generated players and their motions. Resolves to six groups, one per court player, an `update` that
// places each from the match, puts the model of whoever plays there in it and plays the motions his state calls for,
// and a `setQuality` that dresses all ten for a quality level. Rejects if a file is missing or incomplete.
export async function loadPeople() {
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

  // Every picture the players wear, as it is at each quality level: { high, low }, found by the picture a material
  // was given. All are made here, while the game loads, so that changing level later only swaps them.
  const pictures = new Map();
  const pending = [];   // the smaller images still being made

  // The kit of `team` on a `part` ('jersey' or 'shorts'), and on a jersey the `number`, painted `scale` times KIT.size.
  function kitPicture(part, team, number, scale) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = KIT.size * scale;
    paintKit(canvas.getContext('2d'), canvas.width, kitOps(part, number), team);
    const picture = new THREE.CanvasTexture(canvas);
    picture.flipY = false;   // as in the file, where the top row of a picture is v = 0
    picture.colorSpace = THREE.SRGBColorSpace;
    return picture;
  }
  // The file has one white jersey and one white shorts material for all ten. This is a copy of `material` with the
  // kit of `team` painted on it, and on a jersey the `number`: painted again at each level's size, not shrunk.
  function painted(material, team, number) {
    const kit = material.clone();
    const sizes = atEachLevel(scale => kitPicture(material.name, team, number, scale));
    kit.map = sizes.high;
    pictures.set(kit.map, sizes);
    return kit;
  }
  const shorts = [];   // one pair per team: shorts carry no number

  // One model and animator per person, made once: a substitution only changes who is shown. `index` is his place
  // among the ten.
  function person(model, team, number, index) {
    model.traverse(part => {
      // GLTFLoader numbers the bone names that repeat in the file (mixamorigHips_1); the motions look for the plain ones.
      if (part.isBone) part.name = THREE.PropertyBinding.sanitizeNodeName(part.userData.name);
      if (!part.isMesh) return;
      const material = part.material;
      part.castShadow = SHADOWED.test(material.name);
      part.frustumCulled = false;   // its bounds are those of the rest pose, not of where the motion puts it
      if (material.name === 'jersey') part.material = painted(material, team, number);
      if (material.name === 'shorts') part.material = shorts[team] ??= painted(material, team);
      // Cut-outs instead of blending: no sorting artefacts, and they write depth like everything else.
      if (material.transparent) Object.assign(material, { transparent: false, alphaTest: PEOPLE.cutout, depthWrite: true });
    });
    const scale = hipsOf(model).position.y / hipHeight;   // his size against the player the motions were made on
    const hands = { left: model.getObjectByName('mixamorigLeftHand'), right: model.getObjectByName('mixamorigRightHand') };
    // arms: the arm motion he was given on the last frame, or null when his arms followed his legs.
    return { model, hands, animator: createAnimator(model, clips, facts, scale, index), gaits: sized(facts.gaits, scale), last: 'idle', arms: null };
  }
  const people = {};
  ROSTER.numbers.forEach((numbers, team) => numbers.forEach((number, row) => {
    const name = personName(team, number);
    people[name] = person(roots.find(root => root.name === name), team, number, team * numbers.length + row);
  }));

  // Each place a picture is worn, on the bench too: [material, the property it is in, the picture at each level].
  const worn = [];
  const materials = new Set();   // each one once: a team's five wear the same shorts
  for (const root of roots) root.traverse(part => part.isMesh && materials.add(part.material));
  for (const material of materials) {
    for (const [slot, picture] of Object.entries(material)) {
      if (!picture?.isTexture) continue;
      const sizes = pictures.get(picture) ?? atEachLevel(scale => (scale === 1 ? picture : shrunk(picture, scale, pending)));
      pictures.set(picture, sizes);
      worn.push([material, slot, sizes]);
      material[slot] = sizes.high;   // `picture` itself, while High is full size
    }
  }
  await Promise.all(pending);

  const models = Array.from({ length: 6 }, () => new THREE.Group());
  const shown = [];   // the person whose model is in each group
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
    // level: 'high' or 'low'. The bench changes too, so a substitute comes on in the right pictures.
    setQuality(level) {
      for (const [material, slot, sizes] of worn) material[slot] = sizes[level];
    },
    // dt: the time that passed this frame, in seconds (zero while paused, so the motion pauses too).
    update(state, dt) {
      // Before and after a match nobody moves, whatever speed the last step left him with: everyone stands, and
      // nothing of that match is remembered into the next.
      const standing = state.phase === 'start' || state.phase === 'final';
      if (!standing) noteChanges(marks, state, dt);
      else if (marks.was) marks = newMarks();
      courtPeople(state).forEach((who, i) => {
        const player = state.players[i], group = models[i], he = people[who];
        if (shown[i] !== he) {   // the first frame, or a substitution: he comes on standing
          if (shown[i]) group.remove(shown[i].model);
          group.add(he.model);
          he.animator.reset();
          he.last = 'idle';
          shown[i] = he;
        }
        const look = standing ? null : legLook(state, player, marks);
        const legs = standing ? IDLE : legMotion(player, he.gaits, he.last, look);
        he.last = legs.clip;
        group.position.set(player.x, player.y, player.z);
        // The model faces +z; facing is measured from +x toward +z. A defender guarding his man is turned to him.
        group.rotation.y = Math.PI / 2 - (look ? look.facing : player.facing);
        he.arms = standing ? null : armMotion(player, state, marks, facts);
        he.animator.update(legs, he.arms, dt);
      });
    },
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
      const { hands, arms, animator } = shown[id];
      if (side === 'both') {
        const left = palmOf(hands.left), right = palmOf(hands.right);
        return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, z: (left.z + right.z) / 2 };
      }
      const palm = palmOf(hands[side]);
      if (cross) return switchSpot(cross.from, palm, crossing, BALL.radius);
      palm.y = dribbleHeight(animator.phase(arms.clip), facts.clips.dribble, palm.y, BALL.radius);
      return palm;
    },
  };
}
