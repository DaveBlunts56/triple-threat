import { PLAYER } from './tuning.js';

// The violation in this step, if any: what was called and the team that committed it.
export function findViolation(state, events) {
  const by = (kind, id) => ({ kind, team: state.players[id].team });
  const holder = state.players[state.ball.holder];
  if (events.travel !== null) return by('travel', events.travel);
  if (holder?.held && holder.steps > PLAYER.gatherDist) return by('travel', holder.id);
  if (events.doubleDribble !== null) return by('doubleDribble', events.doubleDribble);
  return null;
}
