import { movePlayers, applyActions, carryBall } from './players.js';
import { stepBall } from './ball.js';
import { applyRules } from './rules.js';

const NOTHING = Object.freeze({ hitFloor: false, hitRim: false, hitBoard: false, scored: 0 });

// Advances the whole match by one fixed step. `intents` holds one Intent per player, by id.
export function step(state, intents, dt) {
  if (state.phase === 'start' || state.phase === 'final') return;
  // While play is stopped players may reposition, but nobody can act on the ball and it cannot score.
  const stopped = state.phase === 'dead' || state.phase === 'quarterEnd';

  movePlayers(state, intents, dt);
  if (!stopped) applyActions(state, intents, dt);

  let events = NOTHING;
  if (state.ball.holder !== null) carryBall(state, dt);
  else events = stepBall(state.ball, dt);

  applyRules(state, stopped ? NOTHING : events, dt);
  state.time += dt;
}
