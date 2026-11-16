// How sweaty each player is, from 0 (dry) to 1, kept by the renderer for his skin and jersey (see materials.js); the
// match never reads it. On court it rises with his effort (the energy he loses) and slowly with time; on the bench it
// dries. It follows the match's own clock, so a pause or a replay changes nothing, and a new match starts dry.
import { courtPeople, personName, sideId } from './checks.js';

// perEnergy: sweat for all of a player's energy spent; perSecond: on court, by time alone (full after ten minutes);
// dry: lost each second on the bench (dry after five minutes).
export const SWEAT = Object.freeze({ perEnergy: 3, perSecond: 1 / 600, dry: 1 / 300 });

// { update(state), of(name), reset() }: update once a frame with the match (or what is drawn of it); `of` the sweat of
// the person named as people.js names him (player-<team>-<number>).
export function createSweat() {
  const level = new Map(), energy = new Map();
  let seed = null, time = 0;
  const reset = () => { level.clear(); energy.clear(); seed = null; time = 0; };
  return {
    update(state) {
      if (state.seed !== seed) { reset(); seed = state.seed; time = state.time; }
      const passed = state.time - time;
      if (!(passed > 0)) return;
      time = state.time;
      const playing = new Set(courtPeople(state));
      state.rosters.forEach((team, t) => team.forEach(row => {
        const name = personName(sideId(state, t), row.number), spent = Math.max(0, (energy.get(name) ?? row.energy) - row.energy);
        const now = level.get(name) ?? 0;
        const next = playing.has(name) ? now + passed * SWEAT.perSecond + spent * SWEAT.perEnergy : now - passed * SWEAT.dry;
        level.set(name, Math.min(1, Math.max(0, next)));
        energy.set(name, row.energy);
      }));
    },
    of: name => level.get(name) ?? 0,
    reset,
  };
}
