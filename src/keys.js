// Which key does what, and the panel that changes it. `keys` is { action: key }, where a key is a keyboard code
// ('KeyW', 'Space') except that both Shift keys are the one key 'Shift'. Every action always has a key and no key has
// two actions.
export const ACTIONS = Object.freeze(['up', 'left', 'down', 'right', 'sprint', 'shoot', 'pass', 'steal', 'hold',
  'cross', 'legs', 'back', 'stepBack', 'fade', 'dunk', 'plays', 'timeout', 'camera', 'quality']);

export const DEFAULT_KEYS = Object.freeze({ up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD', sprint: 'Shift', shoot: 'Space',
  pass: 'KeyE', steal: 'KeyQ', hold: 'KeyF', cross: 'KeyJ', legs: 'KeyK', back: 'KeyL', stepBack: 'KeyI', fade: 'KeyU',
  dunk: 'KeyR', plays: 'KeyT', timeout: 'KeyZ', camera: 'KeyC', quality: 'KeyG' });

export const ACTION_WORDS = Object.freeze({ up: 'Move up', left: 'Move left', down: 'Move down', right: 'Move right', sprint: 'Sprint',
  shoot: 'Shoot / jump', pass: 'Pass / switch player', steal: 'Steal', hold: 'Hold the ball', cross: 'Crossover',
  legs: 'Between the legs', back: 'Behind the back', stepBack: 'Step-back', fade: 'Post fade', dunk: 'Dunk', plays: 'Plays',
  timeout: 'Timeout', camera: 'Camera', quality: 'Quality' });

// The key a keyboard code stands for: the two Shift keys are one.
export const keyOf = code => (code === 'ShiftLeft' || code === 'ShiftRight' ? 'Shift' : code);

const MARKS = { Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',',
  Period: '.', Slash: '/', Backquote: '`' };
const ARROWS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

// May an action be put on `key`? Letters, digits, punctuation, Space, Shift, Tab and the arrows. Not Escape, Enter or
// Backspace, which the menus need; not Ctrl or Alt, which with a letter are the browser's own shortcuts.
export const bindable = key => typeof key === 'string'
  && (/^Key[A-Z]$/.test(key) || /^Digit[0-9]$/.test(key) || key === 'Space' || key === 'Shift' || key === 'Tab' || key in ARROWS || key in MARKS);

// What a key is called on the page.
export const keyLabel = key => ARROWS[key] ?? MARKS[key] ?? (/^Key[A-Z]$/.test(key) ? key.slice(3) : /^Digit[0-9]$/.test(key) ? key.slice(5) : key);

// Puts `action` on `key`. If another action had that key, it takes the key this one had, so nothing is left without
// one. Returns whether anything was done: not for a key that cannot be used, or an action there is not.
export function bind(keys, action, key) {
  if (!ACTIONS.includes(action) || !bindable(key)) return false;
  const other = ACTIONS.find(a => keys[a] === key);
  if (other && other !== action) keys[other] = keys[action];
  keys[action] = key;
  return true;
}

export const resetKeys = keys => { Object.assign(keys, DEFAULT_KEYS); };

// The keys as they are after the saved changes `saved` ({ action: key }) are made to the defaults, one at a time.
// A saved entry that makes no sense is passed over.
export function createKeys(saved = {}) {
  const keys = { ...DEFAULT_KEYS };
  for (const action of ACTIONS) if (Object.hasOwn(saved ?? {}, action)) bind(keys, action, saved[action]);
  return keys;
}

// What to save: only the actions whose key is not the default.
export const savedKeys = keys => Object.fromEntries(ACTIONS.filter(a => keys[a] !== DEFAULT_KEYS[a]).map(a => [a, keys[a]]));

// The action on the key with keyboard code `code`, or null.
export const actionOf = (keys, code) => ACTIONS.find(a => keys[a] === keyOf(code)) ?? null;

// ---------- the Keys panel, the same in the start menu and the pause menu ----------

export const KEY_ROWS = Object.freeze([...ACTIONS, 'reset']);

// row: the highlighted row. listening: the next key pressed goes on that row's action.
export const createKeysPanel = () => ({ row: 0, listening: false });

// One key on the Keys panel. Returns 'changed' when the keys are different now, 'back' to leave the panel, else null.
export function keysPanelKey(panel, code, keys) {
  if (panel.listening) {
    if (code === 'Escape') panel.listening = false;
    else if (bind(keys, KEY_ROWS[panel.row], keyOf(code))) { panel.listening = false; return 'changed'; }
    return null;   // a key that cannot be used: still waiting for one that can
  }
  if (code === 'ArrowDown' || code === 'KeyS') panel.row = (panel.row + 1) % KEY_ROWS.length;
  else if (code === 'ArrowUp' || code === 'KeyW') panel.row = (panel.row + KEY_ROWS.length - 1) % KEY_ROWS.length;
  else if (code === 'Enter' || code === 'Space') {
    if (KEY_ROWS[panel.row] === 'reset') { resetKeys(keys); return 'changed'; }
    panel.listening = true;
  } else if (code === 'Escape' || code === 'Backspace') return 'back';
  return null;
}
