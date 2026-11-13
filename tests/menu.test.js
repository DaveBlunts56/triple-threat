import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU, createMenu, menuRows, menuKey, menuPoint, startFromMenu } from '../src/menu.js';
import { createKeyboard } from '../src/input.js';
import { createMatch } from '../src/sim/state.js';
import { aiIntents } from '../src/sim/ai.js';
import { step } from '../src/sim/step.js';
import { DT } from '../src/sim/tuning.js';

const keys = (menu, ...codes) => codes.map(code => menuKey(menu, code));
const key = (type, code) => Object.assign(new Event(type, { cancelable: true }), { code });

test('the main list is Play, Teams, Controls, Settings, with the bar on Play', () => {
  const m = createMenu();
  assert.deepEqual([m.panel, m.row, m.autoSubs, menuRows(m)], ['main', 0, true, ['play', 'teams', 'controls', 'settings']]);
  assert.deepEqual(MENU.settings, ['quality', 'autoSubs']);
});

test('the bar moves down and up by arrows or W and S, and wraps at both ends', () => {
  const m = createMenu();
  keys(m, 'ArrowDown', 'KeyS'); assert.equal(m.row, 2);
  keys(m, 'ArrowDown', 'ArrowDown'); assert.equal(m.row, 0);
  keys(m, 'ArrowUp'); assert.equal(m.row, 3);
  keys(m, 'KeyW'); assert.equal(m.row, 2);
  assert.deepEqual(keys(m, 'KeyX', 'ArrowLeft'), [null, null]); assert.equal(m.row, 2);
});

test('Enter or Space on Play asks for the match to start and changes nothing', () => {
  for (const code of ['Enter', 'Space']) {
    const m = createMenu();
    assert.equal(menuKey(m, code), 'play');
    assert.deepEqual([m.panel, m.row], ['main', 0]);
  }
});

test('Teams, Controls and Settings open inside the menu, and Esc or Backspace go back to the entry that opened them', () => {
  for (const [row, panel, rows] of [[1, 'teams', []], [2, 'controls', []], [3, 'settings', ['quality', 'autoSubs']]]) {
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
  const m = createMenu(); m.row = 1; menuKey(m, 'Enter');
  assert.deepEqual(keys(m, 'ArrowDown', 'ArrowUp', 'Enter', 'Space'), [null, null, null, null]);
  assert.deepEqual([m.panel, m.row], ['teams', 0]);
});

test('in Settings, Enter on Quality asks for the quality switch and Enter on Automatic substitutions flips the choice', () => {
  const m = createMenu(); m.row = 3; menuKey(m, 'Enter');
  assert.equal(menuKey(m, 'Enter'), 'quality');
  assert.equal(m.autoSubs, true);
  assert.deepEqual(keys(m, 'ArrowDown', 'Space'), [null, null]);
  assert.equal(m.autoSubs, false);
  menuKey(m, 'Enter'); assert.equal(m.autoSubs, true);
  keys(m, 'ArrowDown'); assert.equal(m.row, 0);                                         // two rows: it wraps
});

test('pointing with the mouse selects a row the panel has, and no other', () => {
  const m = createMenu();
  menuPoint(m, 2); assert.equal(m.row, 2);
  menuPoint(m, 4); menuPoint(m, -1); assert.equal(m.row, 2);
  m.row = 1; menuKey(m, 'Enter'); menuPoint(m, 1); assert.equal(m.row, 0);              // Teams has no rows
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

test('a key still held when Play is chosen is not a fresh press in the match', () => {
  const { game, keyboard, down, up, frame } = onMenu();
  down('Space'); down('KeyS');                                                          // held on the menu, never let go
  startFromMenu(game, keyboard, () => createMatch(8));
  const me = game.state.players[game.state.controlled];
  assert.deepEqual([me.prev.shoot, me.prev.moveZ], [true, 1]);                          // already seen: not a fresh press
  up('Space'); up('KeyS');
  assert.deepEqual([frame().shoot, frame().moveZ], [false, 0]);
  down('Space');
  assert.equal(frame().shoot, true);                                                    // a new press is seen as one
});
