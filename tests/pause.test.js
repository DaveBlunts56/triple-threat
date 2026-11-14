import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboard } from '../src/input.js';
import { PAUSE, pauseKey, pauseRows, pausePoint, pauseHasRow, quitToMenu, setPaused } from '../src/pause.js';
import { createMenu } from '../src/menu.js';
import { createMatch } from '../src/sim/state.js';
import { live } from './helpers.js';
import { KEY_ROWS, createKeys } from '../src/keys.js';

const key = (type, code) => Object.assign(new Event(type, { cancelable: true }), { code });
function paused() {
  const target = new EventTarget();
  const keyboard = createKeyboard(target);
  const game = { state: live(), paused: false, pick: null };
  setPaused(game, keyboard, true);
  return { game, keyboard, down: code => target.dispatchEvent(key('keydown', code)),
    tap: code => { target.dispatchEvent(key('keydown', code)); target.dispatchEvent(key('keyup', code)); } };
}

// Moves the highlight to `entry` of the main list and chooses it.
function open(game, entry) {
  while (pauseRows(game.pauseMenu)[game.pauseMenu.row] !== entry) pauseKey(game, 'ArrowDown');
  return pauseKey(game, 'Enter');
}
const keys = (game, ...codes) => codes.map(code => pauseKey(game, code));
const at = game => [game.pauseMenu.panel, game.pauseMenu.row];

test('on the pause screen two row keys queue a swap, the same row twice does nothing, and A flips automatic substitutions', () => {
  const { game } = paused();
  pauseKey(game, 'Digit2');
  assert.equal(game.pick, null);                                         // the row keys only work in Substitutions
  open(game, 'subs');
  pauseKey(game, 'Digit2');
  assert.equal(game.pick, 1);
  pauseKey(game, 'Digit4');
  assert.deepEqual([game.pick, game.state.subQueue], [null, [{ team: 0, out: 1, in: 3 }]]);
  pauseKey(game, 'Digit5'); pauseKey(game, 'Digit5');
  assert.deepEqual([game.pick, game.state.subQueue.length], [null, 1]);
  pauseKey(game, 'KeyA');
  assert.deepEqual(game.state.autoSubs, [false, true]);
});

test('the game cannot be paused before it starts or after it ends, and resuming forgets the selected row', () => {
  const { game, keyboard } = paused();
  open(game, 'subs');
  pauseKey(game, 'Digit1');
  setPaused(game, keyboard, false);
  assert.deepEqual([game.paused, game.pick], [false, null]);
  game.state.phase = 'final';
  setPaused(game, keyboard, true);
  assert.equal(game.paused, false);
});

test('a key tapped on the pause screen does not act when play resumes', () => {
  const { game, keyboard, tap } = paused();
  tap('Space'); tap('KeyA'); tap('KeyE');
  setPaused(game, keyboard, false);
  const intent = keyboard.intent();
  assert.deepEqual([intent.shoot, intent.moveX, intent.pass], [false, 0, false]);
});

test('pausing shows the list with the highlight on Resume: Resume, Substitutions, Controls, Settings, Quit to main menu', () => {
  const { game } = paused();
  assert.deepEqual([at(game), pauseRows(game.pauseMenu)], [['main', 0], ['resume', 'subs', 'box', 'controls', 'settings', 'quit']]);
  assert.deepEqual([PAUSE.settings, PAUSE.quit], [['quality', 'autoSubs', 'camera', 'difficulty', 'commentary', 'replays', 'sound', 'keys'], ['stay', 'leave']]);
});

test('the highlight moves by arrows or W and S and wraps; Enter or Space on Resume, or Esc, asks to resume', () => {
  const { game } = paused();
  keys(game, 'ArrowDown', 'KeyS'); assert.deepEqual(at(game), ['main', 2]);
  keys(game, 'ArrowUp', 'KeyW', 'KeyW'); assert.deepEqual(at(game), ['main', 5]);
  keys(game, 'ArrowDown'); assert.deepEqual(at(game), ['main', 0]);
  assert.deepEqual(keys(game, 'Enter', 'Space', 'Escape', 'Backspace', 'KeyX'), ['resume', 'resume', 'resume', null, null]);
});

test('Substitutions, Controls and Settings open as panels; Esc or Backspace go back to the entry that opened them', () => {
  for (const [entry, row, rows] of [['subs', 1, []], ['box', 2, []], ['controls', 3, []], ['settings', 4, PAUSE.settings]]) for (const back of ['Escape', 'Backspace']) {
    const { game } = paused();
    assert.equal(open(game, entry), null);
    assert.deepEqual([at(game), pauseRows(game.pauseMenu)], [[entry, 0], rows]);
    assert.equal(pauseKey(game, back), null);                               // back, not resume
    assert.deepEqual(at(game), ['main', row]);
  }
});

test('in Settings, Enter on Quality asks for the quality switch, and on Automatic substitutions flips them for this match and for later ones', () => {
  const { game } = paused(); game.menu = createMenu();
  open(game, 'settings');
  assert.equal(pauseKey(game, 'Enter'), 'quality');
  assert.deepEqual(keys(game, 'ArrowDown', 'Enter'), [null, null]);
  assert.deepEqual([game.state.autoSubs, game.menu.autoSubs], [[false, true], false]);
  pauseKey(game, 'Space');
  assert.deepEqual([game.state.autoSubs, game.menu.autoSubs], [[true, true], true]);
  pauseKey(game, 'ArrowDown'); assert.equal(pauseKey(game, 'Enter'), 'camera');   // the page changes the camera
  pauseKey(game, 'ArrowDown'); assert.equal(pauseKey(game, 'Enter'), null);       // Difficulty: for this match and for later ones
  assert.deepEqual([game.state.difficulty, game.menu.difficulty], ['superstar', 'superstar']);
  pauseKey(game, 'Escape'); open(game, 'subs'); pauseKey(game, 'KeyA');     // the A key in Substitutions is the same switch
  assert.deepEqual([game.state.autoSubs, game.menu.autoSubs], [[false, true], false]);
});

test('Quit to main menu asks first, with the highlight on staying', () => {
  const { game } = paused();
  assert.equal(open(game, 'quit'), null);
  assert.deepEqual([at(game), pauseRows(game.pauseMenu)], [['quit', 0], ['stay', 'leave']]);
  assert.equal(pauseKey(game, 'Enter'), null);                              // staying goes back to the list
  assert.deepEqual(at(game), ['main', 5]);
  open(game, 'quit');
  assert.deepEqual(keys(game, 'ArrowDown', 'Enter'), [null, 'quit']);
});

test('the mouse selects a row the panel has, and only while paused', () => {
  const { game, keyboard } = paused();
  pausePoint(game, 3); assert.deepEqual(at(game), ['main', 3]);
  pausePoint(game, 6); pausePoint(game, -1); assert.deepEqual(at(game), ['main', 3]);
  assert.deepEqual([pauseHasRow(game, 5), pauseHasRow(game, 6)], [true, false]);
  open(game, 'controls');                                                   // the highlight moves to Controls first
  assert.equal(pauseHasRow(game, 0), false);
  setPaused(game, keyboard, false);
  assert.equal(pauseHasRow(game, 0), false);
});

test('pausing again starts from the top of the list', () => {
  const { game, keyboard } = paused();
  open(game, 'settings'); pauseKey(game, 'ArrowDown');
  setPaused(game, keyboard, false); setPaused(game, keyboard, true);
  assert.deepEqual(at(game), ['main', 0]);
});

test('quitting drops the match for a new one on the start menu, unpaused, with the keys held then ignored', () => {
  const { game, keyboard, down } = paused(); game.menu = createMenu(); game.menu.panel = 'settings'; game.menu.row = 1; game.menu.autoSubs = false;
  game.state.score = [7, 4]; down('Space');
  const old = game.state;
  quitToMenu(game, keyboard, () => createMatch(9));
  assert.notEqual(game.state, old);
  assert.deepEqual([game.state.phase, game.state.score, game.paused, game.pick], ['start', [0, 0], false, null]);
  assert.deepEqual([game.menu.panel, game.menu.row, game.menu.autoSubs], ['main', 0, false]);   // the menu's own choice is kept
  assert.equal(keyboard.intent().shoot, false);
});

test('Space held when Resume is chosen does not shoot when play resumes; a movement key held through the pause still moves', () => {
  const { game, keyboard, down } = paused();
  down('Space'); down('KeyD');
  assert.equal(pauseKey(game, 'Space'), 'resume');
  setPaused(game, keyboard, false);
  assert.deepEqual([keyboard.intent().shoot, keyboard.intent().moveX], [false, 1]);
  down('Space');                                                          // its auto-repeat is still ignored
  assert.equal(keyboard.intent().shoot, false);
});

test('quitting leaves a match of the start menu\'s size waiting', () => {
  const { game, keyboard } = paused(); game.menu = createMenu(); game.menu.size = 5;
  const made = [];
  quitToMenu(game, keyboard, size => { made.push(size); return createMatch(9, size); });
  assert.deepEqual([made, game.state.players.length, game.state.phase], [[5], 10, 'start']);
});

test('in Substitutions the keys 6, 7 and 8 pick the three newest players', () => {
  const { game } = paused();
  open(game, 'subs');
  pauseKey(game, 'Digit8');
  assert.equal(game.pick, 7);
  pauseKey(game, 'Digit2');
  assert.deepEqual([game.pick, game.state.subQueue], [null, [{ team: 0, out: 1, in: 7 }]]);
  pauseKey(game, 'Digit6'); pauseKey(game, 'Digit7');                       // two bench players: nothing to swap
  assert.equal(game.state.subQueue.length, 1);
});

// ---------- the Keys panel ----------

test('the Keys row of the pause Settings opens the Keys panel; a key set there is reported; Escape goes back, never resumes', () => {
  const { game } = paused(), table = createKeys();
  open(game, 'settings');
  game.pauseMenu.row = PAUSE.settings.indexOf('keys');
  assert.equal(pauseKey(game, 'Enter', table), null);
  assert.deepEqual([at(game), pauseRows(game.pauseMenu)], [['keys', 0], KEY_ROWS]);
  game.pauseMenu.row = KEY_ROWS.indexOf('fade');
  pauseKey(game, 'Enter', table);
  assert.equal(game.pauseMenu.listening, true);
  assert.equal(pauseKey(game, 'Escape', table), null);               // stops waiting; still paused, still on the panel
  assert.deepEqual([game.pauseMenu.panel, game.pauseMenu.listening], ['keys', false]);
  pauseKey(game, 'Enter', table);
  assert.equal(pauseKey(game, 'KeyP', table), 'keys');
  assert.equal(table.fade, 'KeyP');
  assert.equal(pauseKey(game, 'Escape', table), null);
  assert.deepEqual([game.pauseMenu.panel, PAUSE.settings[game.pauseMenu.row]], ['settings', 'keys']);
});

test('in the Keys panel the keys of Substitutions do nothing', () => {
  const { game } = paused(), table = createKeys();
  open(game, 'settings'); game.pauseMenu.row = PAUSE.settings.indexOf('keys'); pauseKey(game, 'Enter', table);
  const autoSubs = [...game.state.autoSubs];
  pauseKey(game, 'KeyA', table); pauseKey(game, 'Digit1', table);
  assert.deepEqual([game.state.autoSubs, game.pick], [autoSubs, null]);
});

test('pausing again while the Keys panel waited for a key leaves nothing waiting', () => {
  const { game, keyboard } = paused(), table = createKeys();
  open(game, 'settings'); game.pauseMenu.row = PAUSE.settings.indexOf('keys'); pauseKey(game, 'Enter', table); pauseKey(game, 'Enter', table);
  assert.equal(game.pauseMenu.listening, true);
  setPaused(game, keyboard, false); setPaused(game, keyboard, true);
  assert.deepEqual([game.pauseMenu.panel, game.pauseMenu.listening], ['main', false]);
});
