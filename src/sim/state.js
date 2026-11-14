import { BALL, CLOCK, FOUL, LINEUP, MATCH, ROSTER, TIMEOUT, TIP } from './tuning.js';

const RATING_KEYS = ['inside', 'mid', 'three', 'handle', 'speed', 'defence', 'rebound', 'stamina'];   // ratings.js's KEYS: it imports this file, so they are named here too

// The last word of a person's name.
export const surname = person => person.name.split(' ').pop();

export const attackSign = team => (team === 0 ? 1 : -1);

// Standing on the floor, not in the middle of a jump.
export const onFloor = p => p.y === 0 && p.vy === 0;

// foul: reach in to foul the ball handler on purpose (only the computer does).
// cross, legs, back, stepBack, fade: the five moves (see moves.js).
export const emptyIntent = () => ({ moveX: 0, moveZ: 0, sprint: false, shoot: false, pass: false, steal: false, switch: false, hold: false, foul: false,
  cross: false, legs: false, back: false, stepBack: false, fade: false });

// What happened in one step, reported to the rules.
export const emptyEvents = () => ({ hitFloor: false, hitRim: false, hitBoard: false, scored: 0,
  travel: null, doubleDribble: null, stealMisses: [], release: null, contacts: [] });

// `points` for `team`: on the total and on the period being played.
export function addPoints(state, team, points) {
  const periods = state.byQuarter[team];
  while (periods.length < state.quarter) periods.push(0);
  periods[state.quarter - 1] += points;
  state.score[team] += points;
  state.run[team] += points; state.run[1 - team] = 0;
  if (points > 1) state.made[team][points - 2]++;
}

// The roster entry a court player currently is.
export const personOf = (state, player) => state.rosters[player.team][player.person];

// mulberry32: small seeded generator so a match replays identically from its seed.
export function rand(state) {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Does `player` jump the tip-off? Each team's jumper is the one in the place TIP.slot gives for the match's size.
export const isJumper = (state, player) => player.slot === TIP.slot[state.size];

// Player `id` of a match of `size` a side: the first `size` are team 0. He starts in the place and as the person of
// his number in his team's order.
function createPlayer(id, size) {
  return {
    id, team: id < size ? 0 : 1, slot: id % size, person: id % size,
    x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, facing: 0,
    shooting: false, jumpT: 0, inbounder: false, stealCooldown: 0,
    shotT: 0, letGo: false, takeoff: 0,   // seconds since he pressed shoot; the key came up during the gather; the speed he last left the floor at
    held: false, steps: 0, keyT: 0, setT: 0, foulCooldown: 0,
    calling: false, closing: false,   // he has a hand up for the ball; he is closing out on a shooter (see ai.js)
    // move: the move he is in, { kind, t, dx, dz, cx, cz, push }, or null (see moves.js). moveWait: seconds until he may
    // start another. moved: when his last ended. lateT: seconds he cannot steer, beaten by a move. stumbleT: seconds
    // left of a stumble. fading: his shot is a fade. shotKey: the key his shot is held on, 'shoot' or 'fade'.
    move: null, moveWait: 0, moved: -Infinity, lateT: 0, stumbleT: 0, fading: false, shotKey: 'shoot',
    man: (id + size) % (2 * size), switchWait: 0,   // the id of the opponent he guards (see matchups.js); seconds until he may be switched again
    prev: emptyIntent(),
    ai: { timer: 0, targetX: 0, targetZ: 0, sprint: false, action: null },
  };
}

// Stand both teams in lines either side of centre court, facing each other.
export function lineUp(state) {
  for (const p of state.players) {
    const s = attackSign(p.team);
    Object.assign(p, {
      x: -2 * s, z: (p.slot - (state.size - 1) / 2) * LINEUP.gap[state.size], y: 0, vx: 0, vz: 0, vy: 0,
      facing: s === 1 ? 0 : Math.PI,
      shooting: false, shotT: 0, letGo: false, jumpT: 0, inbounder: false,
      held: false, steps: 0, keyT: 0, setT: 0,
      move: null, moveWait: 0, lateT: 0, stumbleT: 0, fading: false, shotKey: 'shoot',
    });
  }
}

// Makes a match not yet started one of `minutes`-minute quarters, with the foul limits that go with that length.
// A length the game does not have leaves it as it is.
export function setLength(state, minutes) {
  if (!MATCH.minutes.includes(minutes)) return;
  Object.assign(state, { quarterLength: minutes * 60, gameClock: minutes * 60, foulLimit: MATCH.fouls[minutes], bonus: MATCH.bonus[minutes] });
}

// A match of `size` a side: 3 or 5. Any other size is 3.
export function createMatch(seed = 1, size = 3) {
  if (size !== 5) size = 3;
  const state = {
    size,
    difficulty: 'allstar',   // one of DIFFICULTY.order
    quarterLength: CLOCK.quarter, foulLimit: FOUL.limit, bonus: FOUL.bonus,   // seconds in a quarter, and the fouls that go with a match of that length (see setLength)
    seed, time: 0,
    phase: 'start', phaseT: 0,
    quarter: 1, gameClock: CLOCK.quarter, shotClock: CLOCK.shot,
    score: [0, 0],
    byQuarter: [[], []],   // each team's points in each period played so far; overtime periods follow the fourth
    possession: 0, lastTouch: null, controlled: 0, lastControlled: 0,
    inboundSpot: { x: 0, z: 0 },
    // manual: you brought him on yourself, so the automatic substitutions leave him alone until he comes off
    // ratings: what he is good at (see ratings.js). streak: his makes in a row from the floor, or his misses if negative.
    rosters: ROSTER.numbers.map((team, t) => team.map((number, row) => ({ number, name: ROSTER.names[t][row], position: ROSTER.positions[row], role: ROSTER.roles[t][row],
      ratings: Object.fromEntries(RATING_KEYS.map((key, i) => [key, ROSTER.ratings[t][row][i]])), streak: 0, energy: 1, fouls: 0, manual: false }))),
    subQueue: [], autoSubs: [true, true], teamFouls: [0, 0],
    call: null, freeThrow: null, pendingFoul: null, tipWinner: null,
    timeouts: [TIMEOUT.each, TIMEOUT.each], lastTimeout: -Infinity,   // each team's timeouts left; when the last was called
    run: [0, 0],              // each team's points since the other last scored
    made: [[0, 0], [0, 0]],   // each team's baskets from the floor: [twos, threes]
    passer: null,             // the player who threw the last pass
    // What last happened, for whoever watches the match (the rules never read it). stumble: { by, on, at }.
    last: { stumble: null, score: null, block: null, steal: null },
    tempo: { clock: 0, wait: 0, fed: false },   // how patient this possession is, and the shot clock when that was last looked at (see ai.js)
    side: [1, 1],             // the side of the court each team's offence is set to (see offball.js)
    cut: [null, null],        // each team's player cutting to the hoop, { id, until }, or null
    plays: [null, null],      // the play each team is running (see plays.js), or null
    playCall: [null, null],   // the play asked for and not yet started, by its key
    playWait: [0, 0],         // seconds until each team's coach may call another
    switches: 0,   // how many times men have been changed, by a screen or when getting back
    shot: null,   // how the last shot was let go, as the rules judged it; null from the next press until its release
    frontcourt: false, backcourtT: 0, inboundT: 0, controlTeam: null,
    players: Array.from({ length: 2 * size }, (_, id) => createPlayer(id, size)),
    ball: {
      x: 0, y: BALL.radius, z: 0, vx: 0, vy: 0, vz: 0,
      holder: null, mode: 'loose', shooter: null, shotValue: 0,
      noPickupId: null, noPickupT: 0,
      target: null,   // the id of the team-mate a pass in the air is for
    },
  };
  lineUp(state);
  return state;
}
