import { startMatch } from './sim/rules.js';
import { nextDifficulty, nextMinutes } from './sim/tuning.js';
import { setLength } from './sim/state.js';
import { DEFAULT_KEYS, KEY_ROWS, keysPanelKey } from './keys.js';
import { DEFAULT_PREFS } from './prefs.js';

export const MENU = Object.freeze({ main: ['play', 'mode', 'teams', 'controls', 'settings'], settings: ['quality', 'autoSubs', 'camera', 'difficulty', 'quarter', 'commentary', 'replays', 'sound', 'keys'], keys: KEY_ROWS });

// size: the mode chosen: 3 for 3 on 3, 5 for 5 on 5. difficulty: the level chosen, one of DIFFICULTY.order.
// minutes: the length of a quarter chosen, one of MATCH.minutes. listening: on the Keys panel, the next key pressed
// goes on the highlighted action. The four choices start as `prefs` has them: what was saved the last time.
export const createMenu = (prefs = DEFAULT_PREFS) => ({ panel: 'main', row: 0, autoSubs: prefs.autoSubs, size: prefs.size,
  difficulty: prefs.difficulty, minutes: prefs.minutes, from: 0, listening: false });

export const menuRows = menu => MENU[menu.panel] ?? [];

// The settings the page itself changes when their row is chosen: it knows the renderer, the voice and what is saved.
export const PAGE_ROWS = Object.freeze(['quality', 'camera', 'commentary', 'replays', 'sound']);

// One key on the menu. Returns 'play', 'quality', 'camera', 'commentary' or 'keys' (the keys were changed) when the page
// has something to do, else null. `keys` is the table the Keys panel changes.
export function menuKey(menu, code, keys = { ...DEFAULT_KEYS }) {
  if (menu.panel === 'keys') {
    const did = keysPanelKey(menu, code, keys);
    if (did === 'back') { menu.panel = 'settings'; menu.row = MENU.settings.indexOf('keys'); }
    return did === 'changed' ? 'keys' : null;
  }
  const rows = menuRows(menu);
  if (code === 'ArrowDown' || code === 'KeyS') { if (rows.length) menu.row = (menu.row + 1) % rows.length; }
  else if (code === 'ArrowUp' || code === 'KeyW') { if (rows.length) menu.row = (menu.row + rows.length - 1) % rows.length; }
  else if (code === 'Enter' || code === 'Space') {
    const choice = rows[menu.row];
    if (menu.panel === 'main') {
      if (choice === 'play') return 'play';
      if (choice === 'mode') { menu.size = menu.size === 3 ? 5 : 3; return null; }
      menu.from = menu.row; menu.panel = choice; menu.row = 0;
    } else if (PAGE_ROWS.includes(choice)) return choice;
    else if (choice === 'autoSubs') menu.autoSubs = !menu.autoSubs;
    else if (choice === 'difficulty') menu.difficulty = nextDifficulty(menu.difficulty);
    else if (choice === 'quarter') menu.minutes = nextMinutes(menu.minutes);
    else if (choice === 'keys') Object.assign(menu, { panel: 'keys', row: 0, listening: false });
  } else if ((code === 'Escape' || code === 'Backspace') && menu.panel !== 'main') {
    menu.panel = 'main'; menu.row = menu.from;
  }
  return null;
}

// The mouse is over row `row` of the panel shown.
export function menuPoint(menu, row) {
  if (row >= 0 && row < menuRows(menu).length && !menu.listening) menu.row = row;
}

// Whether the mouse may act on row `row` of the panel shown: only before the match, and only on a row the panel has.
export const menuHasRow = (game, row) => game.state.phase === 'start' && row < menuRows(game.menu).length;

// Starts play from the menu or the final screen. `game` is { state, menu, ... }.
export function startFromMenu(game, keyboard, newMatch) {
  // A new match when the last one is over, or when the one waiting is not of the size the menu now shows.
  if (game.state.phase === 'final' || game.state.size !== game.menu.size) game.state = newMatch(game.menu.size);
  setLength(game.state, game.menu.minutes);
  startMatch(game.state);
  game.state.autoSubs[0] = game.menu.autoSubs;
  game.state.difficulty = game.menu.difficulty;
  keyboard.drop();   // a key still held stays unseen in the match, through the jump ball, until it is let go
}
