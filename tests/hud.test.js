import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { periodLabel, clockText, createHud, callText, teamColours, rosterLine, subNote, easeFrame, menuText, keysText, controlsLines, hintLine,
  BOX_HEAD, boxRow, boxTotal, lineupRow, periodLines, halfLines, potgLine, RESULT_HEAD, advancedLines } from '../src/render/hud.js';
import { DEFAULT_PREFS } from '../src/prefs.js';
import { DEFAULT_KEYS, KEY_ROWS, bind, createKeys } from '../src/keys.js';
import { createMatch } from '../src/sim/state.js';
import { createPauseMenu, pauseKey } from '../src/pause.js';
import { MENU, createMenu, menuKey } from '../src/menu.js';
import { quickMatch } from '../src/sim/quick/engine.js';
import { surname } from '../src/sim/state.js';
import { TEAMS } from '../src/sim/teams.js';

const keys = (menu, ...codes) => codes.forEach(code => menuKey(menu, code));

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
  assert.equal(rosterLine(s, 0, false), '1 · PG · Jalen Cross · No. 4 · Playmaker 88 · on court · 0 fouls');
  assert.equal(rosterLine(s, 1, true), '2 · SF · Theo Marsh · No. 7 · Slasher 82 · on court · 1 foul · selected');
  assert.equal(rosterLine(s, 3, false), '4 · SG · Sam Okoro · No. 15 · Sharpshooter 83 · fouled out');
  assert.equal(rosterLine(s, 4, false), '5 · PF · Andre Volkov · No. 23 · Stretch big 80 · bench · 0 fouls');
  assert.equal(subNote(s), 'Automatic substitutions on. No swap queued.');
  s.autoSubs[0] = false; s.subQueue = [{ team: 0, out: 1, in: 4 }];
  assert.equal(subNote(s), 'Automatic substitutions off. Queued: Marsh off, Volkov on.');
});

test('the pause screen is filled in with the roster, energy and the selected row', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  s.rosters[0][4].energy = 0.5;
  hud.update(s, 'webgl2', { paused: true, pick: 4 });
  assert.deepEqual([doc.els.roster4.textContent, doc.els.rosterEnergy4.value, doc.els.subNote.textContent],
    ['5 · PF · Andre Volkov · No. 23 · Stretch big 80 · bench · 0 fouls · selected', 0.5, 'Automatic substitutions on. No swap queued.']);
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
  assert.match(html, /id="controls"/);
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

test('the controls line says which keys change the quality and the camera and open the play list', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  hud.update(s, 'webgl2', { paused: false, pick: null });
  assert.equal(doc.els.controls.textContent, 'W A S D move · Shift sprint · Space shoot / jump · E pass / switch · Q steal · F hold ball · J K L I U moves · R dunk · Esc pause · G quality · C camera · T plays · Z timeout');
  assert.equal(hintLine(DEFAULT_KEYS), doc.els.controls.textContent);
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
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => e[`menuRow${i}`].textContent), ['Exhibition', 'Simulate', 'Mode: 3 on 3', 'Teams', 'Controls', 'Settings']);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => e[`menuRow${i}`].ariaSelected), ['true', 'false', 'false', 'false', 'false', 'false']);
  assert.deepEqual([e.menuTeams.hidden, e.menuControls.hidden, e.menuHint.textContent, e.announce.textContent],
    [true, true, '↑ ↓ choose · Enter select', 'Exhibition']);
  keys(menu, 'ArrowDown', 'ArrowDown'); show();
  assert.deepEqual([e.menuRow0.ariaSelected, e.menuRow2.ariaSelected, e.announce.textContent], ['false', 'true', 'Mode: 3 on 3']);
  menuKey(menu, 'Enter'); show();                                                       // the mode changes, and says so
  assert.deepEqual([e.menuRow2.textContent, e.announce.textContent], ['Mode: 5 on 5', 'Mode: 5 on 5']);
});

test('Team Select shows each side\'s city, nickname and overall in its colours, where your controller is, and says the choice', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els, menu = createMenu();
  const show = () => hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality: 'high' });
  menuKey(menu, 'Enter'); show();
  assert.deepEqual([e.selCity0.textContent, e.selName0.textContent, e.selCity1.textContent, e.selName1.textContent],
    ['Boston', 'Shamrocks', 'New York', 'Empire']);
  assert.match(e.selOvr0.textContent, /^OVR \d\d$/);
  const [boston, newYork] = [teamColours(TEAMS[3]), teamColours(TEAMS[2])];
  assert.deepEqual([e.selName1.style.color, e.selTeam0.style.borderColor, e.selectPads.className, e.selectWatch.hidden], [newYork.ink, boston.bar, 'pads at-home', true]);
  assert.equal(e.announce.textContent, 'Away: Boston Shamrocks. Home: New York Empire. You play New York Empire.');
  keys(menu, 'ArrowLeft'); show();
  assert.deepEqual([e.selectPads.className, e.selectWatch.hidden, e.announce.textContent], ['pads at-none', false, 'Away: Boston Shamrocks. Home: New York Empire. You watch.']);
  // On a link ending #dev, the Waves at home to the Scorpions, in their own colours.
  const dev = createMenu({ ...DEFAULT_PREFS, select: { away: 1, home: 0, side: 'home' } }, true);
  menuKey(dev, 'Enter'); hud.update(s, 'webgl2', { paused: false, pick: null, menu: dev, quality: 'high' });
  assert.deepEqual([e.selName0.textContent, e.selName1.textContent, e.selName1.style.color, e.selTeam0.style.borderColor], ['Scorpions', 'Waves', '#a9c8ff', '#ff5a5a']);
  assert.ok(!readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/id="screenSelect"[^>]*>/)[0].includes('aria-live'));
});

test('the Teams panel lists both teams by overall, name and role, with each team\'s star marked', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els, menu = createMenu();
  let said = '', writes = 0;                                                            // the live region counts what is written to it
  e.announce = { hidden: false, style: {}, get textContent() { return said; }, set textContent(v) { said = v; writes++; } };
  const show = () => hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality: 'high' });
  menu.row = MENU.main.indexOf('teams'); show();
  assert.equal(e.announce.textContent, 'Teams');
  const moved = writes;
  menuKey(menu, 'Enter'); show();
  assert.deepEqual([e.menuTeams.hidden, e.menuControls.hidden, e.menuHint.textContent, e.announce.textContent], [false, true, 'Esc back', 'Teams']);
  assert.equal(writes, moved + 1, 'opening the panel is announced, though in the same words as the bar');
  assert.ok([0, 1, 2, 3, 4, 5, 6].every(i => e[`menuRow${i}`].hidden));
  assert.deepEqual([e.teamName0.textContent, e.teamName1.textContent], ['Harbor City Waves', 'Red Rock Scorpions']);
  assert.deepEqual([e.teamPlayer00.textContent, e.teamPlayer04.textContent, e.teamPlayer12.textContent, e.teamPlayer07.textContent, e.teamPlayer15.textContent],
    ['88 · Jalen Cross ★ · Playmaker', '80 · Andre Volkov · Stretch big', '83 · Viktor Lund · Post scorer', '76 · Idris Kane · Rebounder', '78 · Rafael Ortiz · Lockdown guard']);
  for (const team of [0, 1]) assert.equal([0, 1, 2, 3, 4, 5, 6, 7].filter(row => e[`teamPlayer${team}${row}`].textContent.includes('★')).length, 1, 'one star a team');
  assert.equal(e.teamPlayer10.textContent, '89 · Kai Mercer ★ · Shot creator');
  menuKey(menu, 'Escape'); show();
  assert.deepEqual([e.menuTeams.hidden, e.announce.textContent, writes], [true, 'Teams', moved + 2]);   // closing it too
  show();
  assert.equal(writes, moved + 2);                                                      // and only on the frame the panel changes
});

test('the Settings panel shows each setting with its value, and a change is announced', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els, menu = createMenu();
  const show = quality => hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality });
  menu.row = MENU.main.indexOf('settings'); menuKey(menu, 'Enter'); show('high');
  assert.deepEqual([e.menuRow0.textContent, e.menuRow1.textContent, e.menuRow2.textContent, e.menuRow3.textContent, e.menuRow4.textContent, e.menuHint.textContent],
    ['Quality: High', 'Automatic substitutions: On', 'Camera: 2K', 'Difficulty: All-Star', 'Game styles ▸', '↑ ↓ choose · Enter change · Esc back']);
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
  for (let i = 0; i < 11; i++) for (const id of [`ctlK${i}`, `ctlW${i}`]) assert.match(controls, new RegExp(`id="${id}"`), id);   // a line for each of controlsLines
  for (let i = 5; i < 9; i++) assert.match(html, new RegExp(`id="menuRow${i}"`));   // room for nine settings
  for (let i = 0; i < 19; i++) assert.match(html, new RegExp(`id="keyRow${i}"`));   // the Keys panel
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
function pausedHud(teams = [0, 1]) {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(1, 3, teams);
  s.phase = 'live';
  const game = { state: s, paused: true, pick: null, pauseMenu: createPauseMenu(), quality: 'high' };
  return { e: doc.els, s, game, show: () => hud.update(s, 'webgl2', game), choose: (...codes) => codes.forEach(code => pauseKey(game, code)) };
}
const PAUSE_ROWS = [0, 1, 2, 3, 4, 5];

test('the pause menu shows its six buttons with the highlight on one, and says which', () => {
  const { e, show, choose } = pausedHud();
  show();
  assert.deepEqual(PAUSE_ROWS.map(i => e[`pauseRow${i}`].textContent), ['Resume', 'Substitutions', 'Box score', 'Controls', 'Settings', 'Quit to main menu']);
  assert.deepEqual(PAUSE_ROWS.map(i => e[`pauseRow${i}`].ariaSelected), ['true', 'false', 'false', 'false', 'false', 'false']);
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
  assert.deepEqual([e.pauseSubs.hidden, e.boxScore.hidden, e.pauseHint.textContent, e.announce.textContent], [true, false, 'Esc back', 'Box score']);
  choose('Escape', 'ArrowDown', 'Enter'); show();
  assert.deepEqual([e.boxScore.hidden, e.pauseControls.hidden, e.pauseHint.textContent, e.announce.textContent], [true, false, 'Esc back', 'Controls']);
  // A team of ten swaps with 1 to 9 and 0.
  const league = pausedHud([2, 3]);
  league.choose('ArrowDown', 'Enter'); league.show();
  assert.equal(league.e.pauseHint.textContent, '1 to 9 and 0 swap two players · A automatic substitutions · Esc back');
});

test('Settings shows each setting with its value, and Quit asks before leaving', () => {
  const { e, s, game, show, choose } = pausedHud();
  choose('ArrowUp', 'ArrowUp', 'Enter'); show();                           // up from Resume wraps to Quit, then Settings
  assert.deepEqual([e.pauseRow0.textContent, e.pauseRow1.textContent, e.pauseRow2.textContent, e.pauseRow3.textContent, e.pauseRow4.textContent, e.pauseRow5.textContent, e.pauseRow6.textContent, e.pauseRow7.textContent, e.pauseRow8.textContent, e.pauseRow8.hidden, e.pauseHint.textContent],
    ['Quality: High', 'Automatic substitutions: On', 'Camera: 2K', 'Difficulty: All-Star', 'Commentary: Voice and captions', 'Replays: On', 'Sound: Full', 'FPS and controls: Shown', 'Keys', false, '↑ ↓ choose · Enter change · Esc back']);
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
  for (let i = 0; i < 11; i++) for (const id of [`pctlK${i}`, `pctlW${i}`]) assert.match(controls, new RegExp(`id="${id}"`), id);
  for (let i = 5; i < 9; i++) assert.match(pause, new RegExp(`id="pauseRow${i}"`));
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
  assert.equal(rosterLine(s, 4, false), '5 · PF · Andre Volkov · No. 23 · Stretch big 80 · on court · 0 fouls');
  assert.deepEqual([doc.els.roster5.textContent, doc.els.roster6.textContent, doc.els.roster7.textContent],
    ['6 · PG · Marcus Bell · No. 1 · Shot creator 78 · bench · 0 fouls', '7 · SF · Noah Vance · No. 13 · Lockdown wing 77 · bench · 0 fouls · selected', '8 · C · Idris Kane · No. 32 · Rebounder 76 · bench · 0 fouls']);
});

// ---------- the scorebug ----------

test('the scorebug names each team, lights the one with the ball, shows its timeouts, and lights its fouls in the bonus', async () => {
  const { FOUL, TIMEOUT } = await import('../src/sim/tuning.js');
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els;
  s.phase = 'live'; s.possession = 1; s.timeouts = [TIMEOUT.each, 1]; s.teamFouls = [FOUL.bonus, 0];
  hud.update(s, 'webgl2');
  assert.deepEqual([e.abbr0.textContent, e.abbr1.textContent], ['WAV', 'SCO']);
  assert.deepEqual([e.bugTeam0.className, e.bugTeam1.className], ['bugTeam home', 'bugTeam away has']);
  assert.deepEqual([e.timeouts0.textContent, e.timeouts1.textContent], ['●●●', '●○○']);
  assert.deepEqual([e.fouls0.className, e.fouls1.className], ['fouls bonus', 'fouls']);
  s.phase = 'final'; hud.update(s, 'webgl2');
  assert.equal(e.bugTeam1.className, 'bugTeam away', 'nobody has the ball once the match is over');
});

test('a score that goes up pops and sweeps a shine across the scorebug, afresh each time; the shot clock flashes in its last seconds', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els;
  s.phase = 'live';
  hud.update(s, 'webgl2');
  assert.deepEqual([e.score0.className, e.hud.className, e.shotClock.className], ['score home', '', '']);
  s.score[0] = 2; hud.update(s, 'webgl2');
  assert.deepEqual([e.score0.className, e.score1.className, e.hud.className], ['score home popA', 'score away', 'shineA']);
  s.score[0] = 5; hud.update(s, 'webgl2');
  assert.deepEqual([e.score0.className, e.hud.className], ['score home popB', 'shineB']);   // another name, so the animation runs again
  s.score[1] = 3; hud.update(s, 'webgl2');
  assert.deepEqual([e.score1.className, e.hud.className], ['score away popA', 'shineA']);
  s.shotClock = 4.2; hud.update(s, 'webgl2');
  assert.equal(e.shotClock.className, 'low');
  s.shotClock = 9; hud.update(s, 'webgl2');
  assert.equal(e.shotClock.className, '');
});

test('the page has the scorebug: a logo, a crest, a name, fouls, timeouts and a score for each team, and the period, the clock and the shot clock', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['hud', 'quarter', 'gameClock', 'shotClock', ...[0, 1].flatMap(t => [`bugTeam${t}`, `abbr${t}`, `fouls${t}`, `timeouts${t}`, `score${t}`])]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /class="bugLogo"/);
  assert.equal((html.match(/<svg id="bugMark[01]" viewBox="0 0 40 40"/g) ?? []).length, 2, 'a crest for each team');
});

test('each side\'s crest and colours are its team\'s: with the Scorpions first, theirs are on the left', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(1, 3, [1, 0]), e = doc.els;
  hud.update(s, 'webgl2');
  assert.match(e.bugMark0.innerHTML, /#8f1717/);
  assert.match(e.bugMark1.innerHTML, /#1d4fb8/);
  assert.deepEqual([e.abbr0.textContent, e.abbr1.textContent], ['SCO', 'WAV']);
  assert.deepEqual(teamColours(TEAMS[1]), { kit: '#d83a3a', bar: '#ff5a5a', ink: '#ffb0b0' });
  assert.deepEqual(teamColours({ colour: '#000000' }), { kit: '#000000', bar: '#404040', ink: '#999999' }, 'mixed toward white when not given');
});

test('under a player there is a star if he is his team\'s star, a flame if he is hot and an ice cube if he is cold; nothing under anyone else, or outside play', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(1, 5), e = doc.els;
  const spots = s.players.map((_, i) => ({ x: 100 + i * 10, y: 300 }));
  const show = on => hud.update(s, 'webgl2', { paused: false, pick: null, feet: { x: 10, y: 20 }, spots: on ? spots : null });
  s.rosters[0][1].streak = 3; s.rosters[1][2].streak = -3; s.rosters[0][0].streak = 3;
  show(true);
  assert.equal(e.nameTag.textContent, 'Cross');                                   // the name alone: the icons say the rest
  assert.deepEqual([0, 1, 5, 7].map(i => e[`tag${i}`].className), ['tag star hot', 'tag hot', 'tag star', 'tag cold']);
  assert.deepEqual([0, 1, 2, 5, 7].map(i => e[`tag${i}`].hidden), [false, false, true, false, false]);
  assert.deepEqual([e.tag1.style.left, e.tag1.style.top], ['110px', '300px']);
  s.rosters[0][1].streak = 0; show(true);
  assert.equal(e.tag1.hidden, true);
  show(false);
  assert.ok([0, 5, 7].every(i => e[`tag${i}`].hidden), 'icons are shown outside play');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (let i = 0; i < 10; i++) assert.match(html, new RegExp(`id="tag${i}"`));
  for (const kind of ['star', 'hot', 'cold']) assert.match(html, new RegExp(`\\.tag\\.${kind}::`), kind);
});

// ---------- keys ----------

test('a row of the Keys panel says what the key does and the key, or that it waits for one', () => {
  const keys = createKeys(), row = KEY_ROWS.indexOf('cross');
  assert.equal(row, 9);
  assert.equal(keysText(keys, row, { row, listening: false }), 'Crossover: J');
  assert.equal(keysText(keys, row, { row, listening: true }), 'Crossover: press a key…');
  assert.equal(keysText(keys, row, { row: 2, listening: true }), 'Crossover: J');   // another row is the one waiting
  assert.equal(keysText(keys, 19, { row: 19, listening: false }), 'Reset all keys');
  assert.equal(keysText(keys, 4, { row: 0, listening: false }), 'Sprint: Shift');
});

test('the Controls lines and the line under the court show the keys as they are now', () => {
  const keys = createKeys();
  assert.deepEqual(controlsLines(keys)[0], ['W A S D', 'move']);
  assert.equal(controlsLines(keys).length, 12);
  assert.deepEqual(controlsLines(keys)[8], ['R', 'dunk']);
  assert.match(hintLine(keys), / · R dunk · /);
  assert.deepEqual(controlsLines(keys)[6], ['J · K · L', 'crossover · between the legs · behind the back']);
  bind(keys, 'sprint', 'KeyX'); bind(keys, 'up', 'ArrowUp');
  assert.deepEqual(controlsLines(keys).slice(0, 2), [['↑ A S D', 'move'], ['X', 'sprint']]);
  assert.match(hintLine(keys), /^↑ A S D move · X sprint · Space shoot \/ jump/);
});

test('the page shows the Keys panel over the menu that opened it, and the changed keys on Controls', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els, menu = createMenu(), keys = createKeys();
  const show = () => hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality: 'high', keys });
  show();
  assert.equal(e.keyRows.hidden, true);
  menu.row = MENU.main.indexOf('settings'); menuKey(menu, 'Enter', keys); menu.row = MENU.settings.indexOf('keys'); menuKey(menu, 'Enter', keys); show();
  assert.deepEqual([e.keyRows.hidden, e.menuList.hidden, e.keyRow0.textContent, e.keyRow0.ariaSelected, e.keyRow19.textContent, e.announce.textContent],
    [false, true, 'Move up: W', 'true', 'Reset all keys', 'Move up: W']);
  menuKey(menu, 'Enter', keys); show();
  assert.deepEqual([e.keyRow0.textContent, e.keyRow0.className, e.menuHint.textContent], ['Move up: press a key…', 'listening', 'Press the new key · Esc to leave it as it was']);
  menuKey(menu, 'ArrowUp', keys); show();
  assert.deepEqual([e.keyRow0.textContent, e.keyRow0.className, e.ctlK0.textContent, e.pctlK0.textContent, e.ctlW0.textContent], ['Move up: ↑', '', '↑ A S D', '↑ A S D', 'move']);
  menuKey(menu, 'Escape', keys); show();
  assert.deepEqual([e.keyRows.hidden, e.menuList.hidden, e[`menuRow${MENU.settings.indexOf('keys')}`].textContent], [true, false, 'Keys']);
});

// ---------- the broadcast on the page ----------

test('a row of the box score is the player\'s line, with his minutes and plus-minus, and the last row his team\'s', () => {
  const s = createMatch();
  Object.assign(s.rosters[0][0].stats, { pts: 14, fgm: 5, fga: 9, tpm: 2, tpa: 4, ftm: 2, fta: 3, reb: 4, ast: 6, stl: 2, blk: 1, tov: 3 });
  s.rosters[0][0].fouls = 2; s.rosters[0][1].stats.pts = 6; s.rosters[0][1].fouls = 1; s.teamStats[0].tov = 1;
  Object.assign(s.rosters[0][0], { secs: 545, pm: 7 }); Object.assign(s.rosters[0][1], { secs: 300, pm: -3 });
  assert.deepEqual(boxRow(s, 0, 0), ['Cross', '9:05', '14', '5/9', '2/4', '2/3', '4', '6', '2', '1', '3', '2', '+7']);
  assert.deepEqual(boxRow(s, 0, 1).at(-1), '-3');
  assert.deepEqual(boxTotal(s, 0), ['TEAM', '14:05', '20', '5/9', '2/4', '2/3', '4', '6', '2', '1', '4', '3', '']);
  assert.equal(BOX_HEAD.length, boxRow(s, 0, 0).length);
});

test('a line-up row gives position, name, role and overall, with the team\'s star marked', () => {
  const s = createMatch(1, 5);
  assert.equal(lineupRow(s, 0, 0), 'PG · Jalen Cross ★ · Playmaker · 88');
  assert.equal(lineupRow(s, 1, 2), 'C · Viktor Lund · Post scorer · 83');
  assert.equal(lineupRow(createMatch(1, 3), 0, 4), '');               // three a side has no fifth starter
});

test('between periods: each team by period with its total, and each team\'s leading scorer', () => {
  const s = createMatch();
  s.byQuarter = [[12, 15], [10, 14]]; s.score = [27, 24];
  s.rosters[0][3].stats.pts = 11; s.rosters[1][0].stats.pts = 9;
  assert.deepEqual(periodLines(s), ['WAV  12 · 15  —  27', 'SCO  10 · 14  —  24', 'Okoro 11 PTS', 'Mercer 9 PTS']);
});

test('at half-time the teams are side by side, and nothing tried is 0%', () => {
  const s = createMatch();
  Object.assign(s.rosters[0][0].stats, { fgm: 12, fga: 27, tpm: 0, tpa: 0, reb: 14, tov: 3 });
  Object.assign(s.rosters[1][0].stats, { fgm: 10, fga: 25, tpm: 3, tpa: 9, reb: 12, tov: 5 });
  assert.deepEqual(halfLines(s), [['Field goals', '12/27 (44%)', '10/25 (40%)'], ['Threes', '0/0 (0%)', '3/9 (33%)'], ['Rebounds', '14', '12'], ['Turnovers', '3', '5']]);
});

test('the player of the game is named with his line', () => {
  const s = createMatch();
  Object.assign(s.rosters[1][0].stats, { pts: 24, fgm: 9, fga: 15, reb: 6, ast: 5 });
  assert.equal(potgLine(s), 'PLAYER OF THE GAME · Kai Mercer · 24 PTS · 6 REB · 5 AST');
});

test('the page shows the banner, the card, the caption and the panels it is told to, and hides them otherwise', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(1, 5), e = doc.els;
  s.phase = 'live';
  const draw = show => hud.update(s, 'webgl2', { paused: false, pick: null, show });
  draw({});
  assert.deepEqual([e.banner.hidden, e.lower.hidden, e.caption.hidden, e.lineups.hidden, e.between.hidden, e.boxScore.hidden], [true, true, true, true, true, true]);
  draw({ banner: { words: 'AND ONE', name: 'Mercer', team: 1 }, lower: { title: 'Cross', lines: ['Free throws 3/4'] }, caption: 'Mercer scores, and the foul!' });
  assert.deepEqual([e.banner.hidden, e.bannerWords.textContent, e.bannerName.textContent, e.banner.className], [false, 'AND ONE', 'Mercer', 'away']);
  assert.deepEqual([e.lower.hidden, e.lowerTitle.textContent, e.lowerLine.textContent], [false, 'Cross', 'Free throws 3/4']);
  assert.deepEqual([e.caption.hidden, e.caption.textContent], [false, 'Mercer scores, and the foul!']);
  draw({ panel: 'lineups' });
  assert.deepEqual([e.lineups.hidden, e.banner.hidden, e.lineupTeam0.textContent, e.lineup00.textContent, e.lineup14.hidden], [false, true, 'Harbor City Waves', 'PG · Jalen Cross ★ · Playmaker · 88', false]);
  s.byQuarter = [[12, 15], [10, 14]]; s.score = [27, 24]; s.quarter = 2;
  draw({ panel: 'half' });
  assert.deepEqual([e.lineups.hidden, e.between.hidden, e.betweenTitle.textContent, e.betweenLine0.textContent, e.betweenLine4.textContent, e.betweenLine7.hidden],
    [true, false, 'HALF-TIME', 'WAV  12 · 15  —  27', '0/0 (0%)  ·  Field goals  ·  0/0 (0%)', false]);
  s.quarter = 1;
  draw({ panel: 'period' });
  assert.deepEqual([e.betweenTitle.textContent, e.betweenLine3.hidden, e.betweenLine4.hidden], ['END OF 1ST', false, true]);
});

test('three a side shows three starters a team on the line-ups', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(1, 3), e = doc.els;
  s.phase = 'jumpBall';
  hud.update(s, 'webgl2', { paused: false, pick: null, show: { panel: 'lineups' } });
  assert.deepEqual([e.lineup02.hidden, e.lineup03.hidden, e.lineup13.hidden], [false, true, true]);
});

test('the box score shows in the pause menu\'s panel and on the final screen, with the player of the game', () => {
  const { e, s, show, choose } = pausedHud();
  s.rosters[0][0].stats.pts = 7;
  show();
  assert.equal(e.boxScore.hidden, true);
  choose('ArrowDown', 'ArrowDown', 'Enter'); show();
  assert.deepEqual([e.boxScore.hidden, e.pauseList.hidden, e.boxTeam0.textContent, e.box0r0c0.textContent, e.box0r0c2.textContent, e.box0r8c0.textContent, e.box0r8c2.textContent],
    [false, true, 'Harbor City Waves', 'Cross', '7', 'TEAM', '7']);
  const doc = fakeDoc(), hud = createHud(doc), over = createMatch();
  over.phase = 'final'; over.score = [50, 61]; over.rosters[1][0].stats.pts = 30;
  hud.update(over, 'webgl2', { paused: false, pick: null });
  assert.deepEqual([doc.els.boxScore.hidden, doc.els.finalPotg.textContent, doc.els.box1r0c2.textContent], [false, 'PLAYER OF THE GAME · Kai Mercer · 30 PTS · 0 REB · 0 AST', '30']);
});

test('the Commentary row says what is chosen, and where there is no voice that it is captions only', () => {
  const menu = createMenu(); menu.panel = 'settings';
  const row = MENU.settings.indexOf('commentary'), words = (commentary, hasVoice) => menuText(menu, row, 'high', '2k', { ...DEFAULT_PREFS, commentary }, hasVoice);
  assert.deepEqual([words('voice', true), words('captions', true), words('off', true)], ['Commentary: Voice and captions', 'Commentary: Captions only', 'Commentary: Off']);
  assert.deepEqual([words('voice', false), words('captions', false), words('off', false)],
    ['Commentary: Captions only (no voice in this browser)', 'Commentary: Captions only (no voice in this browser)', 'Commentary: Off']);
});

test('the page has every element the broadcast writes to', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const ids = ['banner', 'bannerWords', 'bannerName', 'lower', 'lowerTitle', 'lowerLine', 'caption', 'lineups', 'lineupTeam0', 'lineupTeam1', 'between', 'betweenTitle',
    'boxScore', 'boxTeam0', 'boxTeam1', 'finalPotg', ...[0, 1].flatMap(t => [0, 1, 2, 3, 4].map(i => `lineup${t}${i}`)), ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => `betweenLine${i}`),
    ...[0, 1].flatMap(t => [0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap(r => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(c => `box${t}r${r}c${c}`)))];
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.equal((html.match(/<[^>]*aria-live[^>]*>/g) ?? []).length, 1);   // still one live region: the caption is not read out twice
});

test('during a replay the page says REPLAY, and a last replay keeps the box score back until it is over', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els;
  s.phase = 'final';
  hud.update(s, 'webgl2', { paused: false, pick: null, show: { replay: true } });
  assert.deepEqual([e.replayMark.hidden, e.boxScore.hidden], [false, true]);
  hud.update(s, 'webgl2', { paused: false, pick: null, show: {} });
  assert.deepEqual([e.replayMark.hidden, e.boxScore.hidden], [true, false]);
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /id="replayMark"/);
});

test('the Replays row says On or Off', () => {
  const menu = createMenu(); menu.panel = 'settings';
  const row = MENU.settings.indexOf('replays');
  assert.equal(menuText(menu, row, 'high', '2k', { ...DEFAULT_PREFS, replays: true }), 'Replays: On');
  assert.equal(menuText(menu, row, 'high', '2k', { ...DEFAULT_PREFS, replays: false }), 'Replays: Off');
});

test('the Sound row says Full, Quiet or Off', () => {
  const menu = createMenu(); menu.panel = 'settings';
  const row = MENU.settings.indexOf('sound');
  assert.deepEqual(['full', 'quiet', 'off'].map(sound => menuText(menu, row, 'high', '2k', { ...DEFAULT_PREFS, sound })), ['Sound: Full', 'Sound: Quiet', 'Sound: Off']);
});

// ---------- Watch, Game styles and Simulate (plan Tasks 6.2 to 6.4) ----------

test('the Game styles panel and a slider panel say their values, and a slider row is filled as far as its value', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els, menu = createMenu();
  const show = () => hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality: 'high' });
  menu.row = MENU.main.indexOf('settings'); menuKey(menu, 'Enter'); menu.row = MENU.settings.indexOf('styles'); menuKey(menu, 'Enter'); show();
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(i => e[`menuRow${i}`].textContent), ['Play style: Arcade', 'Play quarters: 3 minutes', 'Watch style: Simulation',
    'Watch quarters: 12 minutes', 'Simulate quarters: 12 minutes', 'Arcade sliders ▸', 'Simulation sliders ▸']);
  menu.row = 6; menuKey(menu, 'Enter'); menuKey(menu, 'ArrowRight'); show();
  assert.deepEqual([e.menuRow0.textContent, e.menuRow0.style.backgroundSize, e.menuRow9.textContent, e.menuRow9.style.backgroundSize, e.menuList.className],
    ['Pace: 55', '55% 100%', 'Reset to 50', '0% 100%', 'simSliders']);
  assert.match(e.menuHint.textContent, /← → move by 5/);
});

test('with no human there is no name under a player, no meter, no player box and no key line', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els;
  s.phase = 'live';
  const meter = { x: 0, z: 0, head: { x: 100, y: 100 }, band: [0.4, 0.6], fill: 0.5, frozen: null, green: false };
  hud.update(s, 'webgl2', { paused: false, pick: null, feet: { x: 10, y: 20 }, meter });
  assert.deepEqual([e.nameTag.hidden, e.shotMeter.hidden], [false, false]);
  assert.deepEqual([e.whoBox.hidden, e.controls.hidden], [false, false]);
  s.humans = [];
  hud.update(s, 'webgl2', { paused: false, pick: null, feet: { x: 10, y: 20 }, meter });
  assert.deepEqual([e.nameTag.hidden, e.shotMeter.hidden, e.whoBox.hidden, e.controls.hidden], [true, true, true, true]);   // nor his box, nor the keys
  s.score = [4, 2]; hud.update(s, 'webgl2', { paused: false, pick: null });
  assert.equal(e.announce.textContent, 'Harbor City Waves 4, Red Rock Scorpions 2');   // the score said by the teams' names, not "you"
});

test('the result screen shows what was played, the score by period, both full box scores and the team advanced stats', () => {
  const doc = fakeDoc(), hud = createHud(doc), e = doc.els, result = quickMatch({ seed: 4 });
  hud.update(createMatch(), 'webgl2', { paused: false, pick: null, result });
  assert.equal(e.simTitle.textContent, 'Simulation · 12-minute quarters · 5 on 5');
  assert.match(e.simScore0.textContent, new RegExp(`${result.score[0]}$`));
  assert.equal(RESULT_HEAD.length, 15);
  assert.deepEqual(RESULT_HEAD.slice(6, 8), ['OREB', 'DREB']);
  const total = [0, 1].map(t => Number(e[`simBox${t}r8c2`].textContent));
  assert.deepEqual(total, result.score);                                                // the team rows add up to the score
  assert.equal(e.simBox0r0c0.textContent, surname(result.rosters[0][0]));
  assert.deepEqual([e.simAdv0c0.textContent, e.simAdv2c0.textContent], ['Pace', 'eFG%']);
  assert.match(e.simAdv0c1.textContent, /^\d+\.\d$/);
  assert.equal(advancedLines(result).length, 8);
});

test('the page has the result screen\'s every cell, and ten menu rows for a slider panel', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['simResult', 'simTitle', 'simScore0', 'simScore1', 'simTeam0', 'simTeam1', 'menuRow9',
    ...[0, 1].flatMap(t => Array.from({ length: 9 * 15 }, (_, i) => `simBox${t}r${Math.floor(i / 15)}c${i % 15}`)),
    ...Array.from({ length: 24 }, (_, i) => `simAdv${Math.floor(i / 3)}c${i % 3}`)]) assert.match(html, new RegExp(`id="${id}"`), id);
});

test('Settings can hide the frame rate in the corner and the keys\' line, and show them again', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els;
  s.phase = 'live';
  const show = info => hud.update(s, 'webgl2', { paused: false, pick: null, quality: 'high', fps: 60, prefs: { ...DEFAULT_PREFS, info } });
  show(true);
  assert.deepEqual([e.backend.hidden, e.controls.hidden], [false, false]);
  assert.match(e.backend.textContent, /60 fps/);
  show(false);
  assert.deepEqual([e.backend.hidden, e.controls.hidden], [true, true]);
  show(true);
  assert.deepEqual([e.backend.hidden, e.controls.hidden], [false, false]);
  assert.equal(menuText({ panel: 'settings' }, MENU.settings.indexOf('info'), 'high', '2k', { ...DEFAULT_PREFS, info: false }), 'FPS and controls: Hidden');
});
