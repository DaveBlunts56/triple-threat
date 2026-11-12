import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readGlb, primitivesUnder, floatsOf } from './glb.js';

const players = readGlb('assets/players.glb');
const people = JSON.parse(readFileSync('assets/source/people.json', 'utf8')).people;
const rootName = p => `player-${p.team}-${p.number}`;
const trianglesUnder = (gltf, name) => primitivesUnder(gltf, name).reduce((sum, p) => sum + gltf.accessors[p.indices].count / 3, 0);
// The lowest and highest point of the player's meshes. Transforms are applied before export, so these are metres.
function heightOf(gltf, name) {
  const boxes = primitivesUnder(gltf, name).map(p => gltf.accessors[p.attributes.POSITION]);
  return { minY: Math.min(...boxes.map(a => a.min[1])), maxY: Math.max(...boxes.map(a => a.max[1])) };
}

test('the file holds every person in the table, named by team and number', () => {
  const roots = players.json.nodes.map(n => n.name ?? '').filter(n => /^player-\d+-\d+$/.test(n)).sort();
  assert.deepEqual(roots, people.map(rootName).sort());
});

test('every player is skinned, under 20,000 triangles, and wears a jersey and shorts the game can tint', () => {
  const materials = players.json.materials.map(m => m.name);
  assert.ok(materials.includes('jersey') && materials.includes('shorts'), `materials ${materials}`);
  for (const person of people) {
    const triangles = trianglesUnder(players.json, rootName(person));
    assert.ok(triangles > 2000 && triangles <= 20000, `${rootName(person)}: ${triangles} triangles`);
    for (const p of primitivesUnder(players.json, rootName(person))) assert.ok('JOINTS_0' in p.attributes, 'a mesh is not skinned');
  }
  assert.ok(players.json.skins.length >= 1);
  assert.equal(players.json.animations, undefined);
});

test('each player stands as tall as the table says, feet on the floor', () => {
  for (const person of people) {
    const { minY, maxY } = heightOf(players.json, rootName(person));
    assert.ok(Math.abs(minY) < 0.03, `${rootName(person)}: feet at ${minY}`);
    assert.ok(Math.abs(maxY - person.height) < 0.06, `${rootName(person)}: top of the head at ${maxY}, table says ${person.height}`);
  }
});

test('textures are no larger than 2048 pixels a side', () => {
  for (const image of players.json.images ?? []) {
    const view = players.json.bufferViews[image.bufferView];
    const bytes = players.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const [width, height] = imageSize(bytes, image.mimeType);
    assert.ok(width <= 2048 && height <= 2048, `${image.name}: ${width}x${height}`);
  }
});

// Width and height from a PNG or JPEG header.
function imageSize(bytes, mimeType) {
  if (mimeType === 'image/png') return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  for (let at = 2; at < bytes.length;) {                       // JPEG: walk the segments to the frame header
    const marker = bytes[at + 1], length = bytes.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)];
    at += 2 + length;
  }
  throw new Error(`cannot read the size of a ${mimeType} image`);
}

const motion = readGlb('assets/motion.glb');
const facts = JSON.parse(readFileSync('assets/motion.json', 'utf8'));
const LOOPS = ['idle', 'walk', 'run', 'sprint'];

// The keys of one bone's track in one motion, as rows of numbers. The root bone is the joint with no joint above it.
function track(name, path, bone = null) {
  const { json } = motion, joints = json.skins[0].joints;
  const below = new Set(joints.flatMap(i => json.nodes[i].children ?? []));
  const node = bone === null ? joints.find(i => !below.has(i)) : json.nodes.findIndex(n => n.name === bone);
  const animation = json.animations.find(a => a.name === name);
  const channel = animation.channels.find(c => c.target.node === node && c.target.path === path);
  const flat = floatsOf(motion, animation.samplers[channel.sampler].output), width = path === 'rotation' ? 4 : 3;
  return Array.from({ length: flat.length / width }, (_, i) => flat.slice(i * width, (i + 1) * width));
}
// The furthest any key of the root bone sits from its first key horizontally (x and z), in metres.
const hipsDrift = name => Math.max(...track(name, 'translation').map(([x, , z], _, keys) => Math.hypot(x - keys[0][0], z - keys[0][2])));

test('the motion file holds the five stage 1 motions and no meshes', () => {
  assert.deepEqual(motion.json.animations.map(a => a.name).sort(), ['idle', 'jump', 'run', 'sprint', 'walk']);
  assert.equal(motion.json.meshes, undefined);
});

test('every bone a motion moves exists in the player', () => {
  const bones = new Set(players.json.skins.flatMap(s => s.joints).map(i => players.json.nodes[i].name));
  const moved = new Set(motion.json.animations.flatMap(a => a.channels).map(c => motion.json.nodes[c.target.node].name));
  assert.deepEqual([...moved].filter(name => !bones.has(name)), []);
});

test('each gait has a natural speed, slowest to fastest, and each clip its facts', () => {
  const { walk, run, sprint } = facts.gaits;
  assert.ok(0.8 < walk && walk < run && run < sprint && sprint < 10, JSON.stringify(facts.gaits));
  assert.deepEqual(Object.keys(facts.clips).sort(), ['idle', 'jump', 'run', 'sprint', 'walk']);
  for (const name of LOOPS) assert.equal(facts.clips[name].loop, true);
  assert.equal(facts.clips.jump.loop, false);
  for (const c of Object.values(facts.clips)) assert.ok(c.duration > 0.2 && c.duration < 12);
});

test('looping motions stay on the spot', () => {
  for (const name of ['walk', 'run', 'sprint']) assert.ok(hipsDrift(name) < 0.25, `${name} drifts ${hipsDrift(name)} m`);
});

test('a looping motion ends in the pose it starts in', () => {
  for (const name of LOOPS) {
    const hips = track(name, 'translation');
    assert.ok(Math.hypot(...hips[0].map((v, i) => v - hips.at(-1)[i])) < 0.02, `${name}: the hips end away from where they start`);
    for (const bone of ['mixamorig:LeftUpLeg', 'mixamorig:RightLeg', 'mixamorig:Spine', 'mixamorig:LeftArm']) {
      const turns = track(name, 'rotation', bone);
      const same = Math.abs(turns[0].reduce((sum, v, i) => sum + v * turns.at(-1)[i], 0));   // 1 when the two turns are equal
      assert.ok(same > 0.999, `${name}: ${bone} ends ${same} away from its first pose`);
    }
  }
});

test('the jump leaves the lifting to the game: its hips never climb above where they start', () => {
  const heights = track('jump', 'translation').map(key => key[1]);
  assert.ok(Math.max(...heights) - heights[0] < 0.05, `the hips climb ${Math.max(...heights) - heights[0]} m`);
});
