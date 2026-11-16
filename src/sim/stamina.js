import { RATE, STAMINA } from './tuning.js';
import { drop } from './ratings.js';
import { personOf } from './state.js';

// 1 at or above STAMINA.fadeBelow, falling in a straight line to `min` at zero energy.
const fade = (energy, min) => (energy >= STAMINA.fadeBelow ? 1 : min + (1 - min) * (energy / STAMINA.fadeBelow));
export const speedFactor = energy => fade(energy, STAMINA.minSpeed);
export const shotFactor = energy => fade(energy, STAMINA.minShot);

const clamp01 = v => Math.min(1, Math.max(0, v));

// Drains the players who are running, rests the ones standing and everyone on the bench.
export function tire(state, intents, dt) {
  const onCourt = new Set(), t = state.styleTable;
  const [rest, sprint, run, bench] = [t.get('stamina.rest'), t.get('stamina.sprint'), t.get('stamina.run'), t.get('stamina.bench')];   // read once a step: this runs for everyone, every step
  state.players.forEach((p, i) => {
    const person = personOf(state, p);
    onCourt.add(person);
    // A player with more stamina tires more slowly; everyone rests alike.
    const rate = Math.hypot(p.vx, p.vz) < STAMINA.restSpeed ? rest : -(intents[i].sprint ? sprint : run) * drop(person.ratings.stamina, RATE.tire);
    person.energy = clamp01(person.energy + rate * dt);
  });
  for (const person of state.rosters.flat()) if (!onCourt.has(person)) person.energy = clamp01(person.energy + bench * dt);
}

export function spend(state, player, amount) {
  const person = personOf(state, player);
  person.energy = Math.max(0, person.energy - amount);
}
