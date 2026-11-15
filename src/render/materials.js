// The players' materials at each quality level. On High and Ultra, physically based node materials with the generated
// detail pictures; on Low and Medium, plain standard materials with only their colour and roughness, which cost little.
import * as THREE from 'three/webgpu';
import { texture, uv, vec2, vec3, normalMap, float } from 'three/tsl';

const f = Object.freeze;

// detailed: the levels whose materials carry the generated detail (normal and roughness pictures); physical: those
// whose cloth also has sheen, which costs more to draw (measured: High in physical materials took 27% longer a frame
// than before, with the physical kit's sheen most of it). kitRepeat: how many times the fabric tile is repeated across
// a garment's picture, across and down (a tile is about 4 cm of cloth). rough: each garment's roughness, before its
// fabric's own. sheen: how strongly cloth catches light at a grazing angle. detail: how strongly the fabric's weave
// shows in its normals. cutout: hair, brows and lashes are drawn where their picture is at least this opaque. hair,
// shoes, skin, cornea: their roughness.
export const MATERIALS = f({
  detailed: f(['high', 'ultra']), physical: f(['ultra']), kitRepeat: f([32, 47]), rough: f({ jersey: 0.75, shorts: 0.85 }), sheen: 0.3, detail: 0.6,
  cutout: 0.4, hair: 0.65, shoes: 0.4, skin: 0.55, cornea: 0.05,
});

export const isDetailed = level => MATERIALS.detailed.includes(level);
export const isPhysical = level => MATERIALS.physical.includes(level);

// The shared detail pictures, as Three.js textures: { knit, twill } each { normal, rough }. `load(path)` gives a texture.
export function fabricTiles(load) {
  const tile = path => { const t = load(path); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return t; };
  return f({
    knit: f({ normal: tile('assets/maps/knit-normal.png'), rough: tile('assets/maps/knit-rough.png') }),
    twill: f({ normal: tile('assets/maps/twill-normal.png'), rough: tile('assets/maps/twill-rough.png') }),
  });
}

// Two tangent-space normals (as -1..1 vectors) laid one over the other: their slopes added, as a weave on a fold.
const overlay = (a, b) => vec3(a.x.add(b.x), a.y.add(b.y), a.z.mul(b.z)).normalize();

// A garment's material: `part` 'jersey' or 'shorts', `map` its painted picture, `normal` its picture of what stands out
// (numbers, stitching) as a normal map, `fabric` its tile from fabricTiles.
export function kitMaterial(level, { part, map, normal, fabric }) {
  const rough = MATERIALS.rough[part];
  if (!isDetailed(level)) return new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0, side: THREE.DoubleSide });
  const material = isPhysical(level)
    ? new THREE.MeshPhysicalNodeMaterial({ map, metalness: 0, side: THREE.DoubleSide, sheen: MATERIALS.sheen, sheenRoughness: 0.8, sheenColor: new THREE.Color(1, 1, 1) })
    : new THREE.MeshStandardNodeMaterial({ map, metalness: 0, side: THREE.DoubleSide });
  const tile = uv().mul(vec2(...MATERIALS.kitRepeat));
  const weave = texture(fabric.normal, tile).xyz.mul(2).sub(1).mul(vec3(MATERIALS.detail, MATERIALS.detail, 1));
  const raised = texture(normal, uv()).xyz.mul(2).sub(1);
  material.normalNode = normalMap(overlay(weave, raised).mul(0.5).add(0.5));
  material.roughnessNode = texture(fabric.rough, tile).r.mul(float(rough / 0.8)).min(1);
  return material;
}

// The materials of the other parts, as the file gives their pictures (`normalMap`: the skin's baked muscle detail, shown
// on the detailed levels). Hair, brows and lashes are cut out where their picture is clear; the cornea is a clear,
// glossy shell over each eye that writes no depth, so the eye behind it is never hidden.
export function partMaterial(level, kind, map, normalMap = null) {
  if (kind === 'cornea') return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: MATERIALS.cornea, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false });
  const roughness = { hair: MATERIALS.hair, shoes: MATERIALS.shoes, skin: MATERIALS.skin }[kind] ?? 0.6;
  const cutout = ['hair', 'brows', 'lashes'].includes(kind);
  const options = { map, roughness, metalness: 0, ...(cutout ? { alphaTest: MATERIALS.cutout, side: THREE.DoubleSide } : {}) };
  if (normalMap && isDetailed(level)) options.normalMap = normalMap;
  return new THREE.MeshStandardMaterial(options);   // the skin's own material comes with its own stage
}
