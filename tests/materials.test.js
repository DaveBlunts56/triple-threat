// The players' materials at each quality level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { MATERIALS, isPhysical, isDetailed, kitMaterial, partMaterial, fabricTiles } from '../src/render/materials.js';
import { QUALITY } from '../src/render/quality.js';

const blank = () => new THREE.Texture();
const fabric = fabricTiles(blank);

test('High and Ultra carry the detail pictures, only Ultra the sheen; Low and Medium are plain', () => {
  assert.deepEqual(QUALITY.order.filter(isDetailed), ['high', 'ultra']);
  assert.deepEqual(QUALITY.order.filter(isPhysical), ['ultra']);
});

test('the kit on Low is a plain material with its picture and roughness, and nothing more', () => {
  for (const part of ['jersey', 'shorts']) {
    const m = kitMaterial('low', { part, map: blank(), normal: blank(), fabric: fabric.knit });
    assert.equal(m.type, 'MeshStandardMaterial');
    assert.equal(m.roughness, MATERIALS.rough[part]);
    assert.equal(m.normalMap, null);
    assert.equal(m.side, THREE.DoubleSide, 'the inside shows at the arm holes and the hems');
  }
});

test('the kit on High has its weave and what stands out in its normals and its fabric in its roughness; on Ultra, sheen too', () => {
  const high = kitMaterial('high', { part: 'jersey', map: blank(), normal: blank(), fabric: fabric.knit });
  assert.equal(high.type, 'MeshStandardNodeMaterial');
  assert.ok(high.normalNode && high.roughnessNode);
  assert.equal(high.side, THREE.DoubleSide);
  const ultra = kitMaterial('ultra', { part: 'jersey', map: blank(), normal: blank(), fabric: fabric.knit });
  assert.equal(ultra.type, 'MeshPhysicalNodeMaterial');
  assert.ok(ultra.sheen > 0 && ultra.normalNode && ultra.roughnessNode);
});

test('the fabric tiles repeat and hold numbers, not colours', () => {
  for (const tile of [fabric.knit.normal, fabric.knit.rough, fabric.twill.normal, fabric.twill.rough]) {
    assert.deepEqual([tile.wrapS, tile.wrapT, tile.colorSpace], [THREE.RepeatWrapping, THREE.RepeatWrapping, THREE.NoColorSpace]);
  }
});

test('hair is cut out where its picture is clear, on both sides; skin and shoes are opaque', () => {
  for (const level of ['low', 'high']) {
    const hair = partMaterial(level, 'hair', blank()), shoes = partMaterial(level, 'shoes', blank());
    assert.deepEqual([hair.alphaTest, hair.side], [MATERIALS.cutout, THREE.DoubleSide]);
    assert.equal(shoes.alphaTest, 0);
  }
});
