// Foot planting: a foot the motion has on the floor stays where it is on the court, whatever carries him on, until the
// motion lifts it or he has left it too far behind; then it steps after him. The legs are bent to it bone by bone.
import * as THREE from 'three';

// ankle: metres from the floor to the ankle joint of a foot standing flat, for a person of size 1. lift: a foot whose
// ankle is no more than this above that is on the floor. stretch: metres a planted foot may be from where the motion
// has it before it steps after him; perSpeed: and this much more for each m/s he is travelling, up to `most`: the
// faster he goes the longer the leg he pushes off is left behind. far: the same while his other foot is stepping, so
// that he is on one foot at a time unless he must. settle: standing (slower than `still` m/s), a foot this far from
// where the motion has it steps home. step: seconds a step takes; rise: metres its middle rises; lead: seconds of his
// travel a step lands ahead of where the motion has the foot, so that it is not behind again as it lands. ease:
// seconds over which a foot the motion lifts joins the motion again. lost: metres from the motion's foot beyond which
// he has been put somewhere else, and the foot is simply the motion's. reach: the most of the leg's full length it is
// straightened to. sink: metres at most his hips come down so that a leg reaches a foot left behind: he lunges
// from it rather than drag it.
export const FEET = Object.freeze({ ankle: 0.1, lift: 0.035, stretch: 0.22, perSpeed: 0.04, most: 0.5, far: 0.65, settle: 0.1, still: 0.3,
  step: 0.12, rise: 0.07, lead: 0.06, ease: 0.1, lost: 1.5, reach: 0.995, sink: 0.3 });

const SIDES = ['Left', 'Right'];
// Scratch values, so that a frame makes no garbage.
const [hip, knee, ankle, goal, up, down, from, to, axis, here] = Array.from({ length: 10 }, () => new THREE.Vector3());
const [turn, parent, own, flat] = Array.from({ length: 4 }, () => new THREE.Quaternion());
const [spot, size] = [new THREE.Vector3(), new THREE.Vector3()];
// Where a bone is and how it is turned on the court, read from its world matrix. plant keeps every bone's world matrix
// up to date (it updates the whole model first, and each bone it turns after turning it), so these give what three's
// getWorldPosition and getWorldQuaternion would, without working the matrices out again from the root on every call.
const placeOf = (bone, v) => v.setFromMatrixPosition(bone.matrixWorld);
const turnOf = (bone, q) => { bone.matrixWorld.decompose(spot, q, size); return q; };
const smooth = t => t * t * (3 - 2 * t);
const fail = message => { throw new Error(message); };

// Turns `bone` about its own joint by `by`, a turn in the court's frame.
function turnBone(bone, by) {
  turnOf(bone.parent, parent);
  bone.quaternion.premultiply(own.copy(parent).invert().multiply(by).multiply(parent));
  bone.updateWorldMatrix(false, true);
}

// Bends the leg (`thigh`, `shin`, `foot`: its three bones) so that the ankle is at `goal` on the court, or as near as
// the leg reaches; the foot keeps the turn the motion gave it.
function reach(thigh, shin, foot, most) {
  turnOf(foot, flat);
  placeOf(thigh, hip); placeOf(shin, knee); placeOf(foot, ankle);
  const upper = hip.distanceTo(knee), lower = knee.distanceTo(ankle);
  const far = Math.min(Math.max(hip.distanceTo(goal), Math.abs(upper - lower) + 1e-3), (upper + lower) * most);
  // The knee: opened or closed until the ankle is as far from the hip as the goal is.
  up.subVectors(hip, knee).normalize(); down.subVectors(ankle, knee).normalize();
  const now = Math.acos(Math.min(1, Math.max(-1, up.dot(down))));
  const want = Math.acos(Math.min(1, Math.max(-1, (upper * upper + lower * lower - far * far) / (2 * upper * lower))));
  axis.crossVectors(up, down);
  if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0).applyQuaternion(turnOf(thigh, own));   // a straight leg bends about the thigh's own side
  turnBone(shin, turn.setFromAxisAngle(axis.normalize(), want - now));
  // The hip: the whole leg swung until the ankle points at the goal.
  placeOf(foot, ankle);
  from.subVectors(ankle, hip).normalize(); to.subVectors(goal, hip).normalize();
  turnBone(thigh, turn.setFromUnitVectors(from, to));
  turnOf(foot.parent, parent);
  foot.quaternion.copy(parent.invert().multiply(flat));
  foot.updateWorldMatrix(false, true);
}

// The feet of the person whose rig is `model`, `scale` times the size of the one the motions were made on.
// `bones` are the six leg bones planting turns, for whoever must put them back before the next frame of motion.
// plant(on, dt): to be called once a frame after the motions have set the bones and the model is where he stands;
// `on` is whether he is on the floor in play. free(): forgets where the feet were (he was put somewhere else).
export function createFeet(model, scale) {
  const bone = name => model.getObjectByName(name) ?? fail(`${model.name} has no ${name}`);
  const legs = SIDES.map(side => ({
    thigh: bone(`mixamorig${side}UpLeg`), shin: bone(`mixamorig${side}Leg`), foot: bone(`mixamorig${side}Foot`),
    mode: 'free', x: 0, z: 0, fromX: 0, fromZ: 0, t: 0,   // mode: free, planted, stepping (after him) or easing (back to the motion)
    goal: new THREE.Vector3(), held: false,               // where the ankle goes on this frame, and whether planting put it there
  }));
  const hips = bone('mixamorigHips');
  const floor = FEET.ankle * scale + FEET.lift, was = { x: 0, z: 0, known: false };

  return {
    bones: legs.flatMap(leg => [leg.thigh, leg.shin, leg.foot]),
    hips,   // moved down by planting: to be put back where the motions had it before the next frame of them
    free() { for (const leg of legs) leg.mode = 'free'; was.known = false; },
    plant(on, dt) {
      model.updateWorldMatrix(true, true);
      // How fast he is carried over the floor, from where the model's root was on the last frame.
      here.setFromMatrixPosition(model.matrixWorld);
      const vx = was.known && dt > 0 ? (here.x - was.x) / dt : 0, vz = was.known && dt > 0 ? (here.z - was.z) / dt : 0;
      was.x = here.x; was.z = here.z; was.known = true;
      if (!on) { for (const leg of legs) leg.mode = 'free'; return; }
      const speed = Math.hypot(vx, vz), limit = Math.min(FEET.most, FEET.stretch + speed * FEET.perSpeed);

      legs.forEach((leg, i) => {
        placeOf(leg.foot, ankle);
        const ax = ankle.x, ay = ankle.y, az = ankle.z, other = legs[1 - i];
        const low = ay <= floor, grounded = low;
        leg.goal.copy(ankle); leg.held = false;   // unless planting says otherwise, where the motion has it
        const plantAt = (x, z) => { leg.mode = 'planted'; leg.x = x; leg.z = z; };
        const leave = mode => { leg.mode = mode; leg.fromX = leg.x; leg.fromZ = leg.z; leg.t = 0; };

        if (leg.mode === 'free') { if (!grounded) return; plantAt(ax, az); }
        const off = Math.hypot(leg.x - ax, leg.z - az);   // how far the foot is from where the motion has it
        if (leg.mode === 'planted') {
          if (off > FEET.lost * scale) { plantAt(ax, az); return; }                 // he was put somewhere else
          if (!grounded) leave('easing');                                           // the motion lifts it
          else if (other.mode === 'stepping' ? off > FEET.far * scale : off > (speed < FEET.still ? FEET.settle : limit) * scale) leave('stepping');
        }
        let y = ay;
        if (leg.mode === 'stepping') {
          leg.t += dt;
          const s = smooth(Math.min(1, leg.t / FEET.step));
          leg.x = leg.fromX + (ax + vx * FEET.lead - leg.fromX) * s; leg.z = leg.fromZ + (az + vz * FEET.lead - leg.fromZ) * s;
          y += FEET.rise * scale * Math.sin(Math.PI * s);
          if (s >= 1) leg.mode = low ? 'planted' : 'free';   // it has landed where the step put it, whatever the motion is doing with it
        } else if (leg.mode === 'easing') {
          leg.t += dt;
          const s = Math.min(1, leg.t / FEET.ease);
          leg.x = leg.fromX + (ax - leg.fromX) * s; leg.z = leg.fromZ + (az - leg.fromZ) * s;
          if (grounded) leg.mode = 'planted';                                      // down again before it had joined the motion
          else if (s >= 1) { leg.mode = 'free'; return; }
        }
        leg.goal.set(leg.x, y, leg.z); leg.held = true;
      });
      if (!legs.some(leg => leg.held)) return;
      // A leg too short for where its foot is: the hips come down until it reaches, as far as they may.
      let sink = 0;
      for (const leg of legs) {
        if (!leg.held) continue;
        placeOf(leg.thigh, hip); placeOf(leg.shin, knee); placeOf(leg.foot, ankle);
        const full = (hip.distanceTo(knee) + knee.distanceTo(ankle)) * FEET.reach, out = Math.hypot(leg.goal.x - hip.x, leg.goal.z - hip.z);
        sink = Math.max(sink, hip.y - (leg.goal.y + Math.sqrt(Math.max(0, full * full - out * out))));
      }
      sink = Math.min(sink, FEET.sink * scale);
      if (sink > 0) {
        hips.parent.matrixWorld.decompose(spot, own, here);
        hips.position.y -= sink / here.y;
        hips.updateWorldMatrix(false, true);
      }
      // With the hips down every leg is bent to its foot, the ones the motion alone places too.
      for (const leg of legs) if (leg.held || sink > 0) { goal.copy(leg.goal); reach(leg.thigh, leg.shin, leg.foot, FEET.reach); }
    },
  };
}
