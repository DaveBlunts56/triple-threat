import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { readGlb, primitivesUnder, floatsOf, nodesUnder } from './glb.js';
import { pack } from '../tools/single-file.mjs';
import { ROSTER } from '../src/sim/tuning.js';
import { LEG_CLIPS, ARM_CLIPS } from '../src/render/motion.js';
import { KIT } from '../src/render/kit.js';

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
  assert.equal(new Set(people.map(p => [p.skin, p.hairStyle, p.hair, p.hairColour, p.build, p.face].join())).size, 16);
});

test('the file holds every person in the table, named by team and number', () => {
  const roots = players.json.nodes.map(n => n.name ?? '').filter(n => /^player-\d+-\d+$/.test(n)).sort();
  assert.deepEqual(roots, people.map(rootName).sort());
});

test('every player is skinned, within the near level of detail\'s 45,000 triangles, and wears a jersey and shorts the game can tint', () => {
  const materials = players.json.materials.map(m => m.name);
  assert.ok(materials.includes('jersey') && materials.includes('shorts'), `materials ${materials}`);
  for (const person of people) {
    const triangles = trianglesUnder(players.json, rootName(person));
    assert.ok(triangles > 2000 && triangles <= 45000, `${rootName(person)}: ${triangles} triangles`);   // spec section 9
    for (const p of primitivesUnder(players.json, rootName(person))) assert.ok('JOINTS_0' in p.attributes, 'a mesh is not skinned');
  }
  assert.ok(players.json.skins.length >= 1);
  assert.equal(players.json.animations, undefined);
});

test('the skin keeps three quarters or more of the generated body\'s triangles, and carries the muscle detail baked from the full body', () => {
  const counts = JSON.parse(readFileSync('assets/source/counts.json', 'utf8'));
  for (const person of people) {
    const name = rootName(person), skin = primitivesUnder(players.json, name).find(p => players.json.materials[p.material].name.startsWith('skin'));
    const share = players.json.accessors[skin.indices].count / 3 / counts[name].skin;
    assert.ok(share >= 0.7 && share <= 0.92, `${name}: the skin keeps ${(share * 100).toFixed(0)}% of its triangles`);
    const normal = players.json.materials[skin.material].normalTexture;
    assert.ok(normal, `${name}: the skin has no normal map`);
    const image = players.json.images[players.json.textures[normal.index].source], view = players.json.bufferViews[image.bufferView];
    assert.deepEqual(imageSize(players.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength), image.mimeType), [1024, 1024]);
  }
});

test('each player has his eyes (the detailed ones), a cornea over each, brows, lashes, and a mouth of teeth and tongue', () => {
  for (const person of people) {
    const name = rootName(person), kinds = primitivesUnder(players.json, name).map(p => [players.json.materials[p.material].name.split('-')[0], p]);
    const of = kind => kinds.filter(([k]) => k === kind).map(([, p]) => p);
    for (const kind of ['eyes', 'cornea', 'brows', 'lashes', 'mouth']) assert.equal(of(kind).length, 1, `${name}: ${of(kind).length} ${kind}`);
    const triangles = p => players.json.accessors[p.indices].count / 3;
    assert.ok(triangles(of('eyes')[0]) > 500, `${name}: eyes of ${triangles(of('eyes')[0])} triangles`);   // the low-poly ones have under 200
    // The cornea is a cap over the front of each eye, standing a few millimetres off it.
    const eye = players.json.accessors[of('eyes')[0].attributes.POSITION], cornea = players.json.accessors[of('cornea')[0].attributes.POSITION];
    assert.ok(cornea.max[2] > eye.max[2] && cornea.max[2] < eye.max[2] + 0.005, `${name}: the cornea stands ${((cornea.max[2] - eye.max[2]) * 1000).toFixed(1)} mm in front of the eyes`);
    assert.ok(cornea.min[2] > (eye.min[2] + eye.max[2]) / 2, `${name}: the cornea reaches behind the middle of the eyes`);
  }
});

test('the skin carries the four expressions, and they move only his face: nothing below his neck', async () => {
  const { Matrix4, Vector3 } = await import('three');
  for (const person of people) {
    const name = rootName(person), root = players.json.nodes.findIndex(n => n.name === name);
    const meshNode = nodesUnder(players.json, root).map(i => players.json.nodes[i]).find(n => n.mesh !== undefined);
    const mesh = players.json.meshes[meshNode.mesh];
    assert.deepEqual(mesh.extras?.targetNames, ['blink', 'effort', 'shout', 'dejected'], `${name}: ${mesh.extras?.targetNames}`);
    // The neck's height: where the skin's Neck joint is, from its inverse bind matrix.
    const skin = players.json.skins[meshNode.skin], neckJoint = skin.joints.findIndex(j => players.json.nodes[j].name === 'mixamorig:Neck');
    const neck = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(floatsOf(players, skin.inverseBindMatrices).slice(16 * neckJoint, 16 * neckJoint + 16)).invert()).y;
    const p = mesh.primitives.find(q => players.json.materials[q.material].name.startsWith('skin')), at = floatsOf(players, p.attributes.POSITION);
    p.targets.forEach((target, t) => {
      const moved = floatsOf(players, target.POSITION);
      let count = 0;
      for (let i = 0; i < moved.length; i += 3) {
        if (Math.hypot(moved[i], moved[i + 1], moved[i + 2]) < 1e-5) continue;
        count++;
        assert.ok(at[i + 1] > neck, `${name}: ${mesh.extras.targetNames[t]} moves a point ${(neck - at[i + 1]).toFixed(3)} m under the neck`);
      }
      assert.ok(count > 20, `${name}: ${mesh.extras.targetNames[t]} moves ${count} points`);
    });
    for (const q of mesh.primitives.filter(q => q !== p)) for (const target of q.targets ?? []) {
      assert.ok(floatsOf(players, target.POSITION).every(v => Math.abs(v) < 1e-6), `${name}: an expression moves his ${players.json.materials[q.material].name}`);
    }
  }
});

const STYLES = ['buzz', 'fade', 'curls', 'afro', 'twists', 'locs', 'cornrows', 'short'];

test('every hair style is one of the eight, each worn by someone, the pack\'s styles naming the pack\'s hair', () => {
  for (const p of people) {
    assert.ok(STYLES.includes(p.hairStyle), `${rootName(p)}: ${p.hairStyle}`);
    assert.equal(p.hair !== null, ['afro', 'short'].includes(p.hairStyle), `${rootName(p)}: ${p.hairStyle} with ${p.hair}`);
  }
  assert.deepEqual([...new Set(people.map(p => p.hairStyle))].sort(), [...STYLES].sort());
});

test('each player\'s hair sits on his head (locs hang lower), within 9,000 triangles; twists are many separate twists; locs swing', async () => {
  const { Matrix4, Vector3 } = await import('three');
  for (const person of people) {
    const name = rootName(person), root = players.json.nodes.findIndex(n => n.name === name);
    const meshNode = nodesUnder(players.json, root).map(i => players.json.nodes[i]).find(n => n.mesh !== undefined), skin = players.json.skins[meshNode.skin];
    const joint = bone => skin.joints.find(j => players.json.nodes[j].name === bone);
    const hair = primitivesUnder(players.json, name).find(p => players.json.materials[p.material].name.startsWith('hair'));
    assert.ok(hair, `${name}: no hair`);
    const triangles = players.json.accessors[hair.indices].count / 3;
    assert.ok(triangles <= 9000, `${name}: ${triangles} triangles of hair`);
    // How high the head joint (the base of his skull) is, from its inverse bind matrix.
    const at = 16 * skin.joints.indexOf(joint('mixamorig:Head'));
    const headY = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(floatsOf(players, skin.inverseBindMatrices).slice(at, at + 16)).invert()).y;
    const lowest = players.json.accessors[hair.attributes.POSITION].min[1];
    if (person.hairStyle === 'locs') assert.ok(lowest < headY, `${name}: his locs do not hang`);
    else assert.ok(lowest > headY - 0.02, `${name}: his ${person.hairStyle} hair reaches ${(headY - lowest).toFixed(3)} m under the base of his skull`);
    assert.equal(['hairLocsLeft', 'hairLocsRight'].every(joint), person.hairStyle === 'locs', `${name}: the locs' spring bones`);
    if (person.hairStyle === 'twists') {
      // Separate pieces: the twists, and the close-cut base under them.
      const index = (() => { const a = players.json.accessors[hair.indices], v = players.json.bufferViews[a.bufferView], at = (v.byteOffset ?? 0) + (a.byteOffset ?? 0); return Array.from({ length: a.count }, (_, i) => a.componentType === 5125 ? players.bin.readUInt32LE(at + 4 * i) : players.bin.readUInt16LE(at + 2 * i)); })();
      const points = floatsOf(players, hair.attributes.POSITION), parent = new Map(), key = i => points.slice(3 * i, 3 * i + 3).map(n => n.toFixed(5)).join();
      const find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
      for (const i of index) if (!parent.has(key(i))) parent.set(key(i), key(i));
      for (let t = 0; t < index.length; t += 3) for (const k of [1, 2]) parent.set(find(key(index[t + k])), find(key(index[t])));
      const pieces = new Set([...parent.keys()].map(find)).size;
      assert.ok(pieces >= 61 && pieces <= 95, `${name}: ${pieces} pieces of hair`);
    }
  }
});

test('each player wears the gear the table gives him, with the skin under a sleeve or band taken away; high-top shoes in his team\'s colour', async () => {
  const { Matrix4, Vector3 } = await import('three');
  const ITEMS = ['headband', 'armSleeveLeft', 'armSleeveRight', 'legSleeveLeft', 'legSleeveRight', 'wristbandLeft', 'wristbandRight'];
  const worn = people.filter(p => p.gear.length);
  assert.ok(worn.length >= 6 && worn.length <= 10, `${worn.length} of 16 wear gear`);
  const shoes = {};
  for (const person of people) {
    const name = rootName(person), prims = primitivesUnder(players.json, name), material = p => players.json.materials[p.material];
    const gear = prims.filter(p => material(p).name.startsWith('gear-')).map(p => material(p).name.split('-').slice(1, 3));
    assert.deepEqual(gear.sort(), person.gear.map(g => [...g]).sort(), `${name}: wears ${gear}`);
    for (const [item, colour] of person.gear) assert.ok(ITEMS.includes(item) && ['white', 'black', 'team'].includes(colour), `${name}: ${item} ${colour}`);
    const skin = prims.find(p => material(p).name.startsWith('skin')), skinAt = floatsOf(players, skin.attributes.POSITION);
    for (const p of prims.filter(q => /^gear-(arm|leg)Sleeve/.test(material(q).name))) {
      // Away from its ends, where the skin it does not cover begins.
      const at = floatsOf(players, p.attributes.POSITION), box = players.json.accessors[p.attributes.POSITION], [low, high] = [box.min[1], box.max[1]];
      let over = 0, n = 0;
      for (let i = 0; i < at.length; i += 3 * 5) {
        if (at[i + 1] < low + (high - low) * 0.2 || at[i + 1] > high - (high - low) * 0.2) continue;
        n++;
        for (let j = 0; j < skinAt.length; j += 3) if (Math.hypot(at[i] - skinAt[j], at[i + 1] - skinAt[j + 1], at[i + 2] - skinAt[j + 2]) < 0.004) { over++; break; }
      }
      assert.ok(over < n * 0.15, `${name}: ${over} of ${n} points of his ${material(p).name} lie on skin`);
    }
    // High-tops: each trainer (the larger of a foot's two pieces; the other is the sock) reaches 6 cm over the ankle.
    const shoe = prims.find(p => material(p).name.startsWith('shoes')), at = floatsOf(players, shoe.attributes.POSITION);
    const index = (() => { const a = players.json.accessors[shoe.indices], v = players.json.bufferViews[a.bufferView], o = (v.byteOffset ?? 0) + (a.byteOffset ?? 0); return Array.from({ length: a.count }, (_, i) => a.componentType === 5125 ? players.bin.readUInt32LE(o + 4 * i) : players.bin.readUInt16LE(o + 2 * i)); })();
    const key = i => at.slice(3 * i, 3 * i + 3).map(n => n.toFixed(5)).join(), parent = new Map();
    const find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
    for (const i of index) if (!parent.has(key(i))) parent.set(key(i), key(i));
    for (let t = 0; t < index.length; t += 3) for (const k of [1, 2]) parent.set(find(key(index[t + k])), find(key(index[t])));
    const pieces = new Map();
    for (const i of index) { const r = find(key(i)), p = pieces.get(r) ?? { n: 0, top: -Infinity }; p.n++; p.top = Math.max(p.top, at[3 * i + 1]); pieces.set(r, p); }
    const meshNode = nodesUnder(players.json, players.json.nodes.findIndex(n => n.name === name)).map(i => players.json.nodes[i]).find(n => n.mesh !== undefined);
    const skinOf = players.json.skins[meshNode.skin], foot = skinOf.joints.findIndex(j => players.json.nodes[j].name === 'mixamorig:LeftFoot');
    const ankle = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(floatsOf(players, skinOf.inverseBindMatrices).slice(16 * foot, 16 * foot + 16)).invert()).y;
    for (const p of [...pieces.values()].sort((a, b) => b.n - a.n).slice(0, 2)) assert.ok(p.top > ankle + 0.06, `${name}: a shoe reaches ${(p.top - ankle).toFixed(3)} m over his ankle`);
    const picture = material(shoe).pbrMetallicRoughness.baseColorTexture.index;
    (shoes[person.team] ??= new Set()).add(players.json.textures[picture].source);
  }
  assert.equal(shoes[0].size, 1, 'every player of a team wears the same shoes');
  assert.notDeepEqual([...shoes[0]], [...shoes[1]], 'the two teams\' shoes are painted alike');
});

test('the skin carries its regions in its vertex colours: how rough (red) and where sweat gathers (green)', () => {
  for (const person of people) {
    const name = rootName(person), prims = primitivesUnder(players.json, name), material = p => players.json.materials[p.material].name;
    const skin = prims.find(p => material(p).startsWith('skin')), eyes = prims.find(p => material(p).startsWith('eyes'));
    assert.ok(skin.attributes.COLOR_0 !== undefined, `${name}: no masks`);
    const colours = floatsOf(players, skin.attributes.COLOR_0), at = floatsOf(players, skin.attributes.POSITION), width = colours.length / (at.length / 3);
    const eyeTop = players.json.accessors[eyes.attributes.POSITION].max[1];
    const rough = new Set(), forehead = [];
    for (let i = 0; i < at.length / 3; i++) {
      const r = colours[i * width], g = colours[i * width + 1];
      rough.add(r.toFixed(2));
      assert.ok(g >= 0 && g <= 1, `${name}: sweat ${g}`);
      if (at[3 * i + 1] > eyeTop + 0.03 && at[3 * i + 2] > 0.05) forehead.push([r, g]);   // in front, above his eyes
    }
    assert.deepEqual([...rough].sort(), ['0.45', '0.55', '0.60'], `${name}: roughness ${[...rough]}`);
    assert.ok(forehead.length > 10 && forehead.filter(([r, g]) => r < 0.5 && g === 1).length > forehead.length / 2, `${name}: the forehead`);
  }
});

// One player's kit piece: positions, normals and texture coordinates of the primitive whose material is `name`.
function piece(person, name) {
  const p = primitivesUnder(players.json, rootName(person)).find(q => players.json.materials[q.material].name === name);
  const rows = (attribute, width) => { const flat = floatsOf(players, p.attributes[attribute]); return Array.from({ length: flat.length / width }, (_, i) => flat.slice(i * width, (i + 1) * width)); };
  const indices = players.json.accessors[p.indices], view = players.json.bufferViews[indices.bufferView], start = (view.byteOffset ?? 0) + (indices.byteOffset ?? 0);
  const read = { 5121: i => players.bin.readUInt8(start + i), 5123: i => players.bin.readUInt16LE(start + 2 * i), 5125: i => players.bin.readUInt32LE(start + 4 * i) }[indices.componentType];
  return { at: rows('POSITION', 3), normal: rows('NORMAL', 3), uv: rows('TEXCOORD_0', 2), index: Array.from({ length: indices.count }, (_, i) => read(i)) };
}
const mean = list => list.reduce((sum, v) => sum + v, 0) / list.length;

test('jersey and shorts are laid out as a front panel and a back panel, the right way round', () => {
  for (const person of people) for (const name of ['jersey', 'shorts']) {
    const { at, normal, uv } = piece(person, name);
    assert.ok(uv.every(([u, v]) => u >= 0 && u <= 1 && v >= 0 && v <= 1), `${rootName(person)} ${name}: outside the picture`);
    // The main panels are the top of the picture (KIT.layout in src/render/kit.js); the bindings and side panels are below.
    const main = i => uv[i][1] <= KIT.layout.main[1];
    const front = uv.map(([u], i) => (u < 0.5 && main(i) ? i : -1)).filter(i => i >= 0), back = uv.map(([u], i) => (u > 0.5 && main(i) ? i : -1)).filter(i => i >= 0);
    // The front panel is in front of him (+z) and the back panel behind: both sides of the cloth share its place in the picture.
    assert.ok(mean(front.map(i => at[i][2])) > mean(back.map(i => at[i][2])) + 0.08, `${rootName(person)} ${name}: panels face the wrong way`);
    const lean = list => { const x = mean(list.map(i => at[i][0])), u = mean(list.map(i => uv[i][0])); return mean(list.map(i => (at[i][0] - x) * (uv[i][0] - u))); };
    assert.ok(lean(front) > 0 && lean(back) < 0, `${rootName(person)} ${name}: a panel is mirrored`);
    const mains = at.map((p, i) => i).filter(main), top = Math.max(...mains.map(i => at[i][1])), high = uv[mains.find(i => at[i][1] === top)][1];
    assert.ok(high < 0.2, `${rootName(person)} ${name}: the top edge is at v ${high}`);   // just under its binding
  }
});

test('each garment\'s picture is spread evenly round it: its sides are not squeezed into a sliver of the picture', () => {
  for (const person of people) for (const name of ['jersey', 'shorts']) {
    const { at, uv, index } = piece(person, name), rates = [];
    for (let t = 0; t < index.length; t += 3) for (let k = 0; k < 3; k++) {
      const a = index[t + k], b = index[t + (k + 1) % 3];
      if (uv[a][1] > KIT.layout.main[1] || uv[b][1] > KIT.layout.main[1]) continue;   // the main panels only
      const round = Math.hypot(at[a][0] - at[b][0], at[a][2] - at[b][2]), up = Math.abs(at[a][1] - at[b][1]), du = Math.abs(uv[a][0] - uv[b][0]);
      if (round < 0.01 || up > round * 0.3 || du > 0.2) continue;   // edges that run round the garment, not over a seam
      rates.push(du / round);
    }
    rates.sort((p, q) => p - q);
    const median = rates[rates.length >> 1], low = rates[Math.floor(rates.length * 0.05)];
    assert.ok(low > median * 0.35, `${rootName(person)} ${name}: a twentieth of the cloth gets ${(low / median * 100).toFixed(0)}% of the picture its middle gets`);
  }
});

test('the kit is cloth with thickness, with bindings, and the jersey is tucked into the shorts', () => {
  const inRegion = (uv, region) => uv[1] >= KIT.layout[region][0] - 0.005 && uv[1] <= KIT.layout[region][1] + 0.005;
  for (const person of people) {
    const name = rootName(person), jersey = piece(person, 'jersey'), shorts = piece(person, 'shorts');
    for (const [part, kit] of [['jersey', jersey], ['shorts', shorts]]) {
      assert.ok(kit.uv.filter(uv => inRegion(uv, 'trim')).length > 40, `${name} ${part}: no bindings`);
      // Thickness: from a point on the outside, 3 to 5 mm in along its normal, there is a point of the inside.
      let found = 0, tried = 0;
      for (let i = 0; i < kit.at.length && tried < 100; i += 23) {   // enough points that a few near an edge do not decide it
        const [x, y, z] = kit.at[i], [nx, ny, nz] = kit.normal[i];
        if (!inRegion(kit.uv[i], 'main')) continue;
        tried++;
        if (kit.at.some((q, j) => j !== i && kit.normal[j][0] * nx + kit.normal[j][1] * ny + kit.normal[j][2] * nz < -0.5
          && [3, 4, 5].some(d => Math.hypot(q[0] - (x - nx * d / 1000), q[1] - (y - ny * d / 1000), q[2] - (z - nz * d / 1000)) < 0.003))) found++;
      }
      assert.ok(found >= tried * 0.7, `${name} ${part}: only ${found} of ${tried} points have cloth 3 to 5 mm behind them`);   // near an edge or a binding the inside is not straight behind
    }
    const lowest = Math.min(...jersey.at.map(p => p[1])), waist = Math.max(...shorts.at.map(p => p[1]));
    assert.ok(lowest < waist - 0.04 && lowest > waist - 0.15, `${name}: the jersey ends ${waist - lowest} m under the shorts' waistband`);
  }
});

test('the shorts\' hems are bound all round without a fold: no binding hangs below the cloth\'s edge', () => {
  for (const person of people) {
    const { at, uv } = piece(person, 'shorts');
    const lowest = region => Math.min(...at.filter((p, i) => region(uv[i][1])).map(p => p[1]));
    const edge = lowest(v => v <= KIT.layout.main[1]), binding = lowest(v => v >= KIT.layout.trim[0] - 0.005);
    // The binding wraps 2 mm past the edge and the cloth is 4 mm thick: a binding turned off the cloth hangs its own width (16 mm) below.
    assert.ok(binding > edge - 0.008, `${rootName(person)}: the hem's binding hangs ${((edge - binding) * 1000).toFixed(0)} mm below its edge`);
  }
});

test('each player stands as tall as the table says, feet on the floor', () => {
  for (const person of people) {
    const { minY, maxY } = heightOf(players.json, rootName(person));
    assert.ok(Math.abs(minY) < 0.03, `${rootName(person)}: feet at ${minY}`);
    // Under a shell of hair or a base of close-cut hair the top of his head is gone: the hair is there instead.
    const hair = primitivesUnder(players.json, rootName(person)).find(p => players.json.materials[p.material].name.startsWith('hair'));
    const hidden = ['buzz', 'fade', 'curls', 'twists', 'locs'].includes(person.hairStyle);
    if (hidden) assert.ok(maxY < person.height + 0.03 && players.json.accessors[hair.attributes.POSITION].max[1] > person.height - 0.005, `${rootName(person)}: his head and hair stop at ${maxY}, the table says ${person.height}`);
    else assert.ok(Math.abs(maxY - person.height) < 0.03, `${rootName(person)}: top of the head at ${maxY}, table says ${person.height}`);
  }
});

// Sixteen players at under a megabyte each. Nothing caps the single file's size now; this catches a player grown by accident.
test('the player file stays under 35 MB', () => {
  assert.ok(statSync('assets/players.glb').size < 35e6, `${(statSync('assets/players.glb').size / 1e6).toFixed(1)} MB`);
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

test('each player has a spring bone in each leg of his shorts, among his skin\'s joints, hanging from the thigh', () => {
  for (const person of people) {
    const root = players.json.nodes.findIndex(n => n.name === rootName(person));
    const skin = players.json.skins.find(s => s.joints.some(j => nodesUnder(players.json, root).includes(j)));
    const names = skin.joints.map(j => players.json.nodes[j].name);
    for (const side of ['Left', 'Right']) {
      assert.ok(names.includes(`kitShorts${side}`), `${rootName(person)}: no kitShorts${side}`);
      const parent = players.json.nodes.find(n => (n.children ?? []).some(c => players.json.nodes[c].name === `kitShorts${side}`));
      assert.equal(parent.name, `mixamorig:${side}UpLeg`);
    }
  }
});
