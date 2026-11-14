// Plays one person's motions on two layers, the legs and the arms, and cross-fades each layer on its own.
import * as THREE from 'three';
import { LEG_CLIPS, ARM_CLIPS, OPTIONAL_CLIPS, STRIDES, crossFade, layerOf, outOfStep, stridePhase, wholeBody } from './motion.js';
import { chestTip } from './bearing.js';
import { keepTrack } from './checks.js';

// catchUp: the most of its cycle a dribble gains or loses on its own pace in a second, to fall in with the stride.
// Less than its own pace, so it never runs backwards. look: the share of a turn of the head that each of the bones
// from the upper spine to the head takes; together, the whole turn.
const ANIMATOR = Object.freeze({
  catchUp: 0.4,
  look: Object.freeze({ mixamorigSpine2: 0.15, mixamorigNeck: 0.25, mixamorigHead: 0.6 }),
});

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

// The axes of a model's own frame: he faces +z, with his left toward +x. The head bone's own +z is where it looks: in
// the rest pose that is the model's forward, to about a degree.
const UP = new THREE.Vector3(0, 1, 0), SIDE = new THREE.Vector3(1, 0, 0), AHEAD = new THREE.Vector3(0, 0, 1);
// Scratch values, so that a frame makes no garbage.
const [frame, turn, step, about] = Array.from({ length: 4 }, () => new THREE.Quaternion());
const line = new THREE.Vector3();
const fail = message => { throw new Error(message); };

// The turn from `model`'s own frame to the frame of `object` beneath it, into `into`.
function frameOf(model, object, into) {
  into.identity();
  for (let o = object; o !== model; o = o.parent) into.premultiply(o.quaternion);
  return into;
}

// Turns `bone` of `model` about its joint by `by`, a turn about axes of the model's own frame, whatever the bone's own.
function turnBone(model, bone, by) {
  frameOf(model, bone.parent, frame);
  bone.quaternion.premultiply(step.copy(frame).invert().multiply(by).multiply(frame));
}

// How far forward the line from `from` up to `to`, a bone above it, leans in `model`'s own frame: radians from upright,
// positive toward his forward. Every bone's scale is 1.
function pitchOf(model, from, to) {
  line.copy(to.position);
  for (let o = to.parent; o !== from; o = o.parent) line.applyQuaternion(o.quaternion).add(o.position);
  line.applyQuaternion(frameOf(model, from, frame));
  return Math.atan2(line.z, line.y);
}

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
  // The arms' motions, with those the file may or may not have; and among them the downloaded clips of the whole
  // body, which the legs play too.
  const armOnly = [...ARM_CLIPS, ...OPTIONAL_CLIPS.filter(name => name in clips)];
  const wholeNames = armOnly.filter(name => wholeBody(facts.clips, name));
  const legNames = [...LEG_CLIPS, ...wholeNames];
  const actions = {
    legs: Object.fromEntries(legNames.map(name => [name, held(name, track => layerOf(track) === 'legs')])),
    arms: Object.fromEntries([...LEG_CLIPS, ...armOnly].map(name => [name, held(name, track => layerOf(track) === 'arms' && !(name in OFF_ARM && armOf(track) === OFF_ARM[name]))])),
  };
  // Each arm alone, in every leg motion: what the arm a dribble leaves out shows.
  const offArm = Object.fromEntries(Object.entries(OFF_ARM).map(([dribble, side]) => [dribble, Object.fromEntries(LEG_CLIPS.map(name => [name, held(name, track => armOf(track) === side)]))]));
  const weights = { legs: {}, arms: {} };   // each motion's share of its layer's pose
  const at = {};     // how far through itself each motion is, 0 to 1: the two halves of a leg motion are always at the same moment
  const pace = {};   // the rate each was last played at: one that is no longer chosen carries on at it. 0 once placed by hand
  for (const name in actions.arms) [at[name], pace[name]] = [STANDING.includes(name) ? own.start : 0, 0];
  let strides = 0;   // the whole cycles his running legs have been through
  const bone = name => model.getObjectByName(name) ?? fail(`${model.name} has no ${name}`);
  const [chest, neck, headBone] = ['mixamorigSpine1', 'mixamorigNeck', 'mixamorigHead'].map(bone);
  const looking = Object.entries(ANIMATOR.look).map(([name, share]) => [bone(name), share]);
  // The bones turned after the motions, and the turns the motions gave them on the last frame. The mixer only sets a
  // bone whose motions give it a new turn, so each is first put back to the last: otherwise a turn added after the
  // motions would stay on a bone held still, and build up.
  const turned = [chest, ...looking.map(([joint]) => joint)];
  const given = turned.map(joint => joint.quaternion.clone());

  // The chest, after the motions: each arms-layer motion asks for it to lean as it was made to (see chestTip).
  function tipChest() {
    const tip = chestTip(pitchOf(model, chest, neck), weights.arms, wholeNames);
    if (tip) turnBone(model, chest, about.setFromAxisAngle(SIDE, tip));
  }

  // The head, after the motions and the chest: turned from wherever they left it looking to `yaw` toward his right of
  // his forward and `pitch` above level, by the turn that gets it there without tipping it to one side, shared out
  // from the upper spine up to the head.
  function aim({ yaw, pitch }) {
    const now = line.copy(AHEAD).applyQuaternion(frameOf(model, headBone, frame));
    const nowYaw = Math.atan2(-now.x, now.z), nowPitch = Math.asin(Math.max(-1, Math.min(1, now.y)));
    // Turned back from its own yaw, up or down from its own pitch to the wanted one, then round to the wanted yaw.
    turn.setFromAxisAngle(UP, -yaw).multiply(about.setFromAxisAngle(SIDE, nowPitch - pitch));
    turn.multiply(about.setFromAxisAngle(UP, nowYaw));
    for (const [joint, share] of looking) turnBone(model, joint, about.identity().slerp(turn, share));
  }

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
    // their half of the leg motion. `head` is where the head ends up looking, { yaw, pitch } in radians from the
    // model's forward and from level (see aim), or null for the motion's own head.
    update(legs, arms, dt, head = null) {
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
      turned.forEach((joint, i) => joint.quaternion.copy(given[i]));
      mixer.update(0);
      turned.forEach((joint, i) => given[i].copy(joint.quaternion));
      tipChest();
      if (head) aim(head);
    },
  };
}
