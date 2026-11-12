import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS, assetUrl } from '../src/render/assets.js';

test('a file is asked for by its own path when the game is served', () => {
  assert.equal(assetUrl('assets/players.glb'), 'assets/players.glb');
});

test('in the single file the packed copy is used instead', () => {
  globalThis.TT_ASSETS = { 'assets/players.glb': 'blob:null/abc' };
  try { assert.equal(assetUrl('assets/players.glb'), 'blob:null/abc'); }
  finally { delete globalThis.TT_ASSETS; }
});

test('the game needs the players, the motion and the motion facts', () => {
  assert.deepEqual([...ASSETS], ['assets/players.glb', 'assets/motion.glb', 'assets/motion.json']);
});
