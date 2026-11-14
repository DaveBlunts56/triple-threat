import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { periodLabel, clockText, createHud, callText, rosterLine, subNote, easeFrame, menuText } from '../src/render/hud.js';
import { createMatch } from '../src/sim/state.js';
import { createPauseMenu, pauseKey } from '../src/pause.js';
import { createMenu, menuKey } from '../src/menu.js';

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
  assert.equal(callText(call('reach', 1, { number: 8, name: 'Luca Reyes' })), 'Reach-in foul on Reyes (8). Your ball');
  assert.equal(callText(call('block', 1, { number: 8, name: 'Luca Reyes', shots: 2 })), 'Blocking foul on Reyes (8). Two shots');
  assert.equal(callText(call('shooting', 0, { number: 7, name: 'Theo Marsh', shots: 1 })), 'Shooting foul on Marsh (7). One shot');
  assert.equal(callText(call('shooting', 0, { number: 7, name: 'Theo Marsh', shots: 3 })), 'Shooting foul on Marsh (7). Three shots');
  assert.equal(callText(call('charge', 0, { number: 4, name: 'Jalen Cross' })), "Charge on Cross (4). Opponent's ball");
  assert.equal(callText(call('reach', 1, { number: 8 })), 'Reach-in foul on 8. Your ball');   // a number with no name
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

test('the pause screen lists your eight with where they are, their fouls and what is queued', () => {
  const s = createMatch(); s.rosters[0][3].fouls = 3; s.rosters[0][1].fouls = 1;
  assert.equal(rosterLine(s, 0, false), '1 · PG · Jalen Cross · No. 4 · on court · 0 fouls');
  assert.equal(rosterLine(s, 1, true), '2 · SF · Theo Marsh · No. 7 · on court · 1 foul · selected');
  assert.equal(rosterLine(s, 3, false), '4 · SG · Sam Okoro · No. 15 · fouled out');
  assert.equal(rosterLine(s, 4, false), '5 · PF · Andre Volkov · No. 23 · bench · 0 fouls');
  assert.equal(subNote(s), 'Automatic substitutions on. No swap queued.');
  s.autoSubs[0] = false; s.subQueue = [{ team: 0, out: 1, in: 4 }];
  assert.equal(subNote(s), 'Automatic substitutions off. Queued: Marsh off, Volkov on.');
});

test('the pause screen is filled in with the roster, energy and the selected row', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  s.rosters[0][4].energy = 0.5;
  hud.update(s, 'webgl2', { paused: true, pick: 4 });
  assert.deepEqual([doc.els.roster4.textContent, doc.els.rosterEnergy4.value, doc.els.subNote.textContent],
    ['5 · PF · Andre Volkov · No. 23 · bench · 0 fouls · selected', 0.5, 'Automatic substitutions on. No swap queued.']);
});

test('a label names the player you control: surname, position, number', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  hud.update(s, 'webgl2');
  assert.equal(doc.els.who.textContent, 'Cross · PG · 4');
  s.controlled = 2;
  hud.update(s, 'webgl2');
  assert.equal(doc.els.who.textContent, 'Stone · C · 11');
});

test('the page has every element the scoreboard writes to', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['fouls0', 'fouls1', 'energy', 'who', 'nameTag', 'call', 'ftBox', 'ftText', 'ftBar', 'ftMarker', 'subNote',
    ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap(i => [`roster${i}`, `rosterEnergy${i}`])]) assert.match(html, new RegExp(`id="${id}"`), id);
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

test('the controls line says which keys change the quality and the camera', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html.match(/<div id="controls">([^<]*)<\/div>/)[1], /· G quality · C camera$/);
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
  show({ ...live, band: null, frozen: { verdict: 'range', blocked: false } });
  assert.equal(e.shotMark.textContent, 'Out of range');
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

test('the start menu shows its rows with the bar on the selected one, and announces it', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els, menu = createMenu();
  const show = () => hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality: 'high' });
  show();
  assert.deepEqual([0, 1, 2, 3, 4].map(i => e[`menuRow${i}`].textContent), ['Play', 'Mode: 3 on 3', 'Teams', 'Controls', 'Settings']);
  assert.deepEqual([0, 1, 2, 3, 4].map(i => e[`menuRow${i}`].ariaSelected), ['true', 'false', 'false', 'false', 'false']);
  assert.deepEqual([e.menuTeams.hidden, e.menuControls.hidden, e.menuHint.textContent, e.announce.textContent],
    [true, true, '↑ ↓ choose · Enter select', 'Play']);
  menuKey(menu, 'ArrowDown'); show();
  assert.deepEqual([e.menuRow0.ariaSelected, e.menuRow1.ariaSelected, e.announce.textContent], ['false', 'true', 'Mode: 3 on 3']);
  menuKey(menu, 'Enter'); show();                                                       // the mode changes, and says so
  assert.deepEqual([e.menuRow1.textContent, e.announce.textContent], ['Mode: 5 on 5', 'Mode: 5 on 5']);
});

test('the Teams panel lists both teams by position, number and name', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els, menu = createMenu();
  let said = '', writes = 0;                                                            // the live region counts what is written to it
  e.announce = { hidden: false, style: {}, get textContent() { return said; }, set textContent(v) { said = v; writes++; } };
  const show = () => hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality: 'high' });
  menuKey(menu, 'ArrowDown'); menuKey(menu, 'ArrowDown'); show();
  assert.equal(e.announce.textContent, 'Teams');
  const moved = writes;
  menuKey(menu, 'Enter'); show();
  assert.deepEqual([e.menuTeams.hidden, e.menuControls.hidden, e.menuHint.textContent, e.announce.textContent], [false, true, 'Esc back', 'Teams']);
  assert.equal(writes, moved + 1, 'opening the panel is announced, though in the same words as the bar');
  assert.ok([0, 1, 2, 3, 4].every(i => e[`menuRow${i}`].hidden));
  assert.deepEqual([e.teamName0.textContent, e.teamName1.textContent], ['Harbor City Waves', 'Red Rock Scorpions']);
  assert.deepEqual([e.teamPlayer00.textContent, e.teamPlayer04.textContent, e.teamPlayer12.textContent, e.teamPlayer07.textContent, e.teamPlayer15.textContent],
    ['PG · 4 · Jalen Cross', 'PF · 23 · Andre Volkov', 'C · 10 · Viktor Lund', 'C · 32 · Idris Kane', 'PG · 2 · Rafael Ortiz']);
  menuKey(menu, 'Escape'); show();
  assert.deepEqual([e.menuTeams.hidden, e.announce.textContent, writes], [true, 'Teams', moved + 2]);   // closing it too
  show();
  assert.equal(writes, moved + 2);                                                      // and only on the frame the panel changes
});

test('the Settings panel shows each setting with its value, and a change is announced', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els, menu = createMenu();
  const show = quality => hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality });
  menu.row = 4; menuKey(menu, 'Enter'); show('high');
  assert.deepEqual([e.menuRow0.textContent, e.menuRow1.textContent, e.menuRow2.textContent, e.menuRow3.textContent, e.menuRow4.hidden, e.menuHint.textContent],
    ['Quality: High', 'Automatic substitutions: On', 'Camera: 2K', 'Difficulty: All-Star', true, '↑ ↓ choose · Enter change · Esc back']);
  hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality: 'high', camera: 'broadcast' });
  assert.equal(e.menuRow2.textContent, 'Camera: Broadcast');
  show('low');
  assert.deepEqual([e.menuRow0.textContent, e.announce.textContent], ['Quality: Low', 'Quality: Low']);
  menuKey(menu, 'ArrowDown'); menuKey(menu, 'Enter'); show('low');
  assert.deepEqual([e.menuRow1.textContent, e.announce.textContent], ['Automatic substitutions: Off', 'Automatic substitutions: Off']);
  assert.equal(menuText(menu, 0, 'high'), 'Quality: High');
});

test('in play the menu writes nothing and the score is announced as before', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), menu = createMenu();
  s.phase = 'live'; s.score = [2, 0];
  hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality: 'high' });
  assert.equal(doc.els.announce.textContent, 'You 2, opponent 0');
  assert.equal(doc.els.menuRow0, undefined);
});

test('the page has the menu: four rows, both panels, ten players, every key in the controls panel, and a ring that stops for reduced motion', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['menuList', 'menuRow0', 'menuRow1', 'menuRow2', 'menuRow3', 'menuRow4', 'menuTeams', 'menuControls', 'menuHint', 'teamName0', 'teamName1',
    ...[0, 1].flatMap(t => [0, 1, 2, 3, 4, 5, 6, 7].map(i => `teamPlayer${t}${i}`))]) assert.match(html, new RegExp(`id="${id}"`), id);
  const controls = html.match(/id="menuControls"[\s\S]*?<\/(?:ul|dl|div)>/)[0];
  for (const word of ['WASD', 'Shift', 'Space', 'E', 'Q', 'F', 'Esc', 'G']) assert.match(controls, new RegExp(`\\b${word}\\b`), word);
  assert.match(html, /prefers-reduced-motion/);
  assert.doesNotMatch(html, /Press Enter to play</);
  assert.equal((html.match(/<[^>]*aria-live[^>]*>/g) ?? []).length, 1);                // still one live region
});

test('the surname of the player you control is drawn under him, where the page is told his feet are', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els;
  s.phase = 'live';
  hud.update(s, 'webgl2', { paused: false, pick: null, feet: { x: 400.4, y: 300.6 } });
  assert.deepEqual([e.nameTag.hidden, e.nameTag.textContent, e.nameTag.style.left, e.nameTag.style.top], [false, 'Cross', '400px', '301px']);
  s.controlled = 2;
  hud.update(s, 'webgl2', { paused: false, pick: null, feet: { x: 10, y: 20 } });
  assert.deepEqual([e.nameTag.textContent, e.nameTag.style.left, e.nameTag.style.top], ['Stone', '10px', '20px']);
  hud.update(s, 'webgl2');                                                // no place given: nothing to draw it under
  assert.equal(e.nameTag.hidden, true);
});

// A paused match and what draws it.
function pausedHud() {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  s.phase = 'live';
  const game = { state: s, paused: true, pick: null, pauseMenu: createPauseMenu(), quality: 'high' };
  return { e: doc.els, s, game, show: () => hud.update(s, 'webgl2', game), choose: (...codes) => codes.forEach(code => pauseKey(game, code)) };
}
const PAUSE_ROWS = [0, 1, 2, 3, 4];

test('the pause menu shows its five buttons with the highlight on one, and says which', () => {
  const { e, show, choose } = pausedHud();
  show();
  assert.deepEqual(PAUSE_ROWS.map(i => e[`pauseRow${i}`].textContent), ['Resume', 'Substitutions', 'Controls', 'Settings', 'Quit to main menu']);
  assert.deepEqual(PAUSE_ROWS.map(i => e[`pauseRow${i}`].ariaSelected), ['true', 'false', 'false', 'false', 'false']);
  assert.deepEqual([e.pauseList.hidden, e.pauseSubs.hidden, e.pauseControls.hidden, e.pauseAsk.hidden, e.pauseHint.textContent, e.announce.textContent],
    [false, true, true, true, '↑ ↓ choose · Enter select · Esc resume', 'Resume']);
  choose('ArrowDown'); show();
  assert.deepEqual([e.pauseRow0.ariaSelected, e.pauseRow1.ariaSelected, e.announce.textContent], ['false', 'true', 'Substitutions']);
});

test('Substitutions and Controls open in place of the buttons, and opening one is announced', () => {
  const { e, show, choose } = pausedHud();
  let writes = 0;
  Object.defineProperty(e.announce ??= { hidden: false, style: {} }, 'textContent', { get() { return this.said; }, set(v) { this.said = v; writes++; } });
  choose('ArrowDown'); show();
  const before = writes;
  choose('Enter'); show();
  assert.deepEqual([e.pauseList.hidden, e.pauseSubs.hidden, e.pauseControls.hidden, e.pauseHint.textContent, e.announce.textContent, writes - before],
    [true, false, true, '1 to 8 swap two players · A automatic substitutions · Esc back', 'Substitutions', 1]);
  choose('Escape', 'ArrowDown', 'Enter'); show();
  assert.deepEqual([e.pauseSubs.hidden, e.pauseControls.hidden, e.pauseHint.textContent, e.announce.textContent], [true, false, 'Esc back', 'Controls']);
});

test('Settings shows each setting with its value, and Quit asks before leaving', () => {
  const { e, s, game, show, choose } = pausedHud();
  choose('ArrowUp', 'ArrowUp', 'Enter'); show();                           // up from Resume wraps to Quit, then Settings
  assert.deepEqual([e.pauseRow0.textContent, e.pauseRow1.textContent, e.pauseRow2.textContent, e.pauseRow3.textContent, e.pauseRow4.hidden, e.pauseHint.textContent],
    ['Quality: High', 'Automatic substitutions: On', 'Camera: 2K', 'Difficulty: All-Star', true, '↑ ↓ choose · Enter change · Esc back']);
  s.autoSubs[0] = false; game.quality = 'low'; show();
  assert.deepEqual([e.pauseRow0.textContent, e.pauseRow1.textContent], ['Quality: Low', 'Automatic substitutions: Off']);
  choose('Escape', 'ArrowDown', 'Enter'); show();
  assert.deepEqual([e.pauseAsk.hidden, e.pauseRow0.textContent, e.pauseRow1.textContent, e.pauseRow2.hidden, e.pauseRow0.ariaSelected, e.pauseHint.textContent],
    [false, 'No, keep playing', 'Yes, quit', true, 'true', '↑ ↓ choose · Enter select · Esc back']);
});

test('the pause scoreboard shows each team by quarter, its total and fouls, and the clocks', () => {
  const { e, s, show } = pausedHud();
  Object.assign(s, { quarter: 3, byQuarter: [[12, 9, 7], [8, 14]], score: [28, 22], teamFouls: [3, 4], gameClock: 101.2, shotClock: 13.2 });
  show();
  assert.deepEqual([e.pbAbbr0.textContent, e.pbAbbr1.textContent], ['WAV', 'SCO']);
  assert.deepEqual([0, 1, 2, 3].map(q => e[`pbQ0${q}`].textContent), ['12', '9', '7', '–']);
  assert.deepEqual([0, 1, 2, 3].map(q => e[`pbQ1${q}`].textContent), ['8', '14', '0', '–']);   // nothing scored yet this quarter
  assert.deepEqual([e.pbQ02.className, e.pbQ12.className, e.pbQ00.className], ['live', 'live', '']);
  assert.deepEqual([e.pbTotal0.textContent, e.pbTotal1.textContent, e.pbFouls0.textContent, e.pbFouls1.textContent], ['28', '22', '3', '4']);
  assert.deepEqual([e.pbPeriod.textContent, e.pbClock.textContent, e.pbShot.textContent], ['3RD', '1:42', 'SHOT 14']);
  assert.deepEqual([e.pbOtHead.hidden, e.pbOt0.hidden, e.pbOt1.hidden], [true, true, true]);
  Object.assign(s, { quarter: 6, byQuarter: [[12, 9, 7, 4, 3, 2], [8, 14, 6, 4, 3]] });
  show();
  assert.deepEqual([e.pbOtHead.hidden, e.pbOt0.textContent, e.pbOt1.textContent, e.pbPeriod.textContent, e.pbQ03.className], [false, '5', '3', 'OT2', '']);
});

test('in play the pause menu writes nothing', () => {
  const { e, game, show } = pausedHud();
  game.paused = false; show();
  assert.deepEqual([e.pauseRow0, e.pbTotal0], [undefined, undefined]);
});

test('the page has the pause menu: five buttons, three panels, the scoreboard, the PAUSED bar and the game\'s mark', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['pauseList', ...PAUSE_ROWS.map(i => `pauseRow${i}`), 'pauseSubs', 'pauseControls', 'pauseAsk', 'pauseHint', 'pbOtHead', 'pbPeriod', 'pbClock', 'pbShot',
    ...[0, 1].flatMap(t => [`pbAbbr${t}`, `pbTotal${t}`, `pbFouls${t}`, `pbOt${t}`, ...[0, 1, 2, 3].map(q => `pbQ${t}${q}`)])]) assert.match(html, new RegExp(`id="${id}"`), id);
  const pause = html.match(/<section class="screen" id="screenPause"[\s\S]*?<\/section>/)[0];
  assert.match(pause, />PAUSED</);
  for (const id of ['roster0', 'roster4', 'rosterEnergy0', 'subNote']) assert.match(pause, new RegExp(`id="${id}"`), id);   // Substitutions keeps the swap list
  const controls = pause.match(/id="pauseControls"[\s\S]*?<\/(?:ul|dl|div)>/)[0];
  for (const word of ['WASD', 'Shift', 'Space', 'E', 'Q', 'F', 'Esc', 'G']) assert.match(controls, new RegExp(`\\b${word}\\b`), word);
  assert.equal((html.match(/<[^>]*aria-live[^>]*>/g) ?? []).length, 1);
});

test('the corner label says which effects this browser could not run', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  hud.update(s, 'webgl2', { paused: false, pick: null, fps: 58.2, quality: 'high', missing: ['ambient occlusion', 'bloom'] });
  assert.equal(doc.els.backend.textContent, 'WebGL 2 (WebGPU not available) · High · no ambient occlusion · no bloom · 58 fps');
  hud.update(s, 'webgl2', { paused: false, pick: null, fps: 58.2, quality: 'high', missing: [] });
  assert.equal(doc.els.backend.textContent, 'WebGL 2 (WebGPU not available) · High · 58 fps');
});

test('the corner label can say how long the slowest frame of the last second took', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  hud.update(s, 'webgpu', { paused: false, pick: null, fps: 59.6, quality: 'high', worst: 21.4 });
  assert.equal(doc.els.backend.textContent, 'WebGPU · High · 60 fps · slowest frame 21 ms');
  hud.update(s, 'webgpu', { paused: false, pick: null, fps: 59.6, quality: 'high' });
  assert.equal(doc.els.backend.textContent, 'WebGPU · High · 60 fps');
});

test('the corner label tells WebGL 2 chosen by the game from WebGL 2 as the only thing the browser has', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  hud.update(s, 'webgl2', { paused: false, pick: null, fps: 60, quality: 'high' });
  assert.equal(doc.els.backend.textContent, 'WebGL 2 (WebGPU not available) · High · 60 fps');
  hud.update(s, 'webgl2chosen', { paused: false, pick: null, fps: 60, quality: 'high' });
  assert.equal(doc.els.backend.textContent, 'WebGL 2 · High · 60 fps');
});

test('the pause list has a line for each of your eight, the bench of five a side among them', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(1, 5);
  s.phase = 'live';
  hud.update(s, 'webgl2', { paused: true, pick: 6 });
  assert.equal(rosterLine(s, 4, false), '5 · PF · Andre Volkov · No. 23 · on court · 0 fouls');
  assert.deepEqual([doc.els.roster5.textContent, doc.els.roster6.textContent, doc.els.roster7.textContent],
    ['6 · PG · Marcus Bell · No. 1 · bench · 0 fouls', '7 · SF · Noah Vance · No. 13 · bench · 0 fouls · selected', '8 · C · Idris Kane · No. 32 · bench · 0 fouls']);
});
