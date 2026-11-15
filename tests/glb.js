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

// The numbers of a FLOAT accessor, in file order. A sparse accessor (as morph targets are written) is its base, or
// zeros, with its listed elements replaced.
export function floatsOf({ json, bin }, index) {
  const accessor = json.accessors[index];
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type];
  const at = (viewIndex, offset = 0) => (json.bufferViews[viewIndex].byteOffset ?? 0) + offset;
  const out = accessor.bufferView === undefined ? new Array(accessor.count * width).fill(0)
    : Array.from({ length: accessor.count * width }, (_, i) => bin.readFloatLE(at(accessor.bufferView, accessor.byteOffset) + 4 * i));
  if (accessor.sparse) {
    const { count, indices, values } = accessor.sparse, size = { 5121: 1, 5123: 2, 5125: 4 }[indices.componentType];
    const read = { 1: o => bin.readUInt8(o), 2: o => bin.readUInt16LE(o), 4: o => bin.readUInt32LE(o) }[size];
    for (let k = 0; k < count; k++) {
      const element = read(at(indices.bufferView, indices.byteOffset) + size * k);
      for (let c = 0; c < width; c++) out[element * width + c] = bin.readFloatLE(at(values.bufferView, values.byteOffset) + 4 * (k * width + c));
    }
  }
  return out;
}

// A PNG file as { width, height, channels, pixels } (8 bits a channel, not interlaced): what our tools write.
import { inflateSync } from 'node:zlib';
export function readPng(path) {
  const data = readFileSync(path);
  let at = 8, width = 0, height = 0, type = 0, depth = 0;
  const parts = [];
  while (at < data.length) {
    const length = data.readUInt32BE(at), kind = data.toString('ascii', at + 4, at + 8), body = data.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; }
    if (kind === 'IDAT') parts.push(body);
    at += 12 + length;
  }
  if (depth !== 8) throw new Error(`${path}: ${depth} bits a channel`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type], raw = inflateSync(Buffer.concat(parts)), stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[out + x - channels] : 0, b = y ? pixels[out - stride + x] : 0, c = y && x >= channels ? pixels[out - stride + x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const guess = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      pixels[out + x] = (line[x] + guess) & 255;
    }
  }
  return { width, height, channels, pixels };
}
