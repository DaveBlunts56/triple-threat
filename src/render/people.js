import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { assetUrl } from './assets.js';
import { legMotion, fade, checkGaits, MOTION } from './motion.js';

export const TEAM_COLOURS = [0x2f6fe0, 0xd83a3a];
const MOTIONS = ['idle', 'walk', 'run', 'sprint', 'jump'];
const CUTOUT = 0.4;   // hair, brows and lashes: a pixel is drawn if it is at least this opaque

async function json(path) {
  const response = await fetch(assetUrl(path));
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

// Loads the generated players and their motions. Resolves to six models, one per court player, and an `update`
// that places each from the match and plays the motion his state calls for. Rejects if a file is missing or incomplete.
export async function loadPeople() {
  const loader = new GLTFLoader();
  const [players, motion, facts] = await Promise.all([
    loader.loadAsync(assetUrl('assets/players.glb')),
    loader.loadAsync(assetUrl('assets/motion.glb')),
    json('assets/motion.json'),
  ]);
  const source = players.scene.children.find(o => o.name.startsWith('player-'));
  if (!source) throw new Error('assets/players.glb holds no player');
  const clips = Object.fromEntries(motion.animations.map(clip => [clip.name, clip]));
  for (const name of MOTIONS) if (!clips[name]) throw new Error(`assets/motion.glb has no "${name}" motion`);
  checkGaits(facts);

  // shortcut: all six court players are copies of the one stage 1 player; one model per person arrives in stage 2
  const slots = [0, 0, 0, 1, 1, 1].map(team => {
    const model = clone(source);   // a copy with its own skeleton
    model.traverse(part => {
      if (!part.isMesh) return;
      part.castShadow = true;
      part.frustumCulled = false;   // its bounds are those of the rest pose, not of where the motion puts it
      const material = part.material = part.material.clone();
      if (material.name === 'jersey' || material.name === 'shorts') material.color.set(TEAM_COLOURS[team]);
      // Cut-outs instead of blending: no sorting artefacts, and they write depth like everything else.
      if (material.transparent) Object.assign(material, { transparent: false, alphaTest: CUTOUT, depthWrite: true });
    });
    const mixer = new THREE.AnimationMixer(model);
    const actions = Object.fromEntries(MOTIONS.map(name => [name, mixer.clipAction(clips[name])]));
    const weights = Object.fromEntries(MOTIONS.map(name => [name, name === 'idle' ? 1 : 0]));   // each motion's share of the pose
    for (const name of MOTIONS) actions[name].play().setEffectiveWeight(weights[name]);
    actions.jump.timeScale = 0;   // held at the moment of the jump he is in, never played through
    return { model, mixer, actions, weights, last: 'idle' };
  });

  return {
    models: slots.map(slot => slot.model),
    // dt: the match time that passed this frame, in seconds (zero while paused, so the motion pauses too).
    update(state, dt) {
      state.players.forEach((player, i) => {
        const { model, mixer, actions } = slots[i];
        model.position.set(player.x, player.y, player.z);
        model.rotation.y = Math.PI / 2 - player.facing;   // the model faces +z; facing is measured from +x toward +z

        const motion = legMotion(player, facts.gaits, slots[i].last);
        slots[i].last = motion.clip;
        if (motion.clip === 'jump') actions.jump.time = motion.at * actions.jump.getClip().duration;
        else actions[motion.clip].timeScale = motion.rate;
        const weights = fade(slots[i].weights, motion.clip, dt / MOTION.fade);
        for (const name of MOTIONS) actions[name].setEffectiveWeight(weights[name]);
        mixer.update(dt);
      });
    },
  };
}
