// Plays one person's motions on two layers, the legs and the arms, and cross-fades each layer on its own.
import * as THREE from 'three';
import { LEG_CLIPS, ARM_CLIPS, STRIDES, crossFade, keepTrack, layerOf, outOfStep, stridePhase } from './motion.js';

// catchUp: the most of its cycle a dribble gains or loses on its own pace in a second, to fall in with the stride.
// Less than its own pace, so it never runs backwards.
const ANIMATOR = Object.freeze({ catchUp: 0.4 });

const LAYERS = ['legs', 'arms'];
const STANDING = ['idle', 'stance'];   // the motions each person plays out of step with the others
// The motions that are a cycle of steps: one taking over from another carries on from the same point of the cycle.
const STEPPING = ['walk', 'run', 'sprint', 'strafeLeft', 'strafeRight', 'backpedal'];
// The arm each dribble leaves to the legs' motion. The dribble was made in a low stance with the other hand resting
// on the knee: on legs that stand or run that hand reaches for a knee that is not there.
const OFF_ARM = Object.freeze({ dribble: 'Left', dribbleLeft: 'Right' });
// The arm a track belongs to, 'Left' or 'Right', from the shoulder to the fingertips; undefined for any other bone.
const armOf = trackName => /^mixamorig(Left|Right)(Shoulder|Arm|ForeArm|Hand)/.exec(trackName)?.[1];

// The way from one point of a cycle to another that is the shorter, as a share of the cycle: -0.5 to 0.5.
const shorter = gap => gap - Math.round(gap);

// The tracks of `clip` that `keep` picks by name, for a person `scale` times the size of the one the motions were made
// on. Only where the hips are differs (the one position `keepTrack` leaves in), so every turn is shared with the original.
function part(clip, keep, scale) {
  const tracks = clip.tracks.filter(track => keepTrack(track.name) && keep(track.name)).map(track => {
    if (!track.name.endsWith('.position')) return track;
    const hips = track.clone();
    hips.values = hips.values.map(value => value * scale);
    return hips;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// The animator of the person whose rig is `model`. `clips` is every motion of assets/motion.glb by name, `facts` is
// assets/motion.json, `scale` is his size against the person the motions were made on, and `index` (0 to 9) tells
// him from the other nine. Every leg motion is split in two, so that the arms can follow the legs or leave them;
// an arm motion only ever moves what is above the lowest spine bone, and a dribble leaves its other arm to the legs.
export function createAnimator(model, clips, facts, scale, index = 0) {
  const mixer = new THREE.AnimationMixer(model);
  const own = outOfStep(index);
  // Held where `at` puts it, never played by the mixer, which only blends.
  const held = (name, keep) => Object.assign(mixer.clipAction(part(clips[name], keep, scale)).play(), { timeScale: 0 });
  const actions = {
    legs: Object.fromEntries(LEG_CLIPS.map(name => [name, held(name, track => layerOf(track) === 'legs')])),
    arms: Object.fromEntries([...LEG_CLIPS, ...ARM_CLIPS].map(name => [name, held(name, track => layerOf(track) === 'arms' && !(name in OFF_ARM && armOf(track) === OFF_ARM[name]))])),
  };
  // Each arm alone, in every leg motion: what the arm a dribble leaves out shows.
  const offArm = Object.fromEntries(Object.entries(OFF_ARM).map(([dribble, side]) => [dribble, Object.fromEntries(LEG_CLIPS.map(name => [name, held(name, track => armOf(track) === side)]))]));
  const weights = { legs: {}, arms: {} };   // each motion's share of its layer's pose
  const at = {};     // how far through itself each motion is, 0 to 1: the two halves of a leg motion are always at the same moment
  const pace = {};   // the rate each was last played at: one that is no longer chosen carries on at it. 0 once placed by hand
  for (const name in actions.arms) [at[name], pace[name]] = [STANDING.includes(name) ? own.start : 0, 0];
  let strides = 0;   // the whole cycles his running legs have been through

  function reset() {
    for (const layer of LAYERS) for (const name in actions[layer]) weights[layer][name] = name === 'idle' ? 1 : 0;
  }
  reset();

  function choose(motion) {
    if ('at' in motion) [at[motion.clip], pace[motion.clip]] = [motion.at, 0];
    else pace[motion.clip] = motion.rate * (STANDING.includes(motion.clip) ? own.rate : 1);
  }

  return {
    weights,
    reset,
    // How far through its cycle the arms-layer motion `name` is, 0 to 1.
    phase: name => at[name],
    // One frame, `dt` seconds long. `legs` is what legMotion gave and `arms` what armMotion gave: { clip, at } holds
    // the motion at that share of its length, { clip, rate } plays it at that rate, and with no `arms` the arms show
    // their half of the leg motion.
    update(legs, arms, dt) {
      choose(legs);
      if (arms) choose(arms);
      for (const name in at) {
        if (!pace[name]) continue;
        const next = at[name] + (dt * pace[name]) / clips[name].duration;
        if (name === legs.clip && STRIDES.includes(name)) strides += Math.floor(next);
        at[name] = next % 1;
      }
      // Every stepping motion keeps to the stride of the one in use, so the one that takes over carries on from the
      // same point of the cycle and the legs never stall.
      if (STEPPING.includes(legs.clip)) for (const name of STEPPING) at[name] = at[legs.clip];
      // At a run one stride is one bounce. The strides are counted on through the loops of the leg motion, so the
      // dribble plays through all of its bounces, which are not alike, and never jumps back to the first.
      if (STRIDES.includes(legs.clip) && arms?.clip in OFF_ARM) {
        const name = arms.clip, dribble = facts.clips.dribble, strike = facts.clips[legs.clip].strike[name === 'dribble' ? 'right' : 'left'];
        const behind = () => shorter(stridePhase(strides + at[legs.clip], strike, dribble) - at[name]);
        if (weights.arms[name] > 0) {
          // Already showing, the hand is not thrown to its place: the dribble takes the bounce nearest to where it
          // is and catches the stride up.
          strides -= Math.round(behind() * dribble.bounces);
          at[name] = (at[name] + Math.sign(behind()) * Math.min(Math.abs(behind()), ANIMATOR.catchUp * dt) + 1) % 1;
        } else at[name] = stridePhase(strides + at[legs.clip], strike, dribble);
      }

      crossFade(weights.legs, legs.clip, dt);
      crossFade(weights.arms, arms ? arms.clip : legs.clip, dt);
      const show = (action, name, share) => { action.time = at[name] * clips[name].duration; action.setEffectiveWeight(share); };
      for (const layer of LAYERS) for (const name in actions[layer]) show(actions[layer][name], name, weights[layer][name]);
      // The dribble's share of the arm it leaves out goes to the leg motions, as the legs share it among themselves.
      for (const dribble in offArm) for (const name of LEG_CLIPS) show(offArm[dribble][name], name, weights.arms[dribble] * weights.legs[name]);
      mixer.update(0);
    },
  };
}
