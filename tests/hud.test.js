import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { periodLabel, clockText, createHud, callText, rosterLine, subNote, easeFrame } from '../src/render/hud.js';
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
  return { els, getElementById: id => (els[id] ??= { textContent: '', hidden: false, value: undefined, style: {} }) };
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

test('calls read as a sentence and say what follows', () => {
  const call = (kind, team, extra) => ({ kind, team, ball: 1 - team, number: null, shots: 0, ...extra });
  assert.equal(callText(call('travel', 0)), "Travelling. Opponent's ball");
  assert.equal(callText(call('doubleDribble', 1)), 'Double dribble. Your ball');
  assert.equal(callText(call('backcourt', 0)), "Backcourt violation. Opponent's ball");
  assert.equal(callText(call('eightSeconds', 0)), "8 seconds. Opponent's ball");
  assert.equal(callText(call('threeSeconds', 1)), '3 seconds. Your ball');
  assert.equal(callText(call('fiveSeconds', 1)), '5 seconds. Your ball');
  assert.equal(callText(call('shotClock', 0)), "Shot clock violation. Opponent's ball");
  assert.equal(callText(call('out', 1)), 'Out of bounds. Your ball');
  assert.equal(callText(call('reach', 1, { number: 8 })), 'Reach-in foul on 8. Your ball');
  assert.equal(callText(call('block', 1, { number: 8, shots: 2 })), 'Blocking foul on 8. Two shots');
  assert.equal(callText(call('shooting', 0, { number: 7, shots: 1 })), 'Shooting foul on 7. One shot');
  assert.equal(callText(call('shooting', 0, { number: 7, shots: 3 })), 'Shooting foul on 7. Three shots');
  assert.equal(callText(call('charge', 0, { number: 4 })), "Charge on 4. Opponent's ball");
});

test('the scoreboard shows team fouls and the energy of the player you control', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  s.teamFouls = [2, 1]; s.controlled = 1; s.rosters[0][1].energy = 0.4;
  hud.update(s, 'webgl2');
  assert.deepEqual([doc.els.fouls0.textContent, doc.els.fouls1.textContent, doc.els.energy.value], ['Fouls 2', 'Fouls 1', 0.4]);
});

test('the call banner shows during the stoppage and is read out once', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  s.phase = 'dead'; s.call = { kind: 'travel', team: 0, ball: 1, number: null, shots: 0 };
  hud.update(s, 'webgl2');
  assert.deepEqual([doc.els.call.hidden, doc.els.call.textContent, doc.els.announce.textContent],
    [false, "Travelling. Opponent's ball", "Travelling. Opponent's ball"]);
  s.phase = 'live';
  hud.update(s, 'webgl2');
  assert.equal(doc.els.call.hidden, true);
  assert.equal(doc.els.announce.textContent, "Travelling. Opponent's ball");
});

test('a score after a call is announced as the score', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  s.phase = 'dead'; s.call = { kind: 'travel', team: 0, ball: 1, number: null, shots: 0 };
  hud.update(s, 'webgl2');
  s.phase = 'live'; s.score = [2, 0];
  hud.update(s, 'webgl2');
  assert.equal(doc.els.announce.textContent, 'You 2, opponent 0');
});

test('the free-throw box shows which attempt it is and where the marker is', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  s.phase = 'freeThrow'; s.freeThrow = { shooter: 0, left: 1, total: 2, stage: 'aim', meter: 0.25 };
  hud.update(s, 'webgl2');
  assert.deepEqual([doc.els.ftBox.hidden, doc.els.ftBar.hidden, doc.els.ftText.textContent, doc.els.ftMarker.style.left], [false, false, 'Free throw 2 of 2', '25%']);
  s.freeThrow.shooter = 3;                               // the computer shoots: no meter
  hud.update(s, 'webgl2');
  assert.equal(doc.els.ftBar.hidden, true);
  s.phase = 'live'; s.freeThrow = null;
  hud.update(s, 'webgl2');
  assert.equal(doc.els.ftBox.hidden, true);
});

test('the pause screen lists your five with where they are, their fouls and what is queued', () => {
  const s = createMatch(); s.rosters[0][3].fouls = 3; s.rosters[0][1].fouls = 1;
  assert.equal(rosterLine(s, 0, false), '1 · No. 4 · on court · 0 fouls');
  assert.equal(rosterLine(s, 1, true), '2 · No. 7 · on court · 1 foul · selected');
  assert.equal(rosterLine(s, 3, false), '4 · No. 15 · fouled out');
  assert.equal(rosterLine(s, 4, false), '5 · No. 23 · bench · 0 fouls');
  assert.equal(subNote(s), 'Automatic substitutions on. No swap queued.');
  s.autoSubs[0] = false; s.subQueue = [{ team: 0, out: 1, in: 4 }];
  assert.equal(subNote(s), 'Automatic substitutions off. Queued: No. 7 off, No. 23 on.');
});

test('the pause screen is filled in with the roster, energy and the selected row', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  s.rosters[0][4].energy = 0.5;
  hud.update(s, 'webgl2', { paused: true, pick: 4 });
  assert.deepEqual([doc.els.roster4.textContent, doc.els.rosterEnergy4.value, doc.els.subNote.textContent],
    ['5 · No. 23 · bench · 0 fouls · selected', 0.5, 'Automatic substitutions on. No swap queued.']);
});

test('the page has every element the scoreboard writes to', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['fouls0', 'fouls1', 'energy', 'call', 'ftBox', 'ftText', 'ftBar', 'ftMarker', 'subNote',
    ...[0, 1, 2, 3, 4].flatMap(i => [`roster${i}`, `rosterEnergy${i}`])]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /F hold ball/);
});

test('the corner label shows the renderer and the frame rate', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  hud.update(s, 'webgpu', { paused: false, pick: null, fps: 58.6 });
  assert.equal(doc.els.backend.textContent, 'WebGPU · 59 fps');
  hud.update(s, 'webgl2', { paused: false, pick: null, fps: 30 });
  assert.equal(doc.els.backend.textContent, 'WebGL 2 (WebGPU not available) · 30 fps');
  hud.update(s, 'webgl2');
  assert.equal(doc.els.backend.textContent, 'WebGL 2 (WebGPU not available)');
});

test('the corner label names the quality level between the renderer and the frame rate', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  hud.update(s, 'webgpu', { paused: false, pick: null, fps: 59.6, quality: 'high' });
  assert.equal(doc.els.backend.textContent, 'WebGPU · High · 60 fps');
  hud.update(s, 'webgl2', { paused: true, pick: null, fps: 24.2, quality: 'low' });
  assert.equal(doc.els.backend.textContent, 'WebGL 2 (WebGPU not available) · Low · 24 fps');
});

test('the controls line says which key changes the quality', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html.match(/<div id="controls">([^<]*)<\/div>/)[1], /· G quality$/);
});

test('the frame-rate readout follows the time frames really take, not the average of their rates', () => {
  let ms = 1000 / 60;
  for (let i = 0; i < 400; i++) ms = easeFrame(ms, i % 2 ? 66 : 16);
  assert.ok(Math.abs(1000 / ms - 1000 / 41) < 1.5, `${1000 / ms} frames a second`);   // 16 ms and 66 ms in turn is 24 frames a second, not 37
});

test('the shot meter is drawn beside the shooter: how full, the band, the level, and after the release a tick or a word', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els;
  const show = meter => hud.update(s, 'webgl2', { paused: false, pick: null, meter });
  const live = { fill: 0.5, band: { from: 0.8, to: 1 }, level: 'Guarded', frozen: null, head: { x: 402.2, y: 290.4 } };
  show(live);
  assert.deepEqual([e.shotMeter.hidden, e.shotMeter.style.left, e.shotMeter.style.top], [false, '402px', '290px']);
  assert.deepEqual([e.shotFill.style.height, e.shotBand.hidden, e.shotBand.style.height, e.shotLabel.textContent, e.shotMark.hidden, e.shotMeter.className],
    ['50%', false, '20%', 'Guarded', true, '']);
  show({ ...live, fill: 0.97, frozen: { verdict: 'green', blocked: false } });
  assert.deepEqual([e.shotFill.style.height, e.shotMark.hidden, e.shotMark.textContent, e.shotMeter.className], ['97%', false, '\u2713', 'green']);
  show({ ...live, frozen: { verdict: 'early', blocked: false } });
  assert.deepEqual([e.shotMark.textContent, e.shotMeter.className], ['Early', '']);
  show({ ...live, frozen: { verdict: 'late', blocked: false } });
  assert.equal(e.shotMark.textContent, 'Late');
  show({ ...live, fill: 0.97, frozen: { verdict: 'green', blocked: true } });
  assert.deepEqual([e.shotMark.textContent, e.shotMeter.className], ['Blocked', '']);            // a block is never shown as a make
  show({ ...live, band: null, level: 'Open' });
  assert.deepEqual([e.shotBand.hidden, e.shotLabel.textContent, e.shotMark.hidden], [true, 'Open', true]);
  show(null);
  assert.equal(e.shotMeter.hidden, true);
  hud.update(s, 'webgl2');
  assert.equal(e.shotMeter.hidden, true);
});

test('the page has the shot meter, and it is not announced', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['shotMeter', 'shotBar', 'shotBand', 'shotFill', 'shotMark', 'shotLabel']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /<div id="shotMeter"[^>]*aria-hidden="true"/);
});

test('the shot meter is sized to be read: 14% of the window high and never under 90 px, its band never under 3 px', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /#shotMeter \{[^}]*--tall: max\(90px, 14vh\)/);
  assert.match(html, /#shotBar \{[^}]*height: var\(--tall\)/);
  assert.match(html, /#shotBand \{[^}]*min-height: 3px/);
});
