import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readGlb, primitivesUnder } from './glb.js';

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
