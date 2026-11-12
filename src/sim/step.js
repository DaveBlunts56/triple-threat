import { movePlayers, applyActions, carryBall } from './players.js';
import { stepBall } from './ball.js';
import { applyRules } from './rules.js';
import { tire } from './stamina.js';
import { emptyEvents } from './state.js';

// Advances the whole match by one fixed step. `intents` holds one Intent per player, by id.
export function step(state, intents, dt) {
  if (state.phase === 'start' || state.phase === 'final') return;
  // While play is stopped players may reposition, but nobody can act on the ball and it cannot score.
  const stopped = state.phase === 'dead' || state.phase === 'quarterEnd';
  // During free throws nobody moves or acts until the last attempt has left the shooter's hand.
  const frozen = state.phase === 'freeThrow' && !state.freeThrow.live;

  // The human's held keys follow them to whichever player they now control,
  // so a key still down across a hand-off is not read as a fresh press by the new player.
  if (state.controlled !== state.lastControlled) {
    state.players[state.controlled].prev = { ...state.players[state.lastControlled].prev };
    state.lastControlled = state.controlled;
  }

  if (!frozen) movePlayers(state, intents, dt);
  tire(state, intents, dt);
  // Everything that happened this step, for the rules to judge.
  const events = emptyEvents();
  if (!stopped && !frozen) Object.assign(events, applyActions(state, intents, dt));
  else state.players.forEach((p, i) => { p.prev = { ...intents[i] }; });   // keep key state current for when play resumes

  if (state.ball.holder !== null) carryBall(state, dt);
  else Object.assign(events, stepBall(state.ball, dt));

  applyRules(state, stopped ? emptyEvents() : events, dt, intents);
  state.time += dt;
}
