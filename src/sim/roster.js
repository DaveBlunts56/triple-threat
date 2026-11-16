import { styled } from './styles.js';
import { foulTrouble } from './coach.js';

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
  const off = state.rosters[player.team][player.person];
  off.manual = false;   // whoever comes off is the computer's to pick again
  off.streak = 0;       // and his streak is over
  player.person = person;
  state.rosters[player.team][person].onAt = state.rosters[player.team][person].secs;   // his stint starts now
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
    if (styled(state, 'coach.rotation') === 'plan') { if (state.planned[team] !== state.stoppages) { rotate(state, team, players); state.planned[team] = state.stoppages; } continue; }
    for (const p of players) {
      const person = roster[p.person];
      if (person.manual) continue;   // your own choice stands until you take him off or he fouls out
      const tired = person.energy < styled(state, 'stamina.subOut'), inTrouble = person.fouls === state.foulLimit - 1;
      if (!tired && !inTrouble) continue;
      const sub = freshest(b => b.energy > styled(state, 'stamina.subIn') && (tired || b.fouls < person.fouls));
      if (sub !== undefined) substitute(state, p.id, sub);
    }
  }
}

// ---------- the rotation (Simulation's coach; Arcade substitutes by energy, above) ----------

// Minutes in a 48-minute game a coach means each of his players to play, by his place in the rotation: the starters
// (the first `size` rows) by how good they are around 35, then the bench in roster order. Scaled to the match's length,
// in seconds. For three a side the court's minutes are shared the same way, by the same shares.
export function rotationPlan(state, team) {
  const roster = state.rosters[team], size = state.size, total = 4 * state.quarterLength * size;
  const shares = roster.map((p, row) => (row < size ? 35 + (overallOf(p) - 84) / 3 : [25, 24, 16, 10, 8][row - size] ?? 6));
  const sum = shares.reduce((a, b) => a + b, 0);
  return shares.map(share => (share / sum) * total);
}
const overallOf = person => { const r = Object.values(person.ratings).sort((a, b) => b - a).slice(0, 5); return r.reduce((a, b) => a + b, 0) / 5; };

// Seconds of a stint before a coach wants a man rested, per 12-minute quarter: a starter about 8, anyone else 6.
const STINT = Object.freeze({ starter: 8 * 60, bench: 6 * 60 });

// One stoppage's substitutions for `team` by its coach's rotation: who must sit (foul trouble, too tired, a stint
// played, his starters out of a blowout) and who comes on for him (the rested man furthest below his minutes, a
// starter to begin a half or close a close game).
function rotate(state, team, players) {
  const roster = state.rosters[team], scale = state.quarterLength / 720, plan = rotationPlan(state, team);
  const starter = row => row < state.size;
  const last = state.quarter >= 4, left = state.gameClock, lead = state.score[team] - state.score[1 - team];
  const late = last && left <= 300 * scale, garbage = late && Math.abs(lead) >= 20, closing = late && !garbage && Math.abs(lead) < 10;
  const halfStart = (state.phase === 'quarterEnd' && state.quarter === 2) || (state.quarter === 3 && left >= state.quarterLength - 1);
  const rested = row => roster[row].energy >= styled(state, 'stamina.subIn');
  const usable = row => !foulTrouble(state, roster[row]) || closing;
  // How much a bench man is wanted now: a starter at a half's start or in a close finish, a reserve in a blowout,
  // otherwise whoever is furthest below his minutes; never one in foul trouble unless the game is on the line.
  const want = row => (garbage ? (starter(row) ? -1e6 : 0) : (closing || halfStart) && starter(row) ? 1e6 : 0) + (plan[row] - roster[row].secs) + 100 * roster[row].energy;
  for (const p of players) {
    const person = roster[p.person];
    if (person.manual) continue;   // your own choice stands until you take him off or he fouls out
    const stint = person.secs - (person.onAt ?? 0);
    const sit = (foulTrouble(state, person) && !closing) || person.energy < styled(state, 'stamina.subOut')
      || (garbage && starter(p.person)) || ((closing || halfStart) && !starter(p.person))
      || (!closing && stint >= (starter(p.person) ? STINT.starter : STINT.bench) * scale);
    if (!sit) continue;
    const options = benchOf(state, team).filter(row => rested(row) && usable(row) && !(garbage && starter(row)));
    if (!options.length) continue;
    const best = options.reduce((a, b) => (want(b) > want(a) ? b : a));
    // A tired or troubled man always goes; a man whose stint is up only for someone the coach wants more.
    if (foulTrouble(state, person) || person.energy < styled(state, 'stamina.subOut') || want(best) > want(p.person) - 60) substitute(state, p.id, best);
  }
}
