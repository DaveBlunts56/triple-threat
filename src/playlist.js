import { PLAYS, playsFor, callPlay } from './sim/plays.js';
import { DEFAULT_KEYS, keyOf } from './keys.js';

// The keys that call the plays, in the list's order, and what each row shows for its key: 1 to 9, 0, then - and =.
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];
const LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

// The play list: a quick list you open in play to call a play for your team. The match goes on while it is open.
export const createPlayList = () => ({ open: false });

// The list's rows for a match of this size: the key to press and the play's name.
export const playListRows = state => playsFor(state.size).map((key, i) => `${LABELS[i]} · ${PLAYS[key].name}`);

// A key pressed in play. The plays key (T unless changed) opens and closes the list; while it is open a number (or - or =) calls that play and closes it, and
// Escape or Backspace closes it. Returns whether the key was the list's, so the page does nothing else with it.
export function playListKey(game, code, keys = DEFAULT_KEYS) {
  const list = game.playList;
  if (keyOf(code) === keys.plays) { list.open = !list.open; return true; }
  if (!list.open) return false;
  const key = playsFor(game.state.size)[DIGITS.indexOf(code)];
  if (key) callPlay(game.state, 0, key);
  if (key || code === 'Escape' || code === 'Backspace') { list.open = false; return true; }
  return false;
}
