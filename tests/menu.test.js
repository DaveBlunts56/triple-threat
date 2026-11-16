import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU, createMenu, menuRows, menuKey, menuPoint, menuHasRow, resultKey, startFromMenu } from '../src/menu.js';
import { createKeyboard } from '../src/input.js';
import { createMatch } from '../src/sim/state.js';
import { aiIntents } from '../src/sim/ai.js';
import { step } from '../src/sim/step.js';
import { DT } from '../src/sim/tuning.js';
import { DEFAULT_PREFS } from '../src/prefs.js';
import { KEY_ROWS, createKeys } from '../src/keys.js';

const keys = (menu, ...codes) => codes.map(code => menuKey(menu, code));
const key = (type, code) => Object.assign(new Event(type, { cancelable: true }), { code });

const at = name => MENU.main.indexOf(name);   // where an entry is on the main list

test('the main list is Play, Watch, Simulate, Mode, Teams, Controls, Settings, with the bar on Play and the mode on 3 on 3', () => {
  const m = createMenu();
  assert.deepEqual([m.panel, m.row, m.autoSubs, m.size, menuRows(m)], ['main', 0, true, 3, ['play', 'watch', 'simulate', 'mode', 'teams', 'controls', 'settings']]);
  assert.deepEqual(MENU.settings, ['quality', 'autoSubs', 'camera', 'difficulty', 'styles', 'commentary', 'replays', 'sound', 'keys']);
  assert.equal(MENU.settings.length, 9);   // the page has nine rows for them
});

test('Settings has Game styles in place of Quarter, and the Game styles panel has its seven rows', () => {
  assert.ok(!MENU.settings.includes('quarter'));
  assert.deepEqual(MENU.styles, ['playStyle', 'playMinutes', 'watchStyle', 'watchMinutes', 'simulateMinutes', 'arcadeSliders', 'simSliders']);
  assert.equal(MENU.simSliders.length, 10);   // nine sliders and Reset: the page has ten rows for them
});

test('the bar moves down and up by arrows or W and S, and wraps at both ends', () => {
  const m = createMenu();
  keys(m, 'ArrowDown', 'KeyS'); assert.equal(m.row, 2);
  keys(m, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown'); assert.equal(m.row, 6);
  keys(m, 'ArrowDown'); assert.equal(m.row, 0);
  keys(m, 'ArrowUp'); assert.equal(m.row, 6);
  keys(m, 'KeyW'); assert.equal(m.row, 5);
  assert.deepEqual(keys(m, 'KeyX', 'ArrowLeft'), [null, null]); assert.equal(m.row, 5);
});

test('Enter or Space on Play, Watch or Simulate asks for it and changes nothing', () => {
  for (const code of ['Enter', 'Space']) for (const what of ['play', 'watch', 'simulate']) {
    const m = createMenu(); m.row = at(what);
    assert.equal(menuKey(m, code), what);
    assert.deepEqual([m.panel, m.row], ['main', at(what)]);
  }
});

test('Teams, Controls and Settings open inside the menu, and Esc or Backspace go back to the entry that opened them', () => {
  for (const [row, panel, rows] of [[at('teams'), 'teams', []], [at('controls'), 'controls', []], [at('settings'), 'settings', MENU.settings]]) {
    for (const back of ['Escape', 'Backspace']) {
      const m = createMenu(); m.row = row;
      assert.equal(menuKey(m, 'Enter'), null);
      assert.deepEqual([m.panel, m.row, menuRows(m)], [panel, 0, rows]);
      assert.ok(!keys(m, 'ArrowDown', 'Enter').includes('play'));                        // moving and choosing in a panel never starts a match
      assert.equal(menuKey(m, back), null);
      assert.deepEqual([m.panel, m.row], ['main', row]);
    }
  }
  const m = createMenu(); m.row = 2;
  assert.deepEqual(keys(m, 'Escape', 'Backspace'), [null, null]);
  assert.deepEqual([m.panel, m.row], ['main', 2]);                                      // on the main list they do nothing
});

test('a panel with no rows ignores the bar keys and Enter', () => {
  const m = createMenu(); m.row = at('teams'); menuKey(m, 'Enter');
  assert.deepEqual(keys(m, 'ArrowDown', 'ArrowUp', 'Enter', 'Space'), [null, null, null, null]);
  assert.deepEqual([m.panel, m.row], ['teams', 0]);
});

test('in Settings, Enter on Quality asks for the quality switch and Enter on Automatic substitutions flips the choice', () => {
  const m = createMenu(); m.row = at('settings'); menuKey(m, 'Enter');
  assert.equal(menuKey(m, 'Enter'), 'quality');
  assert.equal(m.autoSubs, true);
  assert.deepEqual(keys(m, 'ArrowDown', 'Space'), [null, null]);
  assert.equal(m.autoSubs, false);
  menuKey(m, 'Enter'); assert.equal(m.autoSubs, true);
  keys(m, 'ArrowDown'); assert.equal(menuKey(m, 'Enter'), 'camera');                    // the page changes the camera
  keys(m, 'ArrowDown'); assert.equal(m.difficulty, 'allstar');
  assert.equal(menuKey(m, 'Enter'), null); assert.equal(m.difficulty, 'superstar');     // Difficulty steps up a level
  keys(m, 'Enter', 'Enter'); assert.equal(m.difficulty, 'rookie');                      // and round from the hardest to the easiest
  keys(m, 'ArrowDown'); assert.equal(MENU.settings[m.row], 'styles');
  keys(m, 'Enter'); assert.equal(m.panel, 'styles');                                    // Game styles opens its panel
  keys(m, 'Escape'); assert.deepEqual([m.panel, MENU.settings[m.row]], ['settings', 'styles']);   // and Esc comes back to it
  keys(m, 'ArrowDown'); assert.equal(menuKey(m, 'Enter'), 'commentary');                // the page changes the commentary
  keys(m, 'ArrowDown'); assert.equal(menuKey(m, 'Enter'), 'replays');                   // and turns replays on and off
  keys(m, 'ArrowDown'); assert.equal(menuKey(m, 'Enter'), 'sound');                     // and the sound up and down
  keys(m, 'ArrowDown'); assert.equal(MENU.settings[m.row], 'keys');                     // the last row
  keys(m, 'ArrowDown'); assert.equal(m.row, 0);                                         // and it wraps
});

test('pointing with the mouse selects a row the panel has, and no other', () => {
  const m = createMenu();
  menuPoint(m, at('teams')); assert.equal(m.row, at('teams'));
  menuPoint(m, 7); menuPoint(m, -1); assert.equal(m.row, at('teams'));
  menuKey(m, 'Enter'); menuPoint(m, 1); assert.equal(m.row, 0);                          // Teams has no rows
});

test('the mouse acts on a row only before the match, and only on a row the panel shown has', () => {
  const game = { state: createMatch(7), menu: createMenu() };
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(row => menuHasRow(game, row)), [true, true, true, true, true, true, true, false]);
  game.menu.row = at('settings'); menuKey(game.menu, 'Enter');                          // Settings: a row for each setting
  assert.deepEqual([0, MENU.settings.length - 1, MENU.settings.length].map(row => menuHasRow(game, row)), [true, true, false]);
  menuKey(game.menu, 'Escape'); game.menu.row = at('teams'); menuKey(game.menu, 'Enter'); // Teams: none
  assert.equal(menuHasRow(game, 0), false);
  menuKey(game.menu, 'Escape');
  startFromMenu(game, createKeyboard(new EventTarget()), () => createMatch(8));          // play has started
  assert.equal(menuHasRow(game, 0), false);
  game.state.phase = 'final';
  assert.equal(menuHasRow(game, 0), false);
});

function onMenu() {
  const target = new EventTarget(), keyboard = createKeyboard(target);
  const game = { state: createMatch(7), menu: createMenu() };
  const down = code => target.dispatchEvent(key('keydown', code)), up = code => target.dispatchEvent(key('keyup', code));
  const frame = () => { const intents = aiIntents(game.state, DT); intents[game.state.controlled] = keyboard.intent(); step(game.state, intents, DT); return intents[game.state.controlled]; };
  return { game, keyboard, down, up, frame };
}

test('starting from the menu begins the match with the menu\'s choice of automatic substitutions, and again after a final', () => {
  const { game, keyboard } = onMenu();
  game.menu.autoSubs = false;
  startFromMenu(game, keyboard, () => createMatch(8));
  assert.notEqual(game.state.phase, 'start');
  assert.deepEqual(game.state.autoSubs, [false, true]);
  game.state.phase = 'final'; game.state.score = [9, 4];
  const old = game.state;
  startFromMenu(game, keyboard, () => createMatch(9));
  assert.notEqual(game.state, old);
  assert.deepEqual([game.state.score, game.state.autoSubs], [[0, 0], [false, true]]);
  assert.notEqual(game.state.phase, 'final');
});

test('a key held when Play is chosen stays unseen through the whole jump ball, repeats too, until it is let go', () => {
  const { game, keyboard, down, up, frame } = onMenu();
  down('Space'); down('KeyS');                                                          // held on the menu, never let go
  startFromMenu(game, keyboard, () => createMatch(8));
  const me = game.state.players[game.state.controlled];
  assert.equal(me.slot, 1);                                                             // you are one of the two jumpers
  let highest = 0, seen = false, steps = 0;
  for (; game.state.phase === 'jumpBall' && steps < 600; steps++) {
    down('Space');                                                                      // the held key's auto-repeat
    const intent = frame();
    highest = Math.max(highest, me.y);
    seen ||= intent.shoot || intent.moveX !== 0 || intent.moveZ !== 0;
  }
  assert.notEqual(game.state.phase, 'jumpBall');                                        // the whole jump ball went by
  assert.deepEqual({ highest, seen }, { highest: 0, seen: false });
  up('Space'); down('Space');
  assert.equal(frame().shoot, true);                                                    // let go and pressed again: a press
});

test('Enter or Space on Mode switches between 3 on 3 and 5 on 5 and starts nothing', () => {
  const m = createMenu(); m.row = at('mode');
  assert.deepEqual([menuKey(m, 'Enter'), m.size, m.panel, m.row], [null, 5, 'main', at('mode')]);
  assert.deepEqual([menuKey(m, 'Space'), m.size], [null, 3]);
  assert.deepEqual([menuKey(m, 'Enter'), m.size], [null, 5]);
});

test('Play makes a match of the menu\'s size: ten players for 5 on 5, the same again after a final, six once it is switched back', () => {
  const { game, keyboard } = onMenu();
  const made = [], make = size => { made.push(size); return createMatch(20 + made.length, size); };
  game.menu.size = 5;
  startFromMenu(game, keyboard, make);                                                  // the match waiting was three a side
  assert.deepEqual([game.state.players.length, game.state.size, game.state.phase, made], [10, 5, 'jumpBall', [5]]);
  game.state.phase = 'final';
  startFromMenu(game, keyboard, make);
  assert.deepEqual([game.state.players.length, made], [10, [5, 5]]);
  game.state.phase = 'final'; game.menu.size = 3;
  startFromMenu(game, keyboard, make);
  assert.deepEqual([game.state.players.length, game.state.size, made], [6, 3, [5, 5, 3]]);
  const waiting = { state: createMatch(1), menu: createMenu() };                        // a match of the right size is not made again
  startFromMenu(waiting, keyboard, () => { throw new Error('made a match it did not need'); });
  assert.equal(waiting.state.players.length, 6);
});

// ---------- remembered choices and the Keys panel ----------

test('the menu starts with the choices that were saved', () => {
  const m = createMenu({ ...DEFAULT_PREFS, size: 5, difficulty: 'legend', play: { style: 'sim', minutes: 8 }, autoSubs: false });
  assert.deepEqual([m.size, m.difficulty, m.play, m.watch, m.autoSubs, m.panel, m.row], [5, 'legend', { style: 'sim', minutes: 8 }, { style: 'sim', minutes: 12 }, false, 'main', 0]);
});

const toKeys = m => { m.row = at('settings'); menuKey(m, 'Enter'); m.row = MENU.settings.indexOf('keys'); return menuKey(m, 'Enter'); };

test('the Keys row of Settings opens the Keys panel, a row for every action and one to reset', () => {
  const m = createMenu();
  assert.equal(toKeys(m), null);
  assert.deepEqual([m.panel, m.row, m.listening, menuRows(m)], ['keys', 0, false, KEY_ROWS]);
});

test('on the Keys panel a key is set, the page is told, and Escape goes back to Settings with the bar on Keys', () => {
  const m = createMenu(), table = createKeys();
  toKeys(m);
  m.row = KEY_ROWS.indexOf('cross');
  assert.deepEqual([menuKey(m, 'Enter', table), m.listening], [null, true]);
  assert.equal(menuKey(m, 'KeyR', table), 'keys');
  assert.equal(table.cross, 'KeyR');
  assert.equal(menuKey(m, 'Escape', table), null);
  assert.deepEqual([m.panel, MENU.settings[m.row]], ['settings', 'keys']);
  assert.equal(menuKey(m, 'Escape', table), null);
  assert.deepEqual([m.panel, m.row], ['main', at('settings')]);
});

test('while the Keys panel waits for a key, Enter and Space start no match and the mouse moves nothing', () => {
  const m = createMenu(), table = createKeys();
  toKeys(m); m.row = 3; menuKey(m, 'Enter', table);
  assert.deepEqual([menuKey(m, 'Enter', table), menuKey(m, 'Escape', table)], [null, null]);
  assert.deepEqual([m.panel, m.listening, m.row], ['keys', false, 3]);
  menuKey(m, 'Enter', table); menuPoint(m, 7);
  assert.equal(m.row, 3);
  assert.equal(menuKey(m, 'Space', table), 'keys');   // Space is set as the key
  assert.equal(table.right, 'Space');
});

// ---------- Watch, and Game styles (plan Tasks 6.2 and 6.3) ----------

const toStyles = m => { m.row = at('settings'); menuKey(m, 'Enter'); m.row = MENU.settings.indexOf('styles'); menuKey(m, 'Enter'); return m; };
const onRow = (m, name) => { m.row = menuRows(m).indexOf(name); return m; };

test('Play\'s style and quarters, Watch\'s style and quarters, and Simulate\'s quarters are chosen apart', () => {
  const m = toStyles(createMenu());
  assert.deepEqual([m.play, m.watch, m.simulate], [{ style: 'arcade', minutes: 3 }, { style: 'sim', minutes: 12 }, { minutes: 12 }]);
  menuKey(onRow(m, 'playStyle'), 'Enter');
  menuKey(onRow(m, 'playMinutes'), 'ArrowRight');
  menuKey(onRow(m, 'watchMinutes'), 'ArrowLeft');
  menuKey(onRow(m, 'simulateMinutes'), 'KeyA');
  assert.deepEqual([m.play, m.watch, m.simulate], [{ style: 'sim', minutes: 5 }, { style: 'sim', minutes: 8 }, { minutes: 8 }]);
  menuKey(onRow(m, 'watchStyle'), 'ArrowLeft');
  assert.deepEqual([m.play.style, m.watch.style], ['sim', 'arcade']);
});

test('each style\'s sliders are moved apart: moving Simulation\'s leaves Arcade\'s as they were; ← and → move by 5, kept within 0 to 100', () => {
  const m = toStyles(createMenu());
  menuKey(onRow(m, 'simSliders'), 'Enter');
  assert.deepEqual([m.panel, menuRows(m).length], ['simSliders', 10]);
  keys(onRow(m, 'pace'), 'ArrowRight', 'KeyD');
  assert.deepEqual([m.sliders.sim.pace, m.sliders.arcade.pace], [60, 50]);
  for (let i = 0; i < 15; i++) menuKey(m, 'ArrowRight');
  assert.equal(m.sliders.sim.pace, 100);
  for (let i = 0; i < 25; i++) menuKey(m, 'ArrowLeft');
  assert.equal(m.sliders.sim.pace, 0);
});

test('Reset puts one style\'s sliders back to 50 and leaves the other\'s', () => {
  const m = toStyles(createMenu());
  m.sliders.arcade.fouls = 80;
  menuKey(onRow(m, 'simSliders'), 'Enter');
  keys(onRow(m, 'shooting'), 'ArrowRight', 'ArrowRight');
  menuKey(onRow(m, 'reset'), 'Enter');
  assert.deepEqual([m.sliders.sim.shooting, m.sliders.arcade.fouls], [50, 80]);
});

test('Esc goes back one panel at a time: a slider panel to Game styles, Game styles to Settings, Settings to the main list', () => {
  const m = toStyles(createMenu());
  menuKey(onRow(m, 'arcadeSliders'), 'Enter');
  menuKey(m, 'Escape'); assert.deepEqual([m.panel, MENU.styles[m.row]], ['styles', 'arcadeSliders']);
  menuKey(m, 'Backspace'); assert.deepEqual([m.panel, MENU.settings[m.row]], ['settings', 'styles']);
  menuKey(m, 'Escape'); assert.deepEqual([m.panel, m.row], ['main', at('settings')]);
});

test('Watch starts a match with no human, at Watch\'s style and quarters with that style\'s sliders; Play at Play\'s', () => {
  const { game, keyboard } = onMenu();
  game.menu.sliders.sim.pace = 70;
  startFromMenu(game, keyboard, size => createMatch(8, size), 'watch');
  assert.deepEqual([game.state.humans, game.state.style, game.state.quarterLength, game.state.sliders.pace], [[], 'sim', 720, 70]);
  game.state.phase = 'final';
  startFromMenu(game, keyboard, size => createMatch(9, size));
  assert.deepEqual([game.state.humans, game.state.style, game.state.quarterLength], [[0], 'arcade', 180]);
});

test('on a simulated game\'s result Enter simulates another and Esc goes back to the menu; the mouse leaves the menu alone under it', () => {
  assert.deepEqual(['Enter', 'Space', 'Escape', 'Backspace', 'KeyX'].map(resultKey), ['simulate', 'simulate', 'back', 'back', null]);
  const game = { state: createMatch(7), menu: createMenu(), result: {} };
  assert.equal(menuHasRow(game, 0), false);
  game.result = null;
  assert.equal(menuHasRow(game, 0), true);
});

test('Simulate\'s quarters start on 12', () => assert.equal(createMenu().simulate.minutes, 12));
