import { movePlayers, applyActions, carryBall } from './players.js';
import { stepBall } from './ball.js';
import { applyRules } from './rules.js';
import { tire } from './stamina.js';

const NOTHING = Object.freeze({ hitFloor: false, hitRim: false, hitBoard: false, scored: 0 });

// Advances the whole match by one fixed step. `intents` holds one Intent per player, by id.
export function step(state, intents, dt) {
  if (state.phase === 'start' || state.phase === 'final') return;
  // While play is stopped players may reposition, but nobody can act on the ball and it cannot score.
  const stopped = state.phase === 'dead' || state.phase === 'quarterEnd';

  // The human's held keys follow them to whichever player they now control,
  // so a key still down across a hand-off is not read as a fresh press by the new player.
  if (state.controlled !== state.lastControlled) {
    state.players[state.controlled].prev = { ...state.players[state.lastControlled].prev };
    state.lastControlled = state.controlled;
  }

  movePlayers(state, intents, dt);
  tire(state, intents, dt);
  if (!stopped) applyActions(state, intents, dt);
  else state.players.forEach((p, i) => { p.prev = { ...intents[i] }; });   // keep key state current for when play resumes

  let events = NOTHING;
  if (state.ball.holder !== null) carryBall(state, dt);
  else events = stepBall(state.ball, dt);

  applyRules(state, stopped ? NOTHING : events, dt);
  state.time += dt;
}
