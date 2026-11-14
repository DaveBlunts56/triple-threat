import { STAMINA } from './tuning.js';

const courtPlayers = (state, team) => state.players.filter(p => p.team === team);
const fouledOut = (state, person) => person.fouls >= state.foulLimit;

// Person indexes on court, in slot order.
export const onCourt = (state, team) => courtPlayers(state, team).map(p => p.person);

// Person indexes off court who have not fouled out.
export function benchOf(state, team) {
  const on = onCourt(state, team);
  return state.rosters[team].map((_, i) => i).filter(i => !on.includes(i) && !fouledOut(state, state.rosters[team][i]));
}

// The court player becomes `person`. He keeps his place on the floor, his slot and whoever controls him.
export function substitute(state, playerId, person) {
  const player = state.players[playerId];
  if (!benchOf(state, player.team).includes(person)) return false;
  state.rosters[player.team][player.person].manual = false;   // whoever comes off is the computer's to pick again
  player.person = person;
  return true;
}

// Queues a swap of two of a team's people, given in either order; the same pair again cancels it.
export function queueSub(state, team, a, b) {
  const on = onCourt(state, team), bench = benchOf(state, team);
  const [out, coming] = on.includes(a) ? [a, b] : [b, a];
  if (!on.includes(out) || !bench.includes(coming)) return false;
  const queued = state.subQueue.findIndex(q => q.team === team && q.out === out && q.in === coming);
  if (queued >= 0) state.subQueue.splice(queued, 1);
  else state.subQueue.push({ team, out, in: coming });
  return true;
}

// Makes every substitution that is due. Called at stoppages only.
export function applySubs(state) {
  const shooter = state.freeThrow?.shooter;   // he cannot be replaced until he has shot
  for (const team of [0, 1]) {
    const roster = state.rosters[team];
    const players = courtPlayers(state, team).filter(p => p.id !== shooter);
    // The bench player with the most energy among those `ok` allows, or undefined.
    const freshest = (ok = () => true) => benchOf(state, team).filter(i => ok(roster[i]))
      .reduce((best, i) => (best === undefined || roster[i].energy > roster[best].energy ? i : best), undefined);

    // Forced: a fouled-out player comes off whenever anyone can replace him.
    for (const p of players) {
      if (fouledOut(state, roster[p.person]) && freshest() !== undefined) substitute(state, p.id, freshest());
    }

    // Queued: a swap that involves the free-throw shooter waits for him; the rest are made or dropped.
    state.subQueue = state.subQueue.filter(q => {
      if (q.team !== team) return true;
      const p = courtPlayers(state, team).find(c => c.person === q.out);
      if (p?.id === shooter) return true;
      if (p && substitute(state, p.id, q.in)) roster[q.in].manual = true;
      return false;
    });

    if (!state.autoSubs[team]) continue;
    for (const p of players) {
      const person = roster[p.person];
      if (person.manual) continue;   // your own choice stands until you take him off or he fouls out
      const tired = person.energy < STAMINA.subOut, inTrouble = person.fouls === state.foulLimit - 1;
      if (!tired && !inTrouble) continue;
      const sub = freshest(b => b.energy > STAMINA.subIn && (tired || b.fouls < person.fouls));
      if (sub !== undefined) substitute(state, p.id, sub);
    }
  }
}
