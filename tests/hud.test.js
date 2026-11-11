import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { periodLabel, clockText, createHud } from '../src/render/hud.js';
import { createMatch } from '../src/sim/state.js';

test('periods are Q1-Q4 then OT1, OT2', () => {
  assert.deepEqual([1, 4, 5, 6].map(periodLabel), ['Q1', 'Q4', 'OT1', 'OT2']);
});

test('the game clock reads m:ss and only shows 0:00 when time is really up', () => {
  assert.equal(clockText(180), '3:00');
  assert.equal(clockText(179.2), '3:00');
  assert.equal(clockText(61), '1:01');
  assert.equal(clockText(9.01), '0:10');
  assert.equal(clockText(0.01), '0:01');
  assert.equal(clockText(0), '0:00');
});

// Just enough of a document for createHud: elements that remember their text.
function fakeDoc() {
  const els = {};
  return { els, getElementById: id => (els[id] ??= { textContent: '', hidden: false }) };
}

test('score changes are announced in words, once', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  s.score = [2, 0];
  hud.update(s, 'webgl2');
  assert.equal(doc.els.announce.textContent, 'You 2, opponent 0');
});

test('only the score announcement is a live region, so the clocks are not read out every second', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const live = html.match(/<[^>]*aria-live[^>]*>/g) ?? [];
  assert.equal(live.length, 1);
  assert.match(live[0], /id="announce"/);
});
