import { BALL, CLOCK } from './tuning.js';

export const attackSign = team => (team === 0 ? 1 : -1);

export const emptyIntent = () => ({ moveX: 0, moveZ: 0, sprint: false, shoot: false, pass: false, steal: false, switch: false });

// mulberry32: small seeded generator so a match replays identically from its seed.
export function rand(state) {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function createPlayer(id) {
  return {
    id, team: id < 3 ? 0 : 1, slot: id % 3,
    x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, facing: 0,
    shooting: false, jumpT: 0, inbounder: false, stealCooldown: 0,
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
    });
  }
}

export function createMatch(seed = 1) {
  const state = {
    seed, time: 0,
    phase: 'start', phaseT: 0,
    quarter: 1, gameClock: CLOCK.quarter, shotClock: CLOCK.shot,
    score: [0, 0],
    possession: 0, lastTouch: null, controlled: 0,
    inboundSpot: { x: 0, z: 0 },
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
