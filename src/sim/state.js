import { BALL, CLOCK, LINEUP, ROSTER, TIP } from './tuning.js';

// The last word of a person's name.
export const surname = person => person.name.split(' ').pop();

export const attackSign = team => (team === 0 ? 1 : -1);

// Standing on the floor, not in the middle of a jump.
export const onFloor = p => p.y === 0 && p.vy === 0;

export const emptyIntent = () => ({ moveX: 0, moveZ: 0, sprint: false, shoot: false, pass: false, steal: false, switch: false, hold: false });

// What happened in one step, reported to the rules.
export const emptyEvents = () => ({ hitFloor: false, hitRim: false, hitBoard: false, scored: 0,
  travel: null, doubleDribble: null, stealMisses: [], release: null, contacts: [] });

// `points` for `team`: on the total and on the period being played.
export function addPoints(state, team, points) {
  const periods = state.byQuarter[team];
  while (periods.length < state.quarter) periods.push(0);
  periods[state.quarter - 1] += points;
  state.score[team] += points;
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
    });
  }
}

// A match of `size` a side: 3 or 5. Any other size is 3.
export function createMatch(seed = 1, size = 3) {
  if (size !== 5) size = 3;
  const state = {
    size,
    seed, time: 0,
    phase: 'start', phaseT: 0,
    quarter: 1, gameClock: CLOCK.quarter, shotClock: CLOCK.shot,
    score: [0, 0],
    byQuarter: [[], []],   // each team's points in each period played so far; overtime periods follow the fourth
    possession: 0, lastTouch: null, controlled: 0, lastControlled: 0,
    inboundSpot: { x: 0, z: 0 },
    // manual: you brought him on yourself, so the automatic substitutions leave him alone until he comes off
    rosters: ROSTER.numbers.map((team, t) => team.map((number, row) => ({ number, name: ROSTER.names[t][row], position: ROSTER.positions[row], energy: 1, fouls: 0, manual: false }))),
    subQueue: [], autoSubs: [true, true], teamFouls: [0, 0],
    call: null, freeThrow: null, pendingFoul: null, tipWinner: null,
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
