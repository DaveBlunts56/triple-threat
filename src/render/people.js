import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ROSTER } from '../sim/tuning.js';
import { assetUrl } from './assets.js';
import { legMotion, fade, checkGaits, personName, courtPeople, keepTrack, sized, missingPeople, MOTION } from './motion.js';

export const TEAM_COLOURS = [0x2f6fe0, 0xd83a3a];
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

// Loads the generated players and their motions. Resolves to six groups, one per court player, and an `update` that
// places each from the match, puts the model of whoever plays there in it and plays the motion his state calls for.
// Rejects if a file is missing or incomplete.
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

  // shortcut: the file has one jersey and one shorts material for all ten, so each team gets a tinted copy of both;
  // painted kits replace them
  const kits = {};
  function kit(material, team) {
    const key = `${material.name}-${team}`;
    if (!kits[key]) (kits[key] = material.clone()).color.set(TEAM_COLOURS[team]);
    return kits[key];
  }

  // One model, mixer and set of weights per person, made once: a substitution only changes who is shown.
  function person(model, team) {
    model.traverse(part => {
      // GLTFLoader numbers the bone names that repeat in the file (mixamorigHips_1); the motions look for the plain ones.
      if (part.isBone) part.name = THREE.PropertyBinding.sanitizeNodeName(part.userData.name);
      if (!part.isMesh) return;
      const material = part.material;
      part.castShadow = SHADOWED.test(material.name);
      part.frustumCulled = false;   // its bounds are those of the rest pose, not of where the motion puts it
      if (material.name === 'jersey' || material.name === 'shorts') part.material = kit(material, team);
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
    people[name] = person(roots.find(root => root.name === name), team);
  }));

  const models = Array.from({ length: 6 }, () => new THREE.Group());
  const shown = [];   // the person whose model is in each group

  return {
    models,
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
