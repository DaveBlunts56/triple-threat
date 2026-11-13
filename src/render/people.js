import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ROSTER } from '../sim/tuning.js';
import { assetUrl } from './assets.js';
import { legMotion, fade, checkGaits, personName, courtPeople, keepTrack, sized, missingPeople, MOTION } from './motion.js';
import { KIT, kitOps, paintKit } from './kit.js';
import { QUALITY } from './quality.js';

const MOTIONS = ['idle', 'walk', 'run', 'sprint', 'jump'];
// cutout: hair, brows and lashes: a pixel is drawn if it is at least this opaque.
const PEOPLE = Object.freeze({ cutout: 0.4 });
const SHADOWED = /^(skin|jersey|shorts|hair|shoes)/;   // materials of the parts that cast a shadow: not eyes, brows or lashes

const resting = () => Object.fromEntries(MOTIONS.map(name => [name, name === 'idle' ? 1 : 0]));   // each motion's share of the pose
const hipsOf = root => root.getObjectByProperty('isBone', true);   // the first bone under a root: the others hang from it

async function json(path) {
  const response = await fetch(assetUrl(path));
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

// A copy of `clip` for a player `scale` times the size of the one it was made on. Only where the hips are differs
// (the one position `keepTrack` leaves in), so every turn is shared with the original.
function sizedClip(clip, scale) {
  return new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.map(track => {
    if (!track.name.endsWith('.position')) return track;
    const hips = track.clone();
    hips.values = hips.values.map(value => value * scale);
    return hips;
  }));
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
// places each from the match, puts the model of whoever plays there in it and plays the motion his state calls for,
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
  for (const name of MOTIONS) {
    if (!clips[name]) throw new Error(`assets/motion.glb has no "${name}" motion`);
    clips[name].tracks = clips[name].tracks.filter(track => keepTrack(track.name));
  }
  checkGaits(facts);
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

  // One model, mixer and set of weights per person, made once: a substitution only changes who is shown.
  function person(model, team, number) {
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
    const mixer = new THREE.AnimationMixer(model);
    const actions = Object.fromEntries(MOTIONS.map(name => [name, mixer.clipAction(sizedClip(clips[name], scale)).play()]));
    actions.jump.timeScale = 0;   // held at the moment of the jump he is in, never played through
    return { model, mixer, actions, gaits: sized(facts.gaits, scale), weights: resting(), last: 'idle' };
  }
  const people = {};
  ROSTER.numbers.forEach((numbers, team) => numbers.forEach(number => {
    const name = personName(team, number);
    people[name] = person(roots.find(root => root.name === name), team, number);
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

  return {
    models,
    // level: 'high' or 'low'. The bench changes too, so a substitute comes on in the right pictures.
    setQuality(level) {
      for (const [material, slot, sizes] of worn) material[slot] = sizes[level];
    },
    // dt: the time that passed this frame, in seconds (zero while paused, so the motion pauses too).
    update(state, dt) {
      // Before and after a match nobody moves, whatever speed the last step left him with: everyone stands.
      const standing = state.phase === 'start' || state.phase === 'final';
      courtPeople(state).forEach((who, i) => {
        const player = state.players[i], group = models[i], he = people[who];
        if (shown[i] !== he) {   // the first frame, or a substitution: he comes on standing
          if (shown[i]) group.remove(shown[i].model);
          group.add(he.model);
          Object.assign(he, { weights: resting(), last: 'idle' });
          shown[i] = he;
        }
        group.position.set(player.x, player.y, player.z);
        group.rotation.y = Math.PI / 2 - player.facing;   // the model faces +z; facing is measured from +x toward +z

        const motion = legMotion(standing ? { ...player, vx: 0, vz: 0 } : player, he.gaits, he.last);
        he.last = motion.clip;
        if (motion.clip === 'jump') he.actions.jump.time = motion.at * he.actions.jump.getClip().duration;
        else he.actions[motion.clip].timeScale = motion.rate;
        const weights = fade(he.weights, motion.clip, dt / MOTION.fade);
        for (const name of MOTIONS) he.actions[name].setEffectiveWeight(weights[name]);
        he.mixer.update(dt);
      });
    },
  };
}
