import { queueSub } from './sim/roster.js';

const ROWS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];

export const inPlay = state => state.phase !== 'start' && state.phase !== 'final';

// Pauses or resumes. `game` is { state, paused, pick }; pick is the roster row chosen first on the pause screen.
export function setPaused(game, keyboard, on) {
  game.paused = on && inPlay(game.state);
  game.pick = null;
  keyboard.intent();   // forget keys tapped on the pause screen, so they do not act when play resumes
}

// A key pressed on the pause screen: 1 to 5 pick two of your players to swap at the next stoppage;
// A turns automatic substitutions for your team on or off.
export function pauseKey(game, code) {
  const row = ROWS.indexOf(code);
  if (code === 'KeyA') game.state.autoSubs[0] = !game.state.autoSubs[0];
  else if (row < 0) return;
  else if (game.pick === null) game.pick = row;
  else { if (game.pick !== row) queueSub(game.state, 0, game.pick, row); game.pick = null; }
}
