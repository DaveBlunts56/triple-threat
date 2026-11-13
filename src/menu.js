import { startMatch } from './sim/rules.js';

export const MENU = Object.freeze({ main: ['play', 'teams', 'controls', 'settings'], settings: ['quality', 'autoSubs'] });

export const createMenu = () => ({ panel: 'main', row: 0, autoSubs: true, from: 0 });

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
  if (game.state.phase === 'final') game.state = newMatch();
  startMatch(game.state);
  game.state.autoSubs[0] = game.menu.autoSubs;
  game.state.players[game.state.controlled].prev = keyboard.intent();   // a key still down is not a fresh press
}
