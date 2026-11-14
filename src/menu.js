import { startMatch } from './sim/rules.js';

export const MENU = Object.freeze({ main: ['play', 'mode', 'teams', 'controls', 'settings'], settings: ['quality', 'autoSubs'] });

// size: the mode chosen: 3 for 3 on 3, 5 for 5 on 5.
export const createMenu = () => ({ panel: 'main', row: 0, autoSubs: true, size: 3, from: 0 });

export const menuRows = menu => MENU[menu.panel] ?? [];

// One key on the menu. Returns 'play' or 'quality' when the page has something to do, else null.
export function menuKey(menu, code) {
  const rows = menuRows(menu);
  if (code === 'ArrowDown' || code === 'KeyS') { if (rows.length) menu.row = (menu.row + 1) % rows.length; }
  else if (code === 'ArrowUp' || code === 'KeyW') { if (rows.length) menu.row = (menu.row + rows.length - 1) % rows.length; }
  else if (code === 'Enter' || code === 'Space') {
    const choice = rows[menu.row];
    if (menu.panel === 'main') {
      if (choice === 'play') return 'play';
      if (choice === 'mode') { menu.size = menu.size === 3 ? 5 : 3; return null; }
      menu.from = menu.row; menu.panel = choice; menu.row = 0;
    } else if (choice === 'quality') return 'quality';
    else if (choice === 'autoSubs') menu.autoSubs = !menu.autoSubs;
  } else if ((code === 'Escape' || code === 'Backspace') && menu.panel !== 'main') {
    menu.panel = 'main'; menu.row = menu.from;
  }
  return null;
}

// The mouse is over row `row` of the panel shown.
export function menuPoint(menu, row) {
  if (row >= 0 && row < menuRows(menu).length) menu.row = row;
}

// Whether the mouse may act on row `row` of the panel shown: only before the match, and only on a row the panel has.
export const menuHasRow = (game, row) => game.state.phase === 'start' && row < menuRows(game.menu).length;

// Starts play from the menu or the final screen. `game` is { state, menu, ... }.
export function startFromMenu(game, keyboard, newMatch) {
  // A new match when the last one is over, or when the one waiting is not of the size the menu now shows.
  if (game.state.phase === 'final' || game.state.size !== game.menu.size) game.state = newMatch(game.menu.size);
  startMatch(game.state);
  game.state.autoSubs[0] = game.menu.autoSubs;
  keyboard.drop();   // a key still held stays unseen in the match, through the jump ball, until it is let go
}
