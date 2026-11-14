import { PLAYS, playsFor, callPlay } from './sim/plays.js';

const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];

// The play list: a quick list you open in play to call a play for your team. The match goes on while it is open.
export const createPlayList = () => ({ open: false });

// The list's rows for a match of this size: the key to press and the play's name.
export const playListRows = state => playsFor(state.size).map((key, i) => `${(i + 1) % 10} · ${PLAYS[key].name}`);

// A key pressed in play. T opens and closes the list; while it is open a number calls that play and closes it, and
// Escape or Backspace closes it. Returns whether the key was the list's, so the page does nothing else with it.
export function playListKey(game, code) {
  const list = game.playList;
  if (code === 'KeyT') { list.open = !list.open; return true; }
  if (!list.open) return false;
  const key = playsFor(game.state.size)[DIGITS.indexOf(code)];
  if (key) callPlay(game.state, 0, key);
  if (key || code === 'Escape' || code === 'Backspace') { list.open = false; return true; }
  return false;
}
