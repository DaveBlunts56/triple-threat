import { movePlayers, applyActions, carryBall } from './players.js';
import { stepBall } from './ball.js';
import { applyRules } from './rules.js';
import { tire } from './stamina.js';
import { emptyEvents, emptyIntent } from './state.js';
import { screenSwitches } from './matchups.js';
import { stepPlays } from './plays.js';

// Advances the whole match by one fixed step. `intents` holds one Intent per player, by id.
export function step(state, intents, dt) {
  if (state.phase === 'start' || state.phase === 'final') return;
  // While play is stopped players may reposition, but nobody can act on the ball and it cannot score.
  const stopped = state.phase === 'dead' || state.phase === 'quarterEnd';
  // Nobody moves or acts during the tip (the rules lift the jumpers), or during free throws
  // until the last attempt has left the shooter's hand.
  const frozen = state.phase === 'jumpBall' || (state.phase === 'freeThrow' && !state.freeThrow.live);

  // The human's held keys follow them to whichever player they now control,
  // so a key still down across a hand-off is not read as a fresh press by the new player.
  if (state.controlled !== state.lastControlled) {
    state.players[state.controlled].prev = { ...state.players[state.lastControlled].prev };
    state.lastControlled = state.controlled;
  }

  // Everything that happened this step, for the rules to judge.
  const events = emptyEvents();
  events.contacts = movePlayers(state, frozen ? intents.map(emptyIntent) : intents, dt);   // frozen players still come down from a jump
  if (state.phase === 'live') screenSwitches(state, events.contacts, dt);
  tire(state, intents, dt);
  if (!stopped && !frozen) Object.assign(events, applyActions(state, intents, dt));
  else state.players.forEach((p, i) => { p.prev = { ...intents[i] }; });   // keep key state current for when play resumes

  if (state.ball.holder !== null) carryBall(state, dt);
  else if (state.phase !== 'jumpBall' || state.phaseT <= 0) Object.assign(events, stepBall(state.ball, dt));   // the referee holds the ball until the toss

  applyRules(state, stopped ? emptyEvents() : events, dt, intents);
  stepPlays(state, dt);
  state.time += dt;
}
