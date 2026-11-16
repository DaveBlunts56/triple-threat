// Packs the game into one HTML file that runs when opened straight from disk (file://),
// where Chrome refuses to load separate module files. Usage: npm run single
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ASSETS } from '../src/render/assets.js';

const OUT = 'dist/triple-threat.html';
// The bare names the game imports, as in index.html's import map.
const BARE = {
  three: 'node_modules/three/build/three.webgpu.js', 'three/webgpu': 'node_modules/three/build/three.webgpu.js',
  'three/tsl': 'node_modules/three/build/three.tsl.js',
};
const PREFIX = { 'three/addons/': 'node_modules/three/examples/jsm/' };
// An import or re-export statement that starts a line, up to its module name. Comments and strings never start a line this way.
const IMPORT = /^((?:import|export)\b[\w\s{},*$]*?\bfrom\s*|import\s*)(['"])([^'"\n]+)\2/gm;
const MARK = '"@@';   // a rewritten module name is "@@<path>", swapped for a blob: URL when the page loads

function resolveImport(from, name) {
  if (name.startsWith('.')) return posix.join(posix.dirname(from), name);
  const prefix = Object.keys(PREFIX).find(p => name.startsWith(p));
  return prefix ? PREFIX[prefix] + name.slice(prefix.length) : BARE[name];
}

// Every module reachable from the game's entry in the project at `root`, each one after the modules it imports:
// a Map of its path to its code, every import's name rewritten to "@@<path>". Also used by tools/site.mjs.
export function graph(root) {
  root = resolve(root);
  const modules = new Map(), visiting = new Set();
  function add(path) {
    if (modules.has(path)) return;
    if (visiting.has(path)) throw new Error(`import cycle through ${path}: this loader needs imports to form a tree`);
    visiting.add(path);
    const source = readFileSync(join(root, path), 'utf8');
    if (source.includes(MARK)) throw new Error(`${path} already contains ${MARK}`);
    const code = source.replace(IMPORT, (whole, head, quote, name) => {
      const dep = resolveImport(path, name);
      if (!dep) throw new Error(`${path} imports '${name}', which this script does not know how to pack`);
      add(dep);
      return `${head}${MARK}${dep}"`;
    });
    visiting.delete(path);
    modules.set(path, code);
  }
  add('src/main.js');
  return modules;
}

function build(root) {
  root = resolve(root);
  const modules = graph(root);

  // Self-check: every rewritten name points at a module that loads earlier.
  const seen = new Set();
  for (const [path, code] of modules) {
    for (const [, dep] of code.matchAll(/"@@([^"]+)"/g)) if (!seen.has(dep)) throw new Error(`${path} needs ${dep} before it is loaded`);
    seen.add(path);
  }

  // The models and motion, as base64. A missing one stops the build: a single file without players must never be made by accident.
  const packed = Object.fromEntries(ASSETS.map(path => {
    if (!existsSync(join(root, path))) throw new Error(`cannot pack: ${path} is missing (see assets/source/README.md for how to build it)`);
    return [path, readFileSync(join(root, path)).toString('base64')];
  }));

  // "<" is escaped so no module's text can end the script element early. Base64 never contains it.
  const data = JSON.stringify([...modules]).replaceAll('<', '\\u003c');
  const loader = `<script type="application/json" id="modules">${data}</script>
<script type="application/json" id="assets">${JSON.stringify(packed)}</script>
<script type="module">
  const read = id => JSON.parse(document.getElementById(id).textContent);
  // Each packed file becomes a blob: URL the game is pointed at instead of the network.
  globalThis.TT_ASSETS = {};
  for (const [path, base64] of Object.entries(read('assets'))) {
    const text = atob(base64), bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    globalThis.TT_ASSETS[path] = URL.createObjectURL(new Blob([bytes]));
  }
  // Each packed module becomes a blob: URL; later modules import earlier ones by those URLs.
  const urls = {};
  for (const [path, code] of read('modules')) {
    const linked = code.replace(/"@@([^"]+)"/g, (_, dep) => JSON.stringify(urls[dep]));
    urls[path] = URL.createObjectURL(new Blob([linked], { type: 'text/javascript' }));
  }
  await import(urls['src/main.js']);
</script>`;

  const swap = (html, pattern, replacement) => {
    if (!pattern.test(html)) throw new Error(`index.html no longer contains ${pattern}`);
    return html.replace(pattern, () => replacement);
  };
  let html = readFileSync(join(root, 'index.html'), 'utf8');
  html = swap(html, /<script type="importmap">[\s\S]*?<\/script>\n?/, '');
  html = swap(html, /<script type="module" src="\.\/src\/main\.js"><\/script>/, loader);
  return { html, modules: modules.size };
}

// The single-file HTML for the project at `root`.
export const pack = root => build(root).html;

// Run as a script: write the file for this project.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { html, modules } = build(root);
  mkdirSync(join(root, dirname(OUT)), { recursive: true });
  writeFileSync(join(root, OUT), html);
  console.log(`${OUT}: ${modules} modules, ${ASSETS.length} packed files, ${(Buffer.byteLength(html) / 1e6).toFixed(1)} MB`);
}
