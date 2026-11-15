// The players' materials at each quality level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { MATERIALS, isPhysical, isDetailed, kitMaterial, partMaterial, hairMaterial, gearMaterial, skinMaterial, skinRoughness, fabricTiles } from '../src/render/materials.js';
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
  for (const tile of [fabric.knit.normal, fabric.knit.rough, fabric.twill.normal, fabric.twill.rough, fabric.strands.normal, fabric.pores.normal]) {
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

test('on High and Ultra the skin shows the muscle detail baked into its normal map; Low and Medium stay plain', () => {
  const baked = blank();
  for (const level of QUALITY.order) {
    assert.equal(partMaterial(level, 'skin', blank(), baked).normalMap, isDetailed(level) ? baked : null, level);
    assert.equal(partMaterial(level, 'shoes', blank()).normalMap, null, level);
  }
});

test('the face\'s parts: brows and lashes cut out like hair, a glossy cornea over each eye that only adds its reflections', () => {
  for (const level of QUALITY.order) {
    for (const kind of ['brows', 'lashes']) {
      const m = partMaterial(level, kind, blank());
      assert.deepEqual([m.alphaTest, m.side], [MATERIALS.cutout, THREE.DoubleSide], `${level} ${kind}`);
    }
    // Black and added to what is behind it: it brings only its reflections, and the iris keeps its colour.
    const cornea = partMaterial(level, 'cornea', null);
    assert.deepEqual([cornea.transparent, cornea.depthWrite, cornea.roughness, cornea.map, cornea.blending, cornea.color.getHex()], [true, false, MATERIALS.cornea, null, THREE.AdditiveBlending, 0], level);
    for (const kind of ['eyes', 'mouth']) assert.equal(partMaterial(level, kind, blank()).transparent, false, `${level} ${kind}`);
  }
});

test('modelled hair is solid, as rough as hair is, with strands in its normals on High and a sheen on Ultra', () => {
  for (const level of QUALITY.order) {
    const m = hairMaterial(level, { map: blank(), strands: fabric.strands });
    assert.deepEqual([m.alphaTest, m.side, m.transparent], [0, THREE.FrontSide, false], level);
    assert.equal(m.roughness, MATERIALS.strands.rough, level);
    assert.equal(Boolean(m.normalNode), isDetailed(level), level);
    assert.equal(m.type, isPhysical(level) ? 'MeshPhysicalNodeMaterial' : isDetailed(level) ? 'MeshStandardNodeMaterial' : 'MeshStandardMaterial', level);
    if (isPhysical(level)) assert.ok(m.sheen > 0, level);
  }
});

test('gear is plain cloth in its colour on every level', () => {
  for (const level of QUALITY.order) {
    const m = gearMaterial(level, '#161616');
    assert.deepEqual([m.type, m.color.getHexString(), m.roughness, m.map], ['MeshStandardMaterial', '161616', MATERIALS.gear, null], level);
  }
});

test('skin on High and Ultra: rough by its region, never glossy when dry, wetter with sweat but never under 0.2; pores up close; a warm sheen', () => {
  for (const rough of [0, 0.3, 0.45, 0.6, 1]) assert.ok(skinRoughness(rough, 0, 1) >= 0.4 && skinRoughness(rough, 0, 1) <= 1, `${rough}`);
  assert.ok(Math.abs(skinRoughness(0.6, 1, 1) - 0.6 * 0.45) < 1e-9);
  assert.equal(skinRoughness(0.4, 1, 1), 0.2);
  assert.equal(skinRoughness(0.6, 1, 0), 0.6);   // where no sweat gathers it stays dry
  assert.deepEqual([MATERIALS.skinLook.pores, MATERIALS.skinLook.fade], [40, [2, 8]]);
  for (const level of ['high', 'ultra']) {
    const m = skinMaterial(level, { map: blank(), normalMap: blank(), pores: blank() });
    assert.equal(m.type, 'MeshPhysicalNodeMaterial', level);
    assert.ok(m.roughnessNode && m.normalNode && m.colorNode, level);
    assert.equal(m.sheenColor.getHexString(), '4a1e14', level);
    assert.equal(m.sheen, MATERIALS.skinLook.sheen, level);
    assert.equal(m.userData.sweat.value, 0, level);
  }
  const low = skinMaterial('low', { map: blank(), normalMap: blank(), pores: blank() });
  assert.deepEqual([low.type, low.normalMap, low.roughness], ['MeshStandardMaterial', null, MATERIALS.skin]);
});

test('a jersey on High and Ultra darkens with sweat at the middle of the chest and the upper back; shorts and Low do not', () => {
  for (const level of ['high', 'ultra']) {
    const jersey = kitMaterial(level, { part: 'jersey', map: blank(), normal: blank(), fabric: fabric.knit });
    assert.equal(jersey.userData.sweat?.value, 0, level);
    assert.ok(jersey.colorNode, level);
    assert.equal(kitMaterial(level, { part: 'shorts', map: blank(), normal: blank(), fabric: fabric.twill }).userData.sweat, undefined, level);
  }
  assert.equal(kitMaterial('low', { part: 'jersey', map: blank(), normal: blank(), fabric: fabric.knit }).userData.sweat, undefined);
  assert.deepEqual(MATERIALS.jerseySweat, { darker: 0.12, chest: [0.25, 0.45, 0.12, 0.2], back: [0.75, 0.3, 0.12, 0.15] });
});
