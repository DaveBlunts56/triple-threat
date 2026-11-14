import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { readGlb, primitivesUnder, floatsOf } from './glb.js';
import { pack } from '../tools/single-file.mjs';
import { ROSTER } from '../src/sim/tuning.js';
import { LEG_CLIPS, ARM_CLIPS } from '../src/render/motion.js';

const players = readGlb('assets/players.glb');
const people = JSON.parse(readFileSync('assets/source/people.json', 'utf8')).people;
const rootName = p => `player-${p.team}-${p.number}`;
const trianglesUnder = (gltf, name) => primitivesUnder(gltf, name).reduce((sum, p) => sum + gltf.accessors[p.indices].count / 3, 0);
// The lowest point of the player's meshes and the top of his skin: an afro or a bald head must not change how tall he measures.
// Transforms are applied before export, so these are metres.
function heightOf(gltf, name) {
  const primitives = primitivesUnder(gltf, name);
  const skin = primitives.find(p => gltf.materials[p.material].name.startsWith('skin'));
  return { minY: Math.min(...primitives.map(p => gltf.accessors[p.attributes.POSITION].min[1])), maxY: gltf.accessors[skin.attributes.POSITION].max[1] };
}

test('the table has the sixteen people the rosters name, each one different', () => {
  for (const team of [0, 1]) assert.deepEqual(people.filter(p => p.team === team).map(p => p.number), [...ROSTER.numbers[team]]);
  for (const p of people) assert.ok(p.height >= 1.85 && p.height <= 2.08, `${rootName(p)}: ${p.height} m`);
  assert.equal(new Set(people.map(p => [p.skin, p.hair, p.hairColour, p.build, p.face].join())).size, 16);
});

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

// One player's kit piece: positions, normals and texture coordinates of the primitive whose material is `name`.
function piece(person, name) {
  const p = primitivesUnder(players.json, rootName(person)).find(q => players.json.materials[q.material].name === name);
  const rows = (attribute, width) => { const flat = floatsOf(players, p.attributes[attribute]); return Array.from({ length: flat.length / width }, (_, i) => flat.slice(i * width, (i + 1) * width)); };
  return { at: rows('POSITION', 3), normal: rows('NORMAL', 3), uv: rows('TEXCOORD_0', 2) };
}
const mean = list => list.reduce((sum, v) => sum + v, 0) / list.length;

test('jersey and shorts are laid out as a front panel and a back panel, the right way round', () => {
  for (const person of people) for (const name of ['jersey', 'shorts']) {
    const { at, normal, uv } = piece(person, name);
    assert.ok(uv.every(([u, v]) => u >= 0 && u <= 1 && v >= 0 && v <= 1), `${rootName(person)} ${name}: outside the picture`);
    const front = uv.map(([u], i) => (u < 0.5 ? i : -1)).filter(i => i >= 0), back = uv.map(([u], i) => (u > 0.5 ? i : -1)).filter(i => i >= 0);
    assert.ok(mean(front.map(i => normal[i][2])) > 0.3 && mean(back.map(i => normal[i][2])) < -0.3, `${rootName(person)} ${name}: panels face the wrong way`);
    const lean = list => { const x = mean(list.map(i => at[i][0])), u = mean(list.map(i => uv[i][0])); return mean(list.map(i => (at[i][0] - x) * (uv[i][0] - u))); };
    assert.ok(lean(front) > 0 && lean(back) < 0, `${rootName(person)} ${name}: a panel is mirrored`);
    const top = Math.max(...at.map(p => p[1])), high = uv[at.findIndex(p => p[1] === top)][1];
    assert.ok(high < 0.1, `${rootName(person)} ${name}: the top edge is at v ${high}`);
  }
});

test('each player stands as tall as the table says, feet on the floor', () => {
  for (const person of people) {
    const { minY, maxY } = heightOf(players.json, rootName(person));
    assert.ok(Math.abs(minY) < 0.03, `${rootName(person)}: feet at ${minY}`);
    assert.ok(Math.abs(maxY - person.height) < 0.03, `${rootName(person)}: top of the head at ${maxY}, table says ${person.height}`);
  }
});

// Sixteen players at under a megabyte each. Nothing caps the single file's size now; this catches a player grown by accident.
test('the player file stays under 15 MB', () => {
  assert.ok(statSync('assets/players.glb').size < 15e6, `${(statSync('assets/players.glb').size / 1e6).toFixed(1)} MB`);
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
const LOOPS = ['idle', 'walk', 'run', 'sprint', 'strafeLeft', 'strafeRight', 'backpedal', 'dribble', 'dribbleLeft', 'stance', 'hold', 'holdLeft', 'handUp'];

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
  const names = motion.json.animations.map(a => a.name);
  for (const name of ['idle', 'walk', 'run', 'sprint', 'jump']) assert.ok(names.includes(name), `no ${name}`);
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
  assert.deepEqual(Object.keys(facts.clips).sort(), motion.json.animations.map(a => a.name).sort());
  for (const c of Object.values(facts.clips)) assert.ok(c.duration >= 0.05 && c.duration < 12);
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

// The owner moves the file by Google Drive, so nothing caps its size but how long a Chromebook takes to open it, which
// nobody has measured. This only catches a file that has grown by accident.
test('the single file stays under 80 MB', () => {
  const size = Buffer.byteLength(pack('.'));
  assert.ok(size < 80e6, `${(size / 1e6).toFixed(1)} MB`);
});

test('each motion starts at time zero and lasts as long as its facts say', () => {
  for (const animation of motion.json.animations) {
    const times = animation.samplers.map(sampler => motion.json.accessors[sampler.input]);
    const first = Math.min(...times.map(a => a.min[0])), last = Math.max(...times.map(a => a.max[0]));
    assert.ok(Math.abs(first) < 1e-4, `${animation.name} starts at ${first} s`);
    assert.ok(Math.abs(last - facts.clips[animation.name].duration) < 1e-3, `${animation.name} ends at ${last} s, facts say ${facts.clips[animation.name].duration}`);
  }
});

// How far a bone turns from its first pose over a motion: 0 for not at all.
const swing = keys => Math.max(...keys.map(q => 1 - Math.abs(q.reduce((sum, v, i) => sum + v * keys[0][i], 0))));

test('the defensive steps, the dribble and the landing are in the motion file with their facts', () => {
  const names = motion.json.animations.map(a => a.name);
  for (const name of ['strafeLeft', 'strafeRight', 'backpedal', 'dribble', 'dribbleLeft', 'land']) assert.ok(names.includes(name), `no ${name}`);
  for (const gait of ['strafeLeft', 'strafeRight', 'backpedal']) {
    assert.ok(facts.gaits[gait] > 0.5 && facts.gaits[gait] < 4, `${gait}: ${facts.gaits[gait]} m/s`);
    assert.ok(hipsDrift(gait) < 0.25, `${gait} drifts ${hipsDrift(gait)} m`);
    assert.ok(facts.clips[gait].crouch > -0.05 && facts.clips[gait].crouch < 0.6, `${gait}: crouch ${facts.clips[gait].crouch}`);
  }
  const { push, bounces } = facts.clips.dribble;
  assert.ok(push >= 0 && push < 1 && Number.isInteger(bounces) && bounces >= 1, JSON.stringify(facts.clips.dribble));
  for (const [name, clip] of Object.entries(facts.clips)) assert.equal(clip.loop, clip.kind === 'loop', name);
  for (const name of LOOPS) assert.equal(facts.clips[name].kind, 'loop', name);
  assert.deepEqual([facts.clips.jump.kind, facts.clips.land.kind], ['held', 'held']);
});

test('each striding gait says where in its cycle each foot lands, half a cycle apart', () => {
  for (const gait of ['walk', 'run', 'sprint']) {
    const { left, right } = facts.clips[gait].strike;
    assert.ok(left >= 0 && left < 1 && right >= 0 && right < 1, `${gait}: ${left} ${right}`);
    assert.ok(Math.abs(((((left - right) % 1) + 1) % 1) - 0.5) < 0.15, `${gait}: the feet land ${left} and ${right} of the way through`);
  }
});

test('the left-hand dribble is the right-hand one in a mirror', () => {
  const moves = (name, side) => swing(track(name, 'rotation', `mixamorig:${side}ForeArm`));
  assert.ok(moves('dribble', 'Right') > 2 * moves('dribble', 'Left'), 'the dribble is not a right-hand one');
  assert.ok(moves('dribbleLeft', 'Left') > 2 * moves('dribbleLeft', 'Right'), 'the mirror did not exchange the arms');
  assert.ok(Math.abs(moves('dribbleLeft', 'Left') - moves('dribble', 'Right')) < 0.01);
  const here = track('dribble', 'translation'), there = track('dribbleLeft', 'translation');
  here.forEach(([x, y, z], i) => assert.ok(Math.hypot(there[i][0] + x, there[i][1] - y, there[i][2] - z) < 0.002, `key ${i}: the hips are not mirrored`));
});

test('the landing carries on from the pose the jump ends in, and the knees give', () => {
  const end = track('jump', 'translation').at(-1), land = track('land', 'translation');
  assert.ok(Math.hypot(...land[0].map((v, i) => v - end[i])) < 0.01, 'the landing does not start where the jump ends');
  for (const bone of ['mixamorig:LeftUpLeg', 'mixamorig:RightLeg', 'mixamorig:Spine']) {
    const a = track('jump', 'rotation', bone).at(-1), b = track('land', 'rotation', bone)[0];
    assert.ok(Math.abs(a.reduce((sum, v, i) => sum + v * b[i], 0)) > 0.999, `${bone} jumps between the two motions`);
  }
  const sink = land[0][1] - land.at(-1)[1];
  assert.ok(sink > 0.03 && sink < 0.3, `the hips sink ${sink} m`);
  assert.ok(facts.clips.land.duration >= 0.06 && facts.clips.land.duration <= 0.35, `${facts.clips.land.duration} s`);
});

const MADE = { stance: 'loop', gather: 'held', hold: 'loop', holdLeft: 'loop', shoot: 'held', follow: 'held', freeThrow: 'once', pass: 'once', catch: 'held', reach: 'once', handUp: 'loop', contest: 'held', tip: 'held' };
const LENGTHS = { stance: 2, gather: 0.3, hold: 2, holdLeft: 2, shoot: 0.3, follow: 0.5, freeThrow: 0.9, pass: 0.35, catch: 0.35, reach: 0.4, handUp: 1, contest: 0.47, tip: 0.47 };

test('the hand-made motions are in the file, each with its kind and its length', () => {
  for (const [name, kind] of Object.entries(MADE)) {
    assert.ok(motion.json.animations.some(a => a.name === name), `no ${name}`);
    assert.equal(facts.clips[name].kind, kind, name);
    assert.ok(Math.abs(facts.clips[name].duration - LENGTHS[name]) < 0.035, `${name}: ${facts.clips[name].duration} s`);
  }
});

test('the motion file holds every motion the two tables name', () => {
  const names = motion.json.animations.map(a => a.name);
  assert.deepEqual([...LEG_CLIPS, ...ARM_CLIPS].filter(name => !names.includes(name)), []);
});
