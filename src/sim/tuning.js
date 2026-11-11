// Every tunable number in the simulation. Distances in metres, times in seconds.
const f = Object.freeze;

export const DT = 1 / 60;

export const COURT = f({ halfLength: 14, halfWidth: 7.5, margin: 1.5 });
export const RIM = f({ x: 12.425, height: 3.05, radius: 0.225, tube: 0.02 });
export const BOARD = f({ x: 12.8, halfWidth: 0.9, bottom: 2.9, top: 3.95 });
export const THREE_PT = f({ radius: 6.75, cornerZ: 6.6 });

export const BALL = f({ radius: 0.12, gravity: 9.81, floorBounce: 0.75, rimBounce: 0.55, boardBounce: 0.6, restSpeed: 0.5 });

export const PLAYER = f({ radius: 0.3, run: 5, sprint: 7, accel: 30, jumpV: 4, releaseHeight: 2.3, reach: 2.4, pickupRadius: 0.7 });

export const SHOT = f({
  nearChance: 0.85, farChance: 0.35, farDist: 8, minChance: 0.05,
  worstTiming: 0.6,
  contestDist: 2, maxContest: 0.5, airContest: 0.8, airContestDist: 1.5,
  missMin: 0.18, missMax: 0.32,
  minAngle: 50,
});

export const PASS = f({ speed: 14, noPickup: 0.3 });
export const STEAL = f({ reach: 1.2, frontChance: 0.35, backChance: 0.1, cooldown: 1 });
export const BLOCK = f({ reach: 1.2, minHeight: 0.3, chance: 0.5 });

export const CLOCK = f({ quarters: 4, quarter: 180, overtime: 60, shot: 24, dead: 1.5, quarterBreak: 2 });

export const AI = f({
  interval: 0.3, openDist: 1.8, shootRange: 7.5, laneWidth: 1, panicClock: 4,
  stealRate: 0.15, inboundDelay: 1, swapEvery: 6, onBallGap: 1, offBallGap: 2,
});
