import { styled } from './styles.js';
import { foulTrouble } from './coach.js';
import { overall } from './overall.js';

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
  const key = `${state.quarterLength}|${state.rosters[team].map(p => p.name).join()}`;
  if (state.plans?.[team]?.key === key) return state.plans[team].plan;   // the same for the whole match
  const roster = state.rosters[team], size = state.size, total = 4 * state.quarterLength * size;
  const shares = roster.map((p, row) => (row < size ? 35 + (overall(p) - 84) / 3 : [25, 24, 16, 10, 8][row - size] ?? 6));
  const sum = shares.reduce((a, b) => a + b, 0), plan = shares.map(share => (share / sum) * total);
  (state.plans ??= [null, null])[team] = { key, plan };
  return plan;
}

// How far apart two players are in size, by position.
const SIZE = Object.freeze({ PG: 1, SG: 2, SF: 3, PF: 4, C: 5 });

// When in each half a starter rests: minutes into the half, by his place in the order, staggered so that two or three
// starters are always on; he rests for his share of the half's minutes he is not meant to play.
const REST_FROM = Object.freeze([8, 9.5, 8.5, 9, 8.75]);

// Whether starter `row` is in his rest now, by the coach's plan: from REST_FROM minutes into each half (scaled to the
// quarter's length) for half the minutes he is not meant to play. Never in overtime.
function resting(state, row, plan) {
  if (row >= REST_FROM.length || state.quarter > 4) return false;
  const into = ((state.quarter - 1) % 2) * state.quarterLength + (state.quarterLength - state.gameClock);
  const from = REST_FROM[row] * 60 * (state.quarterLength / 720), length = Math.max(0, (4 * state.quarterLength - plan[row]) / 2);
  return into >= from && into < from + length;
}

// One stoppage's substitutions for `team` by its coach's rotation. He works out the five he wants on: his starters,
// unless one is resting by the plan, in foul trouble or spent (or it is a blowout's last minutes, when the bench
// finishes); then the bench, the best fit for each place left (the same size, rested, furthest below his minutes).
// A close finish and the start of each half are for the starters. Then he makes only the swaps that takes.
function rotate(state, team, players) {
  const roster = state.rosters[team], plan = rotationPlan(state, team), scale = state.quarterLength / 720;
  const starter = row => row < state.size;
  const last = state.quarter >= 4, left = state.gameClock, lead = state.score[team] - state.score[1 - team];
  const late = last && left <= 300 * scale, garbage = late && Math.abs(lead) >= 20, closing = late && !garbage && Math.abs(lead) < 10;
  const fresh = (row, onNow) => roster[row].energy >= (onNow ? styled(state, 'stamina.subOut') : 0.5);
  const fouled = row => roster[row].fouls >= state.foulLimit;
  const onNow = new Set(players.map(p => p.person));
  const shooter = state.freeThrow?.shooter, fixed = new Set(state.players.filter(p => p.team === team && (p.id === shooter || roster[p.person].manual)).map(p => p.person));
  // Who he wants: the starters who may play, then the bench by fit for the places left.
  const want = new Set(fixed);
  const may = row => closing || (!garbage && !resting(state, row, plan) && !foulTrouble(state, roster[row]) && fresh(row, onNow.has(row)));
  for (let row = 0; row < state.size && want.size < state.size; row++) if (!want.has(row) && !fouled(row) && may(row)) want.add(row);
  // The places left, filled from the bench (a starter who may not play only if nobody else can): the best fit for
  // each, by size, freshness and how far he is below his minutes.
  const size = row => SIZE[roster[row].position] ?? 3;
  const places = [...Array(state.size).keys()].filter(row => !want.has(row));   // the starters' places to fill, by their size
  for (const place of places) {
    if (want.size >= state.size) break;
    const left = [...Array(roster.length).keys()].filter(row => !want.has(row) && !fouled(row));
    const bench = left.filter(row => !starter(row) && fresh(row, onNow.has(row)));
    // With nobody fresh for the place, whoever is on now stays on: no swapping one tired man for another.
    const staying = left.filter(row => onNow.has(row) && !(garbage && starter(row)));
    const choices = bench.length ? bench : staying.length ? staying : left;
    if (!choices.length) break;
    // A man already on is kept over one about as good: no swapping for its own sake.
    const score = row => -90 * Math.abs(size(row) - size(place)) + (plan[row] - roster[row].secs) + 100 * roster[row].energy - (foulTrouble(state, roster[row]) ? 600 : 0) + (onNow.has(row) ? 150 : 0);
    want.add(choices.reduce((a, b) => (score(b) > score(a) ? b : a)));
  }
  // The swaps: each man on who is not wanted comes off for a wanted man of his size who is not on.
  for (const p of players) {
    if (want.has(p.person)) continue;
    const coming = [...want].filter(row => !onNow.has(row) && benchOf(state, team).includes(row));
    if (!coming.length) break;
    const best = coming.reduce((a, b) => (Math.abs(size(b) - size(p.person)) < Math.abs(size(a) - size(p.person)) ? b : a));
    if (substitute(state, p.id, best)) { onNow.delete(p.person); onNow.add(best); }
  }
}
