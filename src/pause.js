import { queueSub } from './sim/roster.js';

const ROWS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];   // one key for each of a team's eight

// The rows of each panel of the pause menu that has rows. Substitutions and Controls have none.
export const PAUSE = Object.freeze({
  main: Object.freeze(['resume', 'subs', 'controls', 'settings', 'quit']),
  settings: Object.freeze(['quality', 'autoSubs']),
  quit: Object.freeze(['stay', 'leave']),
});

export const inPlay = state => state.phase !== 'start' && state.phase !== 'final';

// panel: 'main', 'subs', 'controls', 'settings' or 'quit'. row: the highlighted row of the panel shown.
// from: the row of the main list that opened the panel.
export const createPauseMenu = () => ({ panel: 'main', row: 0, from: 0 });

export const pauseRows = menu => PAUSE[menu.panel] ?? [];

// Pauses or resumes. `game` is { state, paused, pick, pauseMenu, menu }; pick is the roster row chosen first in
// Substitutions. Pausing always starts from the top of the list.
export function setPaused(game, keyboard, on) {
  game.paused = on && inPlay(game.state);
  game.pick = null;
  game.pauseMenu = createPauseMenu();
  keyboard.intent();   // forget keys tapped on the pause screen, so they do not act when play resumes
  if (!on) keyboard.drop(['Space']);   // Space chooses on the pause menu: still held, it must not shoot as play resumes
}

// Automatic substitutions for your team, on or off: for this match, and as the start menu's choice for later ones.
function flipAutoSubs(game) {
  game.state.autoSubs[0] = !game.state.autoSubs[0];
  if (game.menu) game.menu.autoSubs = game.state.autoSubs[0];
}

// A key pressed while paused. Returns 'resume', 'quality' or 'quit' when the page has something to do, else null.
// In Substitutions, 1 to 5 pick two of your players to swap at the next stoppage and A is the automatic switch.
export function pauseKey(game, code) {
  const menu = game.pauseMenu, rows = pauseRows(menu);
  const back = () => { menu.panel = 'main'; menu.row = menu.from; game.pick = null; };
  if (menu.panel === 'subs') {
    const row = ROWS.indexOf(code);
    if (code === 'KeyA') flipAutoSubs(game);
    else if (row >= 0 && game.pick === null) game.pick = row;
    else if (row >= 0) { if (game.pick !== row) queueSub(game.state, 0, game.pick, row); game.pick = null; }
  }
  if (code === 'ArrowDown' || code === 'KeyS') { if (rows.length) menu.row = (menu.row + 1) % rows.length; }
  else if (code === 'ArrowUp' || code === 'KeyW') { if (rows.length) menu.row = (menu.row + rows.length - 1) % rows.length; }
  else if (code === 'Enter' || code === 'Space') {
    const choice = rows[menu.row];
    if (choice === 'resume') return 'resume';
    if (choice === 'quality') return 'quality';
    if (choice === 'leave') return 'quit';
    if (choice === 'autoSubs') flipAutoSubs(game);
    else if (choice === 'stay') back();
    else if (menu.panel === 'main') { menu.from = menu.row; menu.panel = choice; menu.row = 0; }
  } else if (code === 'Escape' || code === 'Backspace') {
    if (menu.panel !== 'main') back();
    else if (code === 'Escape') return 'resume';
  }
  return null;
}

// Does the panel shown have row `row`, while the game is paused? The mouse only acts on such a row.
export const pauseHasRow = (game, row) => game.paused && row >= 0 && row < pauseRows(game.pauseMenu).length;

// The mouse is over row `row` of the panel shown.
export function pausePoint(game, row) {
  if (pauseHasRow(game, row)) game.pauseMenu.row = row;
}

// Leaves the match for the start menu: a new match waiting to begin, the menu back on its main list with its own
// choices kept, and the keys held right now ignored until they are let go.
export function quitToMenu(game, keyboard, newMatch) {
  game.state = newMatch(game.menu?.size);
  setPaused(game, keyboard, false);
  if (game.menu) Object.assign(game.menu, { panel: 'main', row: 0 });
  keyboard.drop();
}
