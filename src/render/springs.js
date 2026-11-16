// Spring bones: parts of a player that lag behind his movement and swing, the legs of his shorts and his locs. Each is
// a bone the motions never move; here its far end is a weight on a damped spring, pulled toward where the bone would
// point at rest and swung by everything that carries it, and the bone is turned to point at it.
import * as THREE from 'three';

const f = Object.freeze;

// bones: the spring bones, by name, wherever a model has them. reach: metres from a bone's joint to the weight at its
// far end (along the bone's own +Y, as the file's bones point). stiffness, damping: of the spring, per second squared
// and per second. limit: the furthest it may swing from rest, in radians.
export const SPRING = f({ bones: f(['kitShortsLeft', 'kitShortsRight', 'hairLocsLeft', 'hairLocsRight']), reach: 0.35, stiffness: 90, damping: 11, limit: 0.3 });

// Scratch values, so that a frame makes no garbage.
const [head, target, from, to, spot, size] = Array.from({ length: 6 }, () => new THREE.Vector3());
const [swing, parent] = [new THREE.Quaternion(), new THREE.Quaternion()];
const ALONG = new THREE.Vector3(0, 1, 0);

// The springs of `model`: { names, update(dt), reset() }. update: one frame `dt` seconds long, after the motions and
// before the feet are planted; dt 0 (paused) changes nothing. reset: every spring at rest at once (he has been put
// somewhere else). A model without spring bones has none, and both do nothing.
export function createSprings(model) {
  const springs = SPRING.bones.map(name => model.getObjectByName(name)).filter(Boolean)
    .map(bone => ({ bone, rest: bone.quaternion.clone(), tip: null, speed: new THREE.Vector3() }));

  return {
    names: springs.map(s => s.bone.name),
    update(dt) {
      if (!(dt > 0)) return;
      for (const s of springs) {
        const { bone } = s;
        bone.quaternion.copy(s.rest);
        bone.updateWorldMatrix(true, false);
        head.setFromMatrixPosition(bone.matrixWorld);
        target.copy(ALONG).multiplyScalar(SPRING.reach).applyMatrix4(bone.matrixWorld);
        if (!s.tip) { s.tip = target.clone(); continue; }
        // The weight: pulled toward where the bone points at rest, slowed by the damping.
        from.subVectors(target, s.tip).multiplyScalar(SPRING.stiffness).addScaledVector(s.speed, -SPRING.damping);
        s.speed.addScaledVector(from, dt);
        s.tip.addScaledVector(s.speed, dt);
        // The turn from where the bone points at rest to the weight, no further than the limit.
        from.subVectors(target, head).normalize();
        to.subVectors(s.tip, head).normalize();
        swing.setFromUnitVectors(from, to);
        const angle = 2 * Math.acos(Math.min(1, Math.abs(swing.w)));
        if (angle > SPRING.limit) {
          swing.slerp(parent.identity(), 1 - SPRING.limit / angle);
          // The weight is held at the limit too, and loses the speed that carried it past.
          const length = target.distanceTo(head);
          s.tip.copy(from).applyQuaternion(swing).multiplyScalar(length).add(head);
          s.speed.multiplyScalar(0.5);
        }
        // Turned about its joint in the court's frame: into its parent's frame, on top of its rest turn. (The parent's
        // world matrix is the one worked out just above, from the root down: nothing has moved since.)
        bone.parent.matrixWorld.decompose(spot, parent, size);
        bone.quaternion.copy(parent).invert().multiply(swing).multiply(parent).multiply(s.rest);
      }
    },
    reset() {
      for (const s of springs) { s.bone.quaternion.copy(s.rest); s.tip = null; s.speed.set(0, 0, 0); }
    },
  };
}
