import { BALL, CLOCK, ROSTER } from './tuning.js';

export const attackSign = team => (team === 0 ? 1 : -1);

// Standing on the floor, not in the middle of a jump.
export const onFloor = p => p.y === 0 && p.vy === 0;

export const emptyIntent = () => ({ moveX: 0, moveZ: 0, sprint: false, shoot: false, pass: false, steal: false, switch: false, hold: false });

// What happened in one step, reported to the rules.
export const emptyEvents = () => ({ hitFloor: false, hitRim: false, hitBoard: false, scored: 0,
  travel: null, doubleDribble: null, stealMisses: [], release: null, contacts: [] });

// The roster entry a court player currently is.
export const personOf = (state, player) => state.rosters[player.team][player.person];

// mulberry32: small seeded generator so a match replays identically from its seed.
export function rand(state) {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function createPlayer(id) {
  return {
    id, team: id < 3 ? 0 : 1, slot: id % 3, person: id % 3,
    x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, facing: 0,
    shooting: false, jumpT: 0, inbounder: false, stealCooldown: 0,
    held: false, steps: 0, keyT: 0, setT: 0, foulCooldown: 0,
    prev: emptyIntent(),
    ai: { timer: 0, targetX: 0, targetZ: 0, sprint: false, action: null },
  };
}

// Stand both teams in lines either side of centre court, facing each other.
export function lineUp(state) {
  for (const p of state.players) {
    const s = attackSign(p.team);
    Object.assign(p, {
      x: -2 * s, z: (p.slot - 1) * 3, y: 0, vx: 0, vz: 0, vy: 0,
      facing: s === 1 ? 0 : Math.PI,
      shooting: false, jumpT: 0, inbounder: false,
      held: false, steps: 0, keyT: 0, setT: 0,
    });
  }
}

export function createMatch(seed = 1) {
  const state = {
    seed, time: 0,
    phase: 'start', phaseT: 0,
    quarter: 1, gameClock: CLOCK.quarter, shotClock: CLOCK.shot,
    score: [0, 0],
    possession: 0, lastTouch: null, controlled: 0, lastControlled: 0,
    inboundSpot: { x: 0, z: 0 },
    rosters: ROSTER.numbers.map(team => team.map(number => ({ number, energy: 1, fouls: 0 }))),
    subQueue: [], autoSubs: [true, true], teamFouls: [0, 0],
    call: null, freeThrow: null, pendingFoul: null, tipWinner: null,
    frontcourt: false, backcourtT: 0, inboundT: 0, controlTeam: null,
    players: Array.from({ length: 6 }, (_, id) => createPlayer(id)),
    ball: {
      x: 0, y: BALL.radius, z: 0, vx: 0, vy: 0, vz: 0,
      holder: null, mode: 'loose', shooter: null, shotValue: 0,
      noPickupId: null, noPickupT: 0,
    },
  };
  lineUp(state);
  return state;
}
