// Every tunable number in the simulation. Distances in metres, times in seconds.
const f = Object.freeze;

export const DT = 1 / 60;

export const COURT = f({ halfLength: 14, halfWidth: 7.5, margin: 1.5 });
export const RIM = f({ x: 12.425, height: 3.05, radius: 0.225, tube: 0.02 });
export const BOARD = f({ x: 12.8, halfWidth: 0.9, bottom: 2.9, top: 3.95 });
export const THREE_PT = f({ radius: 6.75, cornerZ: 6.6 });

export const BALL = f({ radius: 0.12, gravity: 9.81, floorBounce: 0.75, rimBounce: 0.55, boardBounce: 0.6, restSpeed: 0.5, floorGrip: 0.9, rollDecel: 2, substeps: 4 });

// The net under each rim, as the ball feels it. depth: metres it hangs below the rim. slow: seconds in which it takes away
// most of a ball's sideways speed. exit: the fastest a ball drops out of its bottom, in metres a second.
export const HOOP_NET = f({ depth: 0.45, slow: 0.015, exit: 3.5 });

export const PLAYER = f({ radius: 0.3, run: 5, sprint: 7, accel: 30, jumpV: 4, shotJumpV: 2.2, releaseHeight: 2.3, reach: 2.4, pickupRadius: 0.7, handHeight: 1, carryDist: 0.4, dribbleRate: 2, jumpCarry: 0.2, dribbleSpeed: 0.85, gatherDist: 1.5 });   // shotJumpV: the smaller jump of a shot; jumpCarry: share of running speed kept when jumping; dribbleSpeed: share of top speed with the ball; gatherDist: metres a player may move after picking up his dribble

export const SHOT = f({
  nearChance: 0.85, farChance: 0.15, farDist: 8, minChance: 0.05,
  gather: 0.3,        // seconds on the floor between pressing shoot and leaving it
  bestAt: 0.8,        // the best moment to let go, as a share of the way up the jump
  worstTiming: 0.6,   // share of the chance kept at the press and at the landing
  contestDist: 2, maxContest: 0.5, airContest: 0.8, airContestDist: 1.5,
  missMin: 0.18, missMax: 0.32,
  minAngle: 50, minEntry: 45, maxAngle: 88,   // degrees: lowest launch angle, shallowest drop into the rim, steepest launch
  rimClear: 0.02,     // extra room a made shot leaves between ball and front rim
  // rattle: share of makes that are not green which are asked to bounce on the rim before they drop. Such a shot is
  // aimed between rattleMin and rattleMax metres off the rim's centre, trying up to rattleTries aims for one that
  // goes in at least rattleSteps steps after it first touches the rim (a ball that only clips the rim on its way down
  // does not count). Few aims do, fewer from far out, so some of those asked swish after all.
  rattle: 0.35, rattleMin: 0.07, rattleMax: 0.17, rattleSteps: 6, rattleTries: 40,
  minRelease: 0.6,    // a shot is never released closer to the rim centre than this
  greenFull: 4, greenNone: 12,   // metres from the hoop: the green window is full width up to the first and gone at the second
  // How closely the shooter is guarded, highest first: the level is the first whose `above` his defender factor reaches,
  // and `steps` is how many steps either side of the best moment a release is green.
  levels: f([
    f({ name: 'Open', above: 0.95, steps: 3 }),
    f({ name: 'Guarded', above: 0.75, steps: 2 }),
    f({ name: 'Contested', above: 0.55, steps: 1 }),
    f({ name: 'Smothered', above: 0, steps: 0 }),
  ]),
});

export const PASS = f({ speed: 14, noPickup: 0.3, height: 1.3, clearTime: 0.1, interceptRadius: 0.4 });   // clearTime: no opponent can touch a pass this soon after it is thrown; interceptRadius: how close to a pass a defender must be to pick it off
export const STEAL = f({ reach: 1.2, frontChance: 0.25, backChance: 0.08, cooldown: 1, frontArc: 120, heldFactor: 0.4 });   // heldFactor: steal chance multiplier against a picked-up ball
export const BLOCK = f({ reach: 1.2, minHeight: 0.3, chance: 0.36, cone: 45, deflect: 4 });

export const CLOCK = f({ quarters: 4, quarter: 180, overtime: 60, shot: 24, shotAfterFoul: 14, dead: 1.5, quarterBreak: 2 });

export const AI = f({
  interval: 0.3, openDist: 1.8, shootRange: 7.5, laneWidth: 1.07, panicClock: 4,
  stealRate: 0.03, inboundDelay: 1, swapEvery: 6, onBallGap: 1.35, offBallGap: 1.8,
  jitter: 0.1,            // random extra seconds between decisions
  arrive: 0.3,            // close enough to a target to stop
  slowDist: 1.5,          // within this of a target a player asks for part speed, in proportion to the distance left
  layupDist: 2.8,         // this close to the rim, just shoot
  releaseJitter: 0.16,    // seconds either side of the best moment that a shot may be released
  driveX: 11.2, topX: 5.2, safetyX: 4,   // distances from centre court: drive target, top of the key, the player who gets back
  inboundHelp: 4,         // how far into the court a teammate comes to receive an inbound pass
  contestDist: 2,         // jump to contest a shooter this close
  contestDelay: 0.05,     // the longest a defender takes to react to his man leaving the floor
  reboundDist: 1, reboundHeight: 3.3,    // jump for a falling ball this close and this low
  farAway: 2,             // sprint when further than this from where you need to be
  passRange: 10,          // longest pass the computer will try
  holdTime: 0.5,          // seconds a player keeps the ball after getting it before shooting or passing
  pickupX: 4,             // defenders wait this far inside their own half for an opponent still up the court
  hurryAt: 5,             // seconds in the back court after which the handler stops looking for a pass and brings the ball up
  lowSpotZ: 3.2,          // the low spacing spot sits this far from the middle, clear of the key
  // Where five stand: [metres from centre court toward the hoop they attack, z], in order round the arc: a corner,
  // a wing, the top of the key, the other wing and the low post. swapEvery5: seconds between turns in five a side:
  // at each all five move one place round, so nobody crosses the court but the one who cuts along the baseline.
  spots5: f([f([11.6, -6.3]), f([7.5, -5.5]), f([5.2, 0]), f([7.5, 5.5]), f([10.9, 3.2])]),
  swapEvery5: 8,
  safetyGap: 4,           // metres between those who get back together when a ball is loose
});

// Plays. wait: seconds after a play ends before the coach calls another. minClock: the least shot clock a play is
// started with. startX: how far past the centre line the ball must be. screenGap: metres between a screener and the
// defender he screens, centre to centre. setDist: a screener this near his spot, standing still, is set. useBy: seconds
// after the screen is set by which the handler is taken to have used it. cut: seconds a turn of the 5-out motion lasts.
// ripeBy: seconds into any play after which its handler no longer waits for it to form. roll: seconds a screener
// who rolls stays in front of the rim before he clears out of the key. feedWidth: how near the line of a pass to the
// man the play is for a defender must be to stop it being thrown: less than for other passes.
export const PLAY = f({ wait: 1.5, minClock: 9, startX: 1.5, screenGap: 0.66, setDist: 0.9, useBy: 1.6, cut: 4.5, ripeBy: 4, roll: 1.7, feedWidth: 0.65 });

// The difficulty levels, easiest first, and what the menus call them.
export const DIFFICULTY = f({
  order: f(['rookie', 'starter', 'allstar', 'superstar', 'legend']),
  label: f({ rookie: 'Rookie', starter: 'Starter', allstar: 'All-Star', superstar: 'Superstar', legend: 'Legend' }),
});
// The level after `level`, going round from the hardest to the easiest.
export const nextDifficulty = level => DIFFICULTY.order[(DIFFICULTY.order.indexOf(level) + 1) % DIFFICULTY.order.length];

// Switching. lost: a screened defender's man is getting away when he is further than this, in metres. save: the least
// running, in metres over the whole team, that makes a new matching worth taking when getting back. wait: seconds a
// defender who has just swapped men swaps with nobody.
export const MATCHUP = f({ lost: 2, save: 6, wait: 2 });

export const VIOLATION = f({ backcourt: 8, key: 3, inbound: 5, keyHalfWidth: 2.45, keyDepth: 5.8 });

export const FOUL = f({
  reachFront: 0.12, reachBack: 0.3,          // chance a failed steal is a foul
  shooting: 0.25, contactDist: 0.8,          // chance, and how close an airborne defender must be at release
  charge: 0.6, block: 0.15,                  // chance when a sprinting handler hits a set / a moving defender
  chargeSpeed: 5.5, setTime: 0.4, setSpeed: 0.5, cooldown: 1,
  limit: 3, bonus: 3,                        // personal fouls to foul out; team foul that starts the bonus
});

export const FT = f({
  lineDist: 5.8, sweep: 1.5, centreChance: 0.95, edgeChance: 0.2,
  limit: 5, aiDelay: 1, aiChance: 0.75, pause: 1,
  // [metres from the baseline, z] for the five other players, mirrored for each hoop
  defence: f([f([2.3, -2.75]), f([2.3, 2.75]), f([9, 2])]),
  offence: f([f([3.7, -2.75]), f([3.7, 2.75])]),
  // The same for the nine others of a five-a-side match: along the lane in the rules' order, the rest behind the arc.
  defence5: f([f([2.3, -2.75]), f([2.3, 2.75]), f([5.1, -2.75]), f([5.1, 2.75]), f([9, 0])]),
  offence5: f([f([3.7, -2.75]), f([3.7, 2.75]), f([9.5, -3.5]), f([9.5, 3.5])]),
});

export const STAMINA = f({
  sprint: 0.025, run: 0.006, jump: 0.015, rest: 0.02, bench: 0.03,   // energy per second (jump: per jump)
  restSpeed: 1, fadeBelow: 0.5, minSpeed: 0.75, minShot: 0.8,
  subOut: 0.35, subIn: 0.7,
});

// slot: the place in his team's order of the player who jumps the tip, by the match's size. around: where the others
// stand for it, by size and place in the order (null: the jumper): [metres back from the centre line toward his own
// basket, z]. Two stand on the circle beside the centre line; in five a side a guard stands back and a forward up.
export const TIP = f({ wait: 1, height: 1.5, tossV: 6.6, gap: 0.6, speed: 7, aiJumpAt: 3.6, aiError: 0.25, slot: f({ 3: 1, 5: 2 }),
  around: f({ 3: f([f([0.6, -2.4]), null, f([0.6, 2.4])]), 5: f([f([6, 0]), f([0.6, -2.4]), null, f([0.6, 2.4]), f([-5, 1.3])]) }) });

// gap: metres between team-mates lined up before the tip, by the match's size.
export const LINEUP = f({ gap: f({ 3: 3, 5: 2.4 }) });

export const ROSTER = f({
  // Eight a side, in roster order: the first three start a three-a-side match, the first five a five-a-side one.
  numbers: f([f([4, 7, 11, 15, 23, 1, 13, 32]), f([5, 8, 10, 21, 33, 2, 14, 30])]),
  teams: f(['Harbor City Waves', 'Red Rock Scorpions']),
  abbr: f(['WAV', 'SCO']),   // each team's name on a scoreboard
  names: f([f(['Jalen Cross', 'Theo Marsh', 'Darius Stone', 'Sam Okoro', 'Andre Volkov', 'Marcus Bell', 'Noah Vance', 'Idris Kane']),
    f(['Kai Mercer', 'Luca Reyes', 'Viktor Lund', 'Devon Hale', 'Emeka Bright', 'Rafael Ortiz', 'Jamal Whitaker', 'Bogdan Ilic'])]),
  positions: f(['PG', 'SF', 'C', 'SG', 'PF', 'PG', 'SF', 'C']),   // by roster row, the same for both teams
});
