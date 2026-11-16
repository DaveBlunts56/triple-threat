// Writes the game as a folder for a web server, the way GitHub Pages serves it: index.html, every module it loads
// (the game's own and the 3D engine's, at the paths its import map names), and the files it loads besides (see
// src/render/assets.js), each at its own path, with the credits and the licence. Usage: npm run site
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ASSETS } from '../src/render/assets.js';
import { graph } from './single-file.mjs';

const OUT = 'dist/site';

// The paths, under the project at `root`, of every file the site has.
export const siteFiles = root => ['index.html', ...graph(root).keys(), ...ASSETS, 'assets/CREDITS.md', 'LICENSE'];

// Copies them from `root` into `out`, which is emptied first. A missing one stops it: a site without its players must
// never go up by accident. Returns how many files, and how many bytes.
export function writeSite(root, out) {
  const files = siteFiles(root);
  const missing = files.filter(path => !existsSync(join(root, path)));
  if (missing.length) throw new Error(`cannot build the site: ${missing.join(', ')} missing`);
  rmSync(out, { recursive: true, force: true });
  let bytes = 0;
  for (const path of files) {
    const to = join(out, path);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(root, path), to);
    bytes += statSync(to).size;
  }
  return { files: files.length, bytes };
}

// Run as a script: write the site for this project.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { files, bytes } = writeSite(root, join(root, OUT));
  console.log(`${OUT}: ${files} files, ${(bytes / 1e6).toFixed(1)} MB`);
}
