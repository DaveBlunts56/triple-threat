import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, ACTION_WORDS, DEFAULT_KEYS, KEY_ROWS, actionOf, bind, bindable, createKeys, createKeysPanel, keyLabel, keyOf,
  keysPanelKey, resetKeys, savedKeys } from '../src/keys.js';

const distinct = keys => new Set(ACTIONS.map(a => keys[a])).size === ACTIONS.length;

test('every action has a key and words, and no two share a key', () => {
  for (const action of ACTIONS) { assert.ok(DEFAULT_KEYS[action], action); assert.ok(ACTION_WORDS[action], action); }
  assert.equal(ACTIONS.length, 19);
  assert.ok(distinct(DEFAULT_KEYS));
  for (const action of ACTIONS) assert.ok(bindable(DEFAULT_KEYS[action]), action);
});

test('an action is put on a free key', () => {
  const keys = createKeys();
  assert.equal(bind(keys, 'cross', 'KeyH'), true);
  assert.equal(keys.cross, 'KeyH');
  assert.equal(actionOf(keys, 'KeyJ'), null);
});

test('a key in use changes places with the one being set', () => {
  const keys = createKeys();
  assert.equal(bind(keys, 'cross', 'KeyK'), true);
  assert.equal(keys.cross, 'KeyK');
  assert.equal(keys.legs, 'KeyJ');
  assert.ok(distinct(keys));
});

test('after any run of changes every action still has a key of its own', () => {
  const keys = createKeys(), pool = ['KeyW', 'KeyH', 'Space', 'Shift', 'Digit1', 'ArrowUp', 'KeyJ', 'Slash', 'Tab', 'KeyU', 'KeyQ'];
  let n = 7;
  for (let i = 0; i < 50; i++) {
    n = (n * 31 + 11) % 997;
    bind(keys, ACTIONS[n % ACTIONS.length], pool[(n >> 3) % pool.length]);
    assert.ok(distinct(keys), `after change ${i}`);
  }
});

test('keys the menus and the browser need cannot be given away, nor an action that does not exist a key', () => {
  for (const key of ['Escape', 'Enter', 'Backspace', 'ControlLeft', 'AltLeft', 'MetaLeft', 'F5', 'CapsLock', '', undefined, 7]) {
    const keys = createKeys();
    assert.equal(bind(keys, 'cross', key), false, String(key));
    assert.deepEqual(keys, DEFAULT_KEYS);
  }
  const keys = createKeys();
  assert.equal(bind(keys, 'fly', 'KeyX'), false);
  assert.deepEqual(keys, DEFAULT_KEYS);
});

test('the two Shift keys are one key', () => {
  assert.equal(keyOf('ShiftRight'), 'Shift');
  assert.equal(keyOf('ShiftLeft'), 'Shift');
  assert.equal(keyOf('KeyW'), 'KeyW');
  assert.equal(actionOf(createKeys(), 'ShiftRight'), 'sprint');
  assert.equal(actionOf(createKeys(), 'ShiftLeft'), 'sprint');
});

test('saved keys that make no sense are passed over one by one', () => {
  assert.deepEqual(createKeys({ cross: 'KeyH', fly: 'KeyX', legs: 7, back: 'Escape' }), { ...DEFAULT_KEYS, cross: 'KeyH' });
  assert.ok(distinct(createKeys({ cross: 'KeyK', legs: 'KeyK' })));
  assert.deepEqual(createKeys(null), DEFAULT_KEYS);
  assert.deepEqual(createKeys('x'), DEFAULT_KEYS);
});

test('only what differs from the defaults is saved, and it comes back the same', () => {
  assert.deepEqual(savedKeys(createKeys()), {});
  const keys = createKeys();
  bind(keys, 'cross', 'KeyH'); bind(keys, 'shoot', 'KeyW'); bind(keys, 'fade', 'Slash');
  assert.deepEqual(createKeys(savedKeys(keys)), keys);
});

test('what each key is called', () => {
  assert.equal(keyLabel('KeyW'), 'W');
  assert.equal(keyLabel('Digit0'), '0');
  assert.equal(keyLabel('ArrowLeft'), '←');
  assert.equal(keyLabel('Slash'), '/');
  assert.equal(keyLabel('Space'), 'Space');
  assert.equal(keyLabel('Shift'), 'Shift');
});

// ---------- the panel ----------

const at = action => ({ row: KEY_ROWS.indexOf(action), listening: false });

test('the panel has a row for every action and one to reset', () => {
  assert.equal(KEY_ROWS.length, 20);
  assert.equal(KEY_ROWS[19], 'reset');
  assert.deepEqual(createKeysPanel(), { row: 0, listening: false });
});

test('Enter on an action waits for a key, and the next usable key is set', () => {
  const keys = createKeys(), panel = at('cross');
  assert.equal(keysPanelKey(panel, 'Enter', keys), null);
  assert.equal(panel.listening, true);
  assert.equal(keysPanelKey(panel, 'KeyH', keys), 'changed');
  assert.equal(keys.cross, 'KeyH');
  assert.equal(panel.listening, false);
});

test('Escape while waiting leaves the key as it was and stays on the panel', () => {
  const keys = createKeys(), panel = { ...at('cross'), listening: true };
  assert.equal(keysPanelKey(panel, 'Escape', keys), null);
  assert.equal(panel.listening, false);
  assert.deepEqual(keys, DEFAULT_KEYS);
});

test('a key that cannot be used is ignored and the panel goes on waiting', () => {
  const keys = createKeys(), panel = { ...at('cross'), listening: true };
  for (const code of ['Enter', 'F5', 'ControlLeft', 'Backspace']) {
    assert.equal(keysPanelKey(panel, code, keys), null, code);
    assert.equal(panel.listening, true, code);
  }
  assert.deepEqual(keys, DEFAULT_KEYS);
});

test('while waiting, the keys that move the bar are taken as the new key, not as moves', () => {
  const keys = createKeys(), panel = { ...at('cross'), listening: true };
  assert.equal(keysPanelKey(panel, 'KeyW', keys), 'changed');
  assert.equal(keys.cross, 'KeyW');
  assert.equal(keys.up, 'KeyJ');
  assert.equal(panel.row, KEY_ROWS.indexOf('cross'));
  keysPanelKey(panel, 'ArrowDown', keys);
  assert.equal(panel.row, KEY_ROWS.indexOf('legs'));   // the bar still moves afterwards
});

test('a Shift key pressed while waiting is set as Shift', () => {
  const keys = createKeys(), panel = { ...at('cross'), listening: true };
  assert.equal(keysPanelKey(panel, 'ShiftRight', keys), 'changed');
  assert.equal(keys.cross, 'Shift');
  assert.equal(keys.sprint, 'KeyJ');
});

test('the bar goes round the rows', () => {
  const keys = createKeys(), panel = createKeysPanel();
  keysPanelKey(panel, 'ArrowUp', keys);
  assert.equal(panel.row, 19);
  keysPanelKey(panel, 'KeyS', keys);
  assert.equal(panel.row, 0);
});

test('the last row puts every key back', () => {
  const keys = createKeys({ cross: 'KeyH', shoot: 'KeyW' }), panel = at('reset');
  assert.equal(keysPanelKey(panel, 'Enter', keys), 'changed');
  assert.deepEqual(keys, DEFAULT_KEYS);
  assert.equal(panel.listening, false);
});

test('Escape or Backspace leaves the panel', () => {
  const keys = createKeys();
  assert.equal(keysPanelKey(createKeysPanel(), 'Escape', keys), 'back');
  assert.equal(keysPanelKey(createKeysPanel(), 'Backspace', keys), 'back');
});

test('resetKeys keeps the same object', () => {
  const keys = createKeys({ cross: 'KeyH' }), same = keys;
  resetKeys(keys);
  assert.equal(keys, same);
  assert.deepEqual(keys, DEFAULT_KEYS);
});

// ---------- the dunk key ----------

test('the dunk is on R, and keys saved before it existed still give every action one key of its own', () => {
  assert.equal(createKeys().dunk, 'KeyR');
  assert.deepEqual(createKeys({}), DEFAULT_KEYS);                       // a save with no dunk in it
  const taken = createKeys({ steal: 'KeyR' });                          // a save that had already put something on R
  assert.equal(taken.steal, 'KeyR');
  assert.notEqual(taken.dunk, 'KeyR');
  assert.ok(distinct(taken) && ACTIONS.every(action => bindable(taken[action])));
  assert.deepEqual(savedKeys(createKeys()), {});
  const keys = createKeys(); bind(keys, 'dunk', 'KeyH');
  assert.deepEqual(savedKeys(keys), { dunk: 'KeyH' });
});
