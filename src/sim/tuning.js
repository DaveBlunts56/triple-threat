// Every tunable number in the simulation. Distances in metres, times in seconds.
const f = Object.freeze;

export const DT = 1 / 60;

export const COURT = f({ halfLength: 14, halfWidth: 7.5, margin: 1.5 });
export const RIM = f({ x: 12.425, height: 3.05, radius: 0.225, tube: 0.02 });
export const BOARD = f({ x: 12.8, halfWidth: 0.9, bottom: 2.9, top: 3.95 });
export const THREE_PT = f({ radius: 6.75, cornerZ: 6.6 });

export const BALL = f({ radius: 0.12, gravity: 9.81, floorBounce: 0.75, rimBounce: 0.55, boardBounce: 0.6, restSpeed: 0.5, floorGrip: 0.9, rollDecel: 2, substeps: 4 });

export const PLAYER = f({ radius: 0.3, run: 5, sprint: 7, accel: 30, jumpV: 4, releaseHeight: 2.3, reach: 2.4, pickupRadius: 0.7, handHeight: 1, carryDist: 0.4, dribbleRate: 2, jumpCarry: 0.2, dribbleSpeed: 0.85 });   // jumpCarry: share of running speed kept when jumping; dribbleSpeed: share of top speed with the ball

export const SHOT = f({
  nearChance: 0.85, farChance: 0.35, farDist: 8, minChance: 0.05,
  worstTiming: 0.6,
  contestDist: 2, maxContest: 0.5, airContest: 0.8, airContestDist: 1.5,
  missMin: 0.18, missMax: 0.32,
  minAngle: 50, minEntry: 45,   // degrees: lowest launch angle, shallowest angle the ball may drop into the rim
});

export const PASS = f({ speed: 14, noPickup: 0.3, height: 1.3, clearTime: 0.1 });   // clearTime: nobody can touch a pass this soon after it is thrown
export const STEAL = f({ reach: 1.2, frontChance: 0.35, backChance: 0.1, cooldown: 1, frontArc: 120 });
export const BLOCK = f({ reach: 1.2, minHeight: 0.3, chance: 0.5, cone: 45, deflect: 4 });

export const CLOCK = f({ quarters: 4, quarter: 180, overtime: 60, shot: 24, dead: 1.5, quarterBreak: 2 });

export const AI = f({
  interval: 0.3, openDist: 1.8, shootRange: 7.5, laneWidth: 1, panicClock: 4,
  stealRate: 0.05, inboundDelay: 1, swapEvery: 6, onBallGap: 1, offBallGap: 1.5,
  jitter: 0.1,            // random extra seconds between decisions
  arrive: 0.3,            // close enough to a target to stop
  layupDist: 2.5,         // this close to the rim, just shoot
  releaseJitter: 0.12,    // seconds either side of the jump's apex that a shot may be released
  driveX: 11.2, topX: 5.5, safetyX: 4,   // distances from centre court: drive target, top of the key, the player who gets back
  inboundHelp: 4,         // how far into the court a teammate comes to receive an inbound pass
  contestDist: 2,         // jump to contest a shooter this close
  reboundDist: 1, reboundHeight: 3.3,    // jump for a falling ball this close and this low
  farAway: 2,             // sprint when further than this from where you need to be
  passRange: 10,          // longest pass the computer will try
  holdTime: 0.5,          // seconds a player keeps the ball after getting it before shooting or passing
});
