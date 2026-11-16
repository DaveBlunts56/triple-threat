// The website build (tools/site.mjs): the game as a folder of files, as GitHub Pages serves it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteFiles, writeSite } from '../tools/site.mjs';
import { ASSETS } from '../src/render/assets.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const temps = [];
after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

test('the site has the page, every module the game loads, the engine files its import map names, every asset, the credits and the licence', () => {
  const files = siteFiles(ROOT);
  assert.equal(new Set(files).size, files.length, 'no file twice');
  for (const path of ['index.html', 'src/main.js', 'src/render/studio.js', ...ASSETS, 'assets/CREDITS.md', 'LICENSE']) assert.ok(files.includes(path), path);
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const [, path] of html.matchAll(/"three(?:\/\w+)?": "\.\/([^"]+)"/g)) assert.ok(files.includes(path), `the import map's ${path}`);
  for (const path of files) assert.ok(existsSync(join(ROOT, path)), path);
});

test('a site with a file missing is never written: it says which', () => {
  const root = mkdtempSync(join(tmpdir(), 'triple-threat-site-')), out = join(root, 'out');
  temps.push(root);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'index.html'), '<!doctype html>');
  writeFileSync(join(root, 'src/main.js'), 'export {};\n');
  mkdirSync(out); writeFileSync(join(out, 'old.txt'), 'kept');
  assert.throws(() => writeSite(root, out), /cannot build the site: .*assets\/players\.glb/);
  assert.ok(existsSync(join(out, 'old.txt')), 'nothing is cleared before it fails');
});
