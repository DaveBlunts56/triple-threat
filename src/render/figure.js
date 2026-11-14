// A simple jointed figure for the people round the court: referees, camera crews, photographers, commentators, the
// benches and the courtside seats. It is one mesh however it is posed: drawn with a skeleton when it moves (a
// referee), or with its pose baked in when it never does (everyone seated), so that many of them cost one drawing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The joints, each with its parent and where it is from that parent, in metres, for a figure 1.8 m tall standing at
// the origin and facing +z (so his right arm is on the -x side).
const JOINTS = [
  ['hips', null, [0, 0.95, 0]], ['chest', 'hips', [0, 0.12, 0]], ['head', 'chest', [0, 0.6, 0]],
  ['armR', 'chest', [-0.26, 0.5, 0]], ['foreR', 'armR', [0, -0.3, 0]], ['armL', 'chest', [0.26, 0.5, 0]], ['foreL', 'armL', [0, -0.3, 0]],
  ['legR', 'hips', [-0.1, 0, 0]], ['shinR', 'legR', [0, -0.45, 0]], ['legL', 'hips', [0.1, 0, 0]], ['shinL', 'legL', [0, -0.45, 0]],
];
const INDEX = Object.fromEntries(JOINTS.map(([name], i) => [name, i]));

// The solid pieces, in the standing pose: [joint it moves with, which colour of the look, geometry].
function pieces() {
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const limb = (radius, from, to, x) => new THREE.CapsuleGeometry(radius, from - to - 2 * radius, 2, 6).translate(x, (from + to) / 2, 0);
  const ball = (radius, x, y, z) => new THREE.SphereGeometry(radius, 8, 6).translate(x, y, z);
  const list = [
    ['hips', 'trousers', box(0.36, 0.2, 0.22, 0, 0.98, 0)],
    ['chest', 'shirt', box(0.42, 0.5, 0.24, 0, 1.34, 0)],
    ['head', 'skin', new THREE.CylinderGeometry(0.05, 0.055, 0.1, 6).translate(0, 1.63, 0)],
    ['head', 'skin', ball(0.115, 0, 1.76, 0)],
    ['head', 'hair', new THREE.SphereGeometry(0.122, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.48).translate(0, 1.765, -0.012)],
  ];
  for (const [side, x] of [['R', -1], ['L', 1]]) {
    list.push([`arm${side}`, 'shirt', limb(0.052, 1.59, 1.27, x * 0.26)]);
    list.push([`fore${side}`, 'skin', limb(0.045, 1.28, 0.99, x * 0.26)]);
    list.push([`fore${side}`, 'skin', ball(0.055, x * 0.26, 0.95, 0)]);
    list.push([`leg${side}`, 'trousers', limb(0.08, 0.97, 0.5, x * 0.1)]);
    list.push([`shin${side}`, 'trousers', limb(0.062, 0.52, 0.07, x * 0.1)]);
    list.push([`shin${side}`, 'shoes', box(0.1, 0.07, 0.26, x * 0.1, 0.035, 0.05)]);
  }
  return list;
}

// Paints every corner of `geometry` one colour, and leaves it with only what the figures need.
function painted(geometry, colour) {
  const c = new THREE.Color(colour), count = geometry.attributes.position.count, colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colours.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

// The skeleton: bones in the order of JOINTS, the first of them the root.
function skeletonOf() {
  const bones = JOINTS.map(([name]) => Object.assign(new THREE.Bone(), { name }));
  JOINTS.forEach(([, parent, at], i) => { bones[i].position.set(...at); if (parent) bones[INDEX[parent]].add(bones[i]); });
  bones[0].updateMatrixWorld(true);
  return bones;
}

// Turns the bones to a pose. Arms are { lift, out, bend, inward } (see armsFor in life.js; `inward` folds the forearm
// across the body instead of forward). Legs are { swing, knee }: the thigh swung forward and the knee bent. `lean`
// tips the chest forward, `turn` turns the head, `drop` lowers the hips (to sit).
export function pose(bones, { right = {}, left = {}, legR = {}, legL = {}, lean = 0, turn = 0, drop = 0 } = {}) {
  const b = name => bones[INDEX[name]];
  b('hips').position.y = 0.95 - drop;
  b('chest').rotation.set(lean, 0, 0);
  b('head').rotation.set(0, turn, 0);
  for (const [side, arm, way] of [['R', right, -1], ['L', left, 1]]) {
    b(`arm${side}`).rotation.set(-(arm.lift ?? 0), 0, way * (arm.out ?? 0.08));
    b(`fore${side}`).rotation.set(-(arm.bend ?? 0.1), 0, -way * (arm.inward ?? 0));
  }
  for (const [side, leg] of [['R', legR], ['L', legL]]) {
    b(`leg${side}`).rotation.set(-(leg.swing ?? 0), 0, 0);
    b(`shin${side}`).rotation.set(leg.knee ?? 0, 0, 0);
  }
}

// Sitting on a chair, and on the floor with a camera to the eye.
export const SEATED = Object.freeze({ drop: 0.47, legR: { swing: 1.5, knee: 1.5 }, legL: { swing: 1.5, knee: 1.5 }, right: { lift: 0.5, bend: 0.9 }, left: { lift: 0.5, bend: 0.9 } });
export const KNEELING = Object.freeze({ drop: 0.62, lean: 0.15, legR: { swing: 1.75, knee: 2.5 }, legL: { swing: 1.75, knee: 2.5 }, right: { lift: 1.2, bend: 2 }, left: { lift: 1.2, bend: 2 } });

const matte = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

// A figure that moves: one skinned mesh. `look` is { shirt, trousers, skin, hair, shoes }. Returns { mesh, bones }.
export function createFigure(look) {
  const parts = pieces().map(([joint, colour, geometry]) => {
    const count = geometry.attributes.position.count, index = new Uint16Array(count * 4), weight = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { index[i * 4] = INDEX[joint]; weight[i * 4] = 1; }
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(index, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weight, 4));
    return painted(geometry, look[colour]);
  });
  const mesh = new THREE.SkinnedMesh(mergeGeometries(parts), matte());
  const bones = skeletonOf();
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.frustumCulled = false;   // its bones move it away from where its geometry says it is
  return { mesh, bones };
}

// A figure that never moves, as plain geometry with its pose baked in: `look` as above, `how` a pose, then turned by
// `facing` (0 looks toward +z, a quarter turn toward +x) and put at (x, y, z).
export function bakedFigure(look, how, x, y, z, facing) {
  const bones = skeletonOf(), rest = bones.map(bone => bone.matrixWorld.clone().invert());
  pose(bones, how);
  bones[0].updateMatrixWorld(true);
  const place = new THREE.Matrix4().makeRotationY(facing).setPosition(x, y, z), moved = new THREE.Matrix4();
  return mergeGeometries(pieces().map(([joint, colour, geometry]) => {
    const i = INDEX[joint];
    return painted(geometry, look[colour]).applyMatrix4(moved.multiplyMatrices(place, bones[i].matrixWorld).multiply(rest[i]));
  }));
}

// A box of one colour at a place, turned, for the chairs, cameras and screens that go with the figures.
export function bakedBox(colour, w, h, d, x, y, z, facing = 0) {
  return painted(new THREE.BoxGeometry(w, h, d), colour).applyMatrix4(new THREE.Matrix4().makeRotationY(facing).setPosition(x, y, z));
}

// Many baked pieces as one mesh.
export const bakedMesh = pieces => new THREE.Mesh(mergeGeometries(pieces), matte());
