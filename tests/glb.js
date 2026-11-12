// Reads a binary glTF file without Three.js: the JSON chunk parsed, and the binary chunk as a Buffer.
import { readFileSync } from 'node:fs';

export function readGlb(path) {
  const data = readFileSync(path);
  if (data.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a .glb file`);
  let json = null, bin = null;
  for (let at = 12; at < data.length;) {
    const length = data.readUInt32LE(at), type = data.readUInt32LE(at + 4);
    const chunk = data.subarray(at + 8, at + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    at += 8 + length;
  }
  return { json, bin };
}

// Indexes of every node beneath (and including) node `index`.
export function nodesUnder(gltf, index) {
  return [index, ...(gltf.nodes[index].children ?? []).flatMap(child => nodesUnder(gltf, child))];
}

// Every mesh primitive beneath the node named `name`.
export function primitivesUnder(gltf, name) {
  const root = gltf.nodes.findIndex(n => n.name === name);
  return nodesUnder(gltf, root).map(i => gltf.nodes[i].mesh).filter(m => m !== undefined).flatMap(m => gltf.meshes[m].primitives);
}

// The numbers of a FLOAT accessor, in file order.
export function floatsOf({ json, bin }, index) {
  const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView];
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return Array.from({ length: accessor.count * width }, (_, i) => bin.readFloatLE(start + 4 * i));
}
