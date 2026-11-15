// The players' materials at each quality level. On High and Ultra, physically based node materials with the generated
// detail pictures; on Low and Medium, plain standard materials with only their colour and roughness, which cost little.
import * as THREE from 'three/webgpu';
import { texture, uv, vec2, vec3, normalMap, float, uniform, vertexColor, positionView, smoothstep, max, clamp } from 'three/tsl';

const f = Object.freeze;

// detailed: the levels whose materials carry the generated detail (normal and roughness pictures); physical: those
// whose cloth also has sheen, which costs more to draw (measured: High in physical materials took 27% longer a frame
// than before, with the physical kit's sheen most of it). kitRepeat: how many times the fabric tile is repeated across
// a garment's picture, across and down (a tile is about 4 cm of cloth). rough: each garment's roughness, before its
// fabric's own. sheen: how strongly cloth catches light at a grazing angle. detail: how strongly the fabric's weave
// shows in its normals. cutout: hair, brows and lashes are drawn where their picture is at least this opaque. hair,
// shoes, skin, cornea, gear: their roughness. strands: the modelled hair's roughness, how many times the strands tile is
// repeated across and up its picture, how strongly they show, and its sheen on Ultra. jerseySweat: how much darker a
// soaked jersey gets, and where: round the middle of the chest and of the upper back, as [u, v, half width, half
// height] of its picture. skinLook: the skin on High and
// Ultra (see skinMaterial): a reddish sheen for light through the skin at its edges (strength, colour, roughness); the pores tile, repeated
// this many times across the skin's picture and as strong, showing in full within fade[0] metres of the camera and gone
// by fade[1]; the roughest the regions' map may make it glossy (floor); sweat at its fullest lowers the roughness by
// `wet` and darkens it by `darker` where it gathers, but never below `least`.
export const MATERIALS = f({
  detailed: f(['high', 'ultra']), physical: f(['ultra']), kitRepeat: f([32, 47]), rough: f({ jersey: 0.75, shorts: 0.85 }), sheen: 0.3, detail: 0.6,
  cutout: 0.4, hair: 0.65, shoes: 0.4, skin: 0.55, cornea: 0.05, gear: 0.7,
  strands: f({ rough: 0.5, repeat: f([24, 48]), detail: 0.8, sheen: 0.5 }),
  jerseySweat: f({ darker: 0.12, chest: f([0.25, 0.45, 0.12, 0.2]), back: f([0.75, 0.3, 0.12, 0.15]) }),
  skinLook: f({ sheen: 0.35, sheenColour: 0x4a1e14, sheenRough: 0.6, pores: 60, poreDetail: 0.3, fade: f([2, 8]), floor: 0.4, wet: 0.55, darker: 0.08, least: 0.2 }),
});

export const isDetailed = level => MATERIALS.detailed.includes(level);
export const isPhysical = level => MATERIALS.physical.includes(level);

// The shared detail pictures, as Three.js textures: { knit, twill } each { normal, rough }, and { strands, pores }
// each { normal }. `load(path)` gives a texture.
export function fabricTiles(load) {
  const tile = path => { const t = load(path); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return t; };
  return f({
    knit: f({ normal: tile('assets/maps/knit-normal.png'), rough: tile('assets/maps/knit-rough.png') }),
    twill: f({ normal: tile('assets/maps/twill-normal.png'), rough: tile('assets/maps/twill-rough.png') }),
    strands: f({ normal: tile('assets/maps/strands-normal.png') }),
    pores: f({ normal: tile('assets/maps/pores-normal.png') }),
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
  if (part === 'jersey') {   // sweat (0 to 1, set by people.js) darkens it where it soaks through first
    const sweat = uniform(0), { darker, chest, back } = MATERIALS.jerseySweat;
    const patch = ([u, v, w, h]) => { const d = uv().sub(vec2(u, v)).div(vec2(w, h)); return d.dot(d).negate().exp(); };
    material.colorNode = texture(map, uv()).mul(float(1).sub(sweat.mul(max(patch(chest), patch(back))).mul(darker)));
    material.userData.sweat = sweat;
  }
  return material;
}

// The material of hair modelled in the build (tools/blender/hair.py): solid, its colour from its picture (`map`), the
// strands tile (`strands`, from fabricTiles) laid over it in its normals on High and Ultra, with a sheen on Ultra.
export function hairMaterial(level, { map, strands }) {
  const { rough, repeat, detail, sheen } = MATERIALS.strands;
  if (!isDetailed(level)) return new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0 });
  const material = isPhysical(level)
    ? new THREE.MeshPhysicalNodeMaterial({ map, roughness: rough, metalness: 0, sheen, sheenRoughness: 0.5, sheenColor: new THREE.Color(1, 1, 1) })
    : new THREE.MeshStandardNodeMaterial({ map, roughness: rough, metalness: 0 });
  const lines = texture(strands.normal, uv().mul(vec2(...repeat))).xyz.mul(2).sub(1).mul(vec3(detail, detail, 1)).normalize();
  material.normalNode = normalMap(lines.mul(0.5).add(0.5));
  return material;
}

// Headbands, sleeves and wristbands: plain cloth in `colour` ('#rrggbb', see kit.js gearColour).
export const gearMaterial = (level, colour) => new THREE.MeshStandardMaterial({ color: new THREE.Color(colour), roughness: MATERIALS.gear, metalness: 0 });

// How rough the skin is where its region's map says `rough`, with `sweat` (0 to 1, see sweat.js) gathered as much as
// its sweat map says `wet` (0 to 1). The skin material works the same out on the graphics card.
export function skinRoughness(rough, sweat, wet) {
  const { floor, wet: drop, least } = MATERIALS.skinLook;
  return Math.max(least, Math.min(1, Math.max(floor, rough)) * (1 - drop * sweat * wet));
}

// The skin. On High and Ultra: physically based, its roughness and where sweat gathers from the masks the build stores
// in its vertex colours (red, green), its baked muscle detail (`normalMap`) with the pores tile (`pores`) over it up
// close, a warm sheen, and material.userData.sweat (a uniform, 0 to 1) for sweat.js. On Low and Medium: plain.
export function skinMaterial(level, { map, normalMap: baked, pores }) {
  const look = MATERIALS.skinLook;
  if (!isDetailed(level)) return Object.assign(new THREE.MeshStandardMaterial({ map, roughness: MATERIALS.skin, metalness: 0 }), { userData: { sweat: { value: 0 } } });
  const material = new THREE.MeshPhysicalNodeMaterial({ map, metalness: 0, sheen: look.sheen, sheenColor: new THREE.Color(look.sheenColour), sheenRoughness: look.sheenRough });
  const sweat = uniform(0), masks = vertexColor(), wet = sweat.mul(masks.g);
  material.colorNode = texture(map, uv()).mul(float(1).sub(wet.mul(look.darker)));
  material.roughnessNode = max(clamp(masks.r, look.floor, 1).mul(float(1).sub(wet.mul(look.wet))), look.least);
  const near = float(1).sub(smoothstep(look.fade[0], look.fade[1], positionView.length())).mul(look.poreDetail);
  const pore = texture(pores, uv().mul(look.pores)).xyz.mul(2).sub(1).mul(vec3(near, near, 1));
  const muscle = baked ? texture(baked, uv()).xyz.mul(2).sub(1) : vec3(0, 0, 1);
  material.normalNode = normalMap(overlay(muscle, pore).mul(0.5).add(0.5));
  material.userData.sweat = sweat;
  return material;
}

// The materials of the other parts, as the file gives their pictures (`normalMap`: the skin's baked muscle detail, shown
// on the detailed levels). Hair, brows and lashes are cut out where their picture is clear. The cornea is a glossy
// shell over each eye, black and added to what is behind it, so that it brings only its reflections, and it writes no
// depth, so the eye behind it is never hidden.
export function partMaterial(level, kind, map, normalMap = null) {
  if (kind === 'cornea') return new THREE.MeshStandardMaterial({ color: 0x000000, roughness: MATERIALS.cornea, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const roughness = { hair: MATERIALS.hair, shoes: MATERIALS.shoes, skin: MATERIALS.skin }[kind] ?? 0.6;
  const cutout = ['hair', 'brows', 'lashes'].includes(kind);
  const options = { map, roughness, metalness: 0, ...(cutout ? { alphaTest: MATERIALS.cutout, side: THREE.DoubleSide } : {}) };
  if (normalMap && isDetailed(level)) options.normalMap = normalMap;
  return new THREE.MeshStandardMaterial(options);   // the skin's own material comes with its own stage
}
