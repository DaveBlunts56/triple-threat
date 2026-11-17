import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createLoading } from '../src/render/loading.js';

// A page with what the loading screen touches: each element's text, style, classes and click listeners.
const page = () => {
  const els = {};
  const element = () => {
    const classes = new Set(), on = new Map();
    return { hidden: false, textContent: '', style: {}, on,
      classList: { add: (...c) => c.forEach(x => classes.add(x)), remove: (...c) => c.forEach(x => classes.delete(x)), contains: c => classes.has(c) },
      addEventListener: (type, fn) => on.set(type, fn), removeEventListener: (type, fn) => { if (on.get(type) === fn) on.delete(type); } };
  };
  return { els, getElementById: id => (els[id] ??= element()) };
};
// A window whose keydown listeners (in the capture phase) can be fired, and whose timers wait until `flush`.
const windowLike = () => {
  const keys = new Set(), timers = [];
  return { keys, addEventListener: (type, fn, capture) => { if (type === 'keydown' && capture) keys.add(fn); },
    removeEventListener: (type, fn, capture) => { if (type === 'keydown' && capture) keys.delete(fn); },
    setTimeout: fn => timers.push(fn), flush: () => timers.splice(0).forEach(fn => fn()) };
};
const press = (win, key, extra = {}) => {
  const e = { type: 'keydown', key, repeat: false, ctrlKey: false, metaKey: false, altKey: false, prevented: false, stopped: false, ...extra,
    preventDefault() { e.prevented = true; }, stopImmediatePropagation() { e.stopped = true; } };
  [...win.keys].forEach(fn => fn(e));
  return e;
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

test('the page opens on the splash: the game\'s name over the loading, and a start button not yet shown', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html.match(/<div id="loading"[^>]*>/)[0], /class="splash"/);
  const splash = html.slice(html.indexOf('id="loading"'), html.indexOf('id="court"'));
  assert.match(splash, /<b>Triple Threat<\/b>/);
  assert.match(splash, /<button id="loadingStart" type="button" hidden>/);
});

test('once the game can be played the splash asks for any key, and the key that starts it goes no further', async () => {
  const doc = page(), loading = createLoading(doc), e = doc.els, win = windowLike();
  let started = false;
  loading.ready(win).then(() => { started = true; });
  assert.deepEqual([e.loading.classList.contains('ready'), e.loadingStart.hidden, e.loadingStart.textContent], [true, false, 'Press any key to start']);
  // Keys held for others, the browser's own, and shortcuts do not start it, and are left to the browser.
  for (const [key, extra] of [['Shift'], ['Tab'], ['F5'], ['F11'], ['r', { ctrlKey: true }], ['Enter', { repeat: true }]]) {
    const k = press(win, key, extra);
    assert.deepEqual([k.prevented, k.stopped], [false, false], key);
  }
  await Promise.resolve();
  assert.equal(started, false);
  const k = press(win, 'Enter');
  assert.deepEqual([k.prevented, k.stopped], [true, true], 'the menu never sees it');
  await Promise.resolve();
  assert.deepEqual([started, win.keys.size, e.loading.classList.contains('going'), e.loading.hidden], [true, 0, true, false]);
  win.flush();   // the fade is over: the plain loading screen from now on, hidden
  assert.deepEqual([e.loading.hidden, e.loading.classList.contains('splash'), e.loadingStart.hidden], [true, false, true]);
});

test('a click or a tap on the splash starts the game too, and a touch screen is asked for a tap', async () => {
  const doc = page(), loading = createLoading(doc), e = doc.els, win = windowLike();
  let started = false;
  loading.ready(win, true).then(() => { started = true; });
  assert.equal(e.loadingStart.textContent, 'Tap to start');
  e.loading.on.get('click')({ type: 'click' });
  await Promise.resolve();
  assert.deepEqual([started, win.keys.size, e.loading.on.has('click')], [true, 0, false]);
});
