import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU, createMenu, menuRows, menuKey, menuPoint, menuHasRow, startFromMenu } from '../src/menu.js';
import { createKeyboard } from '../src/input.js';
import { createMatch } from '../src/sim/state.js';
import { aiIntents } from '../src/sim/ai.js';
import { step } from '../src/sim/step.js';
import { DT } from '../src/sim/tuning.js';
import { DEFAULT_PREFS } from '../src/prefs.js';
import { KEY_ROWS, createKeys } from '../src/keys.js';

const keys = (menu, ...codes) => codes.map(code => menuKey(menu, code));
const key = (type, code) => Object.assign(new Event(type, { cancelable: true }), { code });

test('the main list is Play, Mode, Teams, Controls, Settings, with the bar on Play and the mode on 3 on 3', () => {
  const m = createMenu();
  assert.deepEqual([m.panel, m.row, m.autoSubs, m.size, menuRows(m)], ['main', 0, true, 3, ['play', 'mode', 'teams', 'controls', 'settings']]);
  assert.deepEqual(MENU.settings, ['quality', 'autoSubs', 'camera', 'difficulty', 'quarter', 'commentary', 'keys']);
});

test('the bar moves down and up by arrows or W and S, and wraps at both ends', () => {
  const m = createMenu();
  keys(m, 'ArrowDown', 'KeyS'); assert.equal(m.row, 2);
  keys(m, 'ArrowDown', 'ArrowDown'); assert.equal(m.row, 4);
  keys(m, 'ArrowDown'); assert.equal(m.row, 0);
  keys(m, 'ArrowUp'); assert.equal(m.row, 4);
  keys(m, 'KeyW'); assert.equal(m.row, 3);
  assert.deepEqual(keys(m, 'KeyX', 'ArrowLeft'), [null, null]); assert.equal(m.row, 3);
});

test('Enter or Space on Play asks for the match to start and changes nothing', () => {
  for (const code of ['Enter', 'Space']) {
    const m = createMenu();
    assert.equal(menuKey(m, code), 'play');
    assert.deepEqual([m.panel, m.row], ['main', 0]);
  }
});

test('Teams, Controls and Settings open inside the menu, and Esc or Backspace go back to the entry that opened them', () => {
  for (const [row, panel, rows] of [[2, 'teams', []], [3, 'controls', []], [4, 'settings', MENU.settings]]) {
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
  const m = createMenu(); m.row = 2; menuKey(m, 'Enter');
  assert.deepEqual(keys(m, 'ArrowDown', 'ArrowUp', 'Enter', 'Space'), [null, null, null, null]);
  assert.deepEqual([m.panel, m.row], ['teams', 0]);
});

test('in Settings, Enter on Quality asks for the quality switch and Enter on Automatic substitutions flips the choice', () => {
  const m = createMenu(); m.row = 4; menuKey(m, 'Enter');
  assert.equal(menuKey(m, 'Enter'), 'quality');
  assert.equal(m.autoSubs, true);
  assert.deepEqual(keys(m, 'ArrowDown', 'Space'), [null, null]);
  assert.equal(m.autoSubs, false);
  menuKey(m, 'Enter'); assert.equal(m.autoSubs, true);
  keys(m, 'ArrowDown'); assert.equal(menuKey(m, 'Enter'), 'camera');                    // the page changes the camera
  keys(m, 'ArrowDown'); assert.equal(m.difficulty, 'allstar');
  assert.equal(menuKey(m, 'Enter'), null); assert.equal(m.difficulty, 'superstar');     // Difficulty steps up a level
  keys(m, 'Enter', 'Enter'); assert.equal(m.difficulty, 'rookie');                      // and round from the hardest to the easiest
  keys(m, 'ArrowDown'); assert.equal(m.minutes, 3);
  keys(m, 'Enter'); assert.equal(m.minutes, 5);                                         // Quarter length steps through 3, 5, 8, 12
  keys(m, 'Enter', 'Enter', 'Enter'); assert.equal(m.minutes, 3);                       // and round again
  keys(m, 'ArrowDown'); assert.equal(menuKey(m, 'Enter'), 'commentary');                // the page changes the commentary
  keys(m, 'ArrowDown'); assert.equal(MENU.settings[m.row], 'keys');                     // the last row
  keys(m, 'ArrowDown'); assert.equal(m.row, 0);                                         // and it wraps
});

test('pointing with the mouse selects a row the panel has, and no other', () => {
  const m = createMenu();
  menuPoint(m, 2); assert.equal(m.row, 2);
  menuPoint(m, 5); menuPoint(m, -1); assert.equal(m.row, 2);
  menuKey(m, 'Enter'); menuPoint(m, 1); assert.equal(m.row, 0);                          // row 2 is Teams, which has no rows
});

test('the mouse acts on a row only before the match, and only on a row the panel shown has', () => {
  const game = { state: createMatch(7), menu: createMenu() };
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(row => menuHasRow(game, row)), [true, true, true, true, true, false]);
  game.menu.row = 4; menuKey(game.menu, 'Enter');                                       // Settings: a row for each setting
  assert.deepEqual([0, MENU.settings.length - 1, MENU.settings.length].map(row => menuHasRow(game, row)), [true, true, false]);
  menuKey(game.menu, 'Escape'); game.menu.row = 2; menuKey(game.menu, 'Enter');         // Teams: none
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
  const m = createMenu(); m.row = 1;
  assert.deepEqual([menuKey(m, 'Enter'), m.size, m.panel, m.row], [null, 5, 'main', 1]);
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
  const m = createMenu({ ...DEFAULT_PREFS, size: 5, difficulty: 'legend', minutes: 8, autoSubs: false });
  assert.deepEqual([m.size, m.difficulty, m.minutes, m.autoSubs, m.panel, m.row], [5, 'legend', 8, false, 'main', 0]);
});

const toKeys = m => { m.row = 4; menuKey(m, 'Enter'); m.row = MENU.settings.indexOf('keys'); return menuKey(m, 'Enter'); };

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
  assert.deepEqual([m.panel, m.row], ['main', 4]);
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
