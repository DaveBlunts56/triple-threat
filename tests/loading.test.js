import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createLoading } from '../src/render/loading.js';

const page = () => {
  const els = {};
  return { els, getElementById: id => (els[id] ??= { hidden: false, textContent: '', style: {} }) };
};

test('the loading screen is up from the moment the page opens, over everything else', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tag = html.match(/<div id="loading"[^>]*>/)[0];
  assert.doesNotMatch(tag, /hidden/);
  assert.ok(html.indexOf('id="loading"') < html.indexOf('id="hud"'), 'it comes before the game\'s own page');
});

test('it says what is loading and how far it has got: the files three.js loads, or a share it is given; then it goes', () => {
  const doc = page(), loading = createLoading(doc), e = doc.els;
  loading.show('Loading the arena…');
  THREE.DefaultLoadingManager.onProgress('a.glb', 3, 4);
  assert.deepEqual([e.loading.hidden, e.loadingText.textContent, e.loadingBar.style.width], [false, 'Loading the arena…', '75%']);
  THREE.DefaultLoadingManager.onProgress('c.png', 3, 6);   // more files found: the bar does not go back
  assert.equal(e.loadingBar.style.width, '75%');
  loading.show('Loading the players… 5 of 20', 5 / 20);
  THREE.DefaultLoadingManager.onProgress('b.glb', 1, 4);   // a file loading meanwhile does not move a bar it is not following
  assert.deepEqual([e.loadingText.textContent, e.loadingBar.style.width], ['Loading the players… 5 of 20', '25%']);
  loading.hide();
  assert.deepEqual([e.loading.hidden, e.loadingBar.style.width], [true, '0%']);
});
