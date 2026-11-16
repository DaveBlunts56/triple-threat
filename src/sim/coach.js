// The coach: one for each team, kept on state.coach[team]. He reads his team's data (its playbook, its defence and
// what kind of coach he is: see teams.js), what has scored this game, and the score and the clock. He decides which
// play to call and how much he leans on what works; the defence's scheme and matchups follow in Task 3.3, the
// rotation in 3.4. Nothing here names a team.
//
// A coach's memory: for each kind of possession (a play's key, 'transition' for one over in under 8 s with no play,
// 'none' otherwise), the points it scored and how many there were. possessions.js writes it as each possession ends.
import { DIFFICULTY, levelOf } from './tuning.js';
import { COACHES, DEFENCES, PLAYBOOKS } from './teams.js';
import { styled } from './styles.js';
import { rated } from './ratings.js';
import { guardOf } from './matchups.js';

// Possessions of prior a kind's points per possession is pulled toward the team's own by, and how hard what has
// worked pulls the coach's choice; how far it may pull, either way.
const MEMORY = Object.freeze({ prior: 10, pull: 2, least: 0.6, most: 1.8 });

// The coach of `team`, made the first time he is asked for.
export function coachOf(state, team) {
  state.coach[team] ??= { memory: {}, kind: null, scheme: { ...DEFENCES[state.teams[team].defence] }, tight: 1, sag: 1, gamble: 1, guard: null, changed: 0 };
  return state.coach[team];
}

export const playbookOf = (state, team) => PLAYBOOKS[state.teams[team].playbook] ?? PLAYBOOKS.balanced;
export const coachKindOf = (state, team) => COACHES[state.teams[team].coach] ?? COACHES.steady;

// How far `team`'s coach changes what his team does to what is happening. Nobody's for a team a person plays (in
// Play, yours: your team-mates do as they always did); the computer's team in Play as far as the level says; in a
// match with no human, as far as All-Star.
export function adaptOf(state, team) {
  const humans = state.humans ?? [0];
  if (humans.includes(team)) return 0;
  const level = humans.length ? levelOf(state).adapt : DIFFICULTY.levels.allstar.adapt;
  return level * coachKindOf(state, team).adapt * styled(state, 'coach.adapt');
}

// Points per possession: of everything, and of one kind with `prior` possessions of everything mixed in.
function pppOf(memory) {
  let points = 0, count = 0;
  for (const [p, n] of Object.values(memory)) { points += p; count += n; }
  return count ? points / count : 1;
}
export function memoryWeight(state, team, kind) {
  const c = coachOf(state, team), all = pppOf(c.memory), [points, count] = c.memory[kind] ?? [0, 0];
  const mine = (points + MEMORY.prior * all) / (count + MEMORY.prior);
  return Math.min(MEMORY.most, Math.max(MEMORY.least, Math.exp(MEMORY.pull * adaptOf(state, team) * (mine - all))));
}

// How much a play hunts a mismatch on the floor now: an isolation for a handler quicker and better with the ball than
// the man on him (a big switched onto him), a post-up for a big stronger inside than his defender, a pick and roll
// that drags a poor defender into the action. 1 when there is none. `ids`: the play's parts (see plays.js, cast).
export function mismatch(state, key, ids) {
  const who = part => state.players[ids[part]], r = (p, k) => rated(state, p, k);
  const handler = who('handler'), big = who('big');
  if (key === 'iso') {
    const d = guardOf(state, handler);
    const edge = ((r(handler, 'handle') - r(d, 'defence')) + (r(handler, 'speed') - r(d, 'speed'))) / 2;
    return 1 + Math.max(0, edge) / 15;
  }
  if (key === 'postUp' && big) return 1 + Math.max(0, r(big, 'inside') - r(guardOf(state, big), 'defence')) / 20;
  if ((key === 'pickRoll' || key === 'spain' || key === 'horns') && big) return 1 + Math.max(0, 75 - r(guardOf(state, big), 'defence')) / 40;
  return 1;
}

// The coach's weight for calling `key` now, besides how well it suits the floor (plays.js, suits): how often his
// playbook calls it, the mismatch it hunts, and what it has scored. After a timeout he leans hard on what has worked.
export function playWeight(state, team, key, ids) {
  const book = playbookOf(state, team).plays[key] ?? 1;
  const memory = memoryWeight(state, team, key);
  const ato = state.ato === team ? memory ** 3 : 1;
  return book * mismatch(state, key, ids) * memory * ato;
}

// The end of a period, for the team with the ball: 'hold' for the last shot when the shot clock will not run out
// before the period does; '2for1' when a quick shot now gets the ball back with time for another; otherwise null.
export function lastShot(state) {
  const game = state.gameClock, shot = state.shotClock;
  if (game > 2 * 24) return null;
  if (game <= shot + 0.5) return 'hold';
  if (game <= shot + 16 && game > shot + 4) return '2for1';
  return null;
}

// Notes that `team` is running a play of `key`: what its possession will be remembered as.
export function running(state, team, key) {
  coachOf(state, team).kind = key;
}

// Whether `person` is in foul trouble for a coach who sits players: fouls at or past the quarter's line, the line being
// 2 in the first, 3 in the second, 4 in the third and 5 in the fourth for a limit of 6 (one less for each less).
export const foulTrouble = (state, person) => person.fouls >= Math.min(state.quarter, 4) + 1 - (6 - state.foulLimit) && person.fouls < state.foulLimit;

