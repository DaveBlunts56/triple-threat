// Every tunable number in the simulation. Distances in metres, times in seconds.
import { TEAMS } from './teams.js';

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

export const PLAYER = f({ radius: 0.3, run: 4.5, sprint: 6.3, accel: 30, jumpV: 4, shotJumpV: 2.2, releaseHeight: 2.3, reach: 2.4, pickupRadius: 0.7, handHeight: 1, carryDist: 0.4, dribbleRate: 2, jumpCarry: 0.2, dribbleSpeed: 0.85, gatherDist: 1.5 });   // shotJumpV: the smaller jump of a shot; jumpCarry: share of running speed kept when jumping; dribbleSpeed: share of top speed with the ball; gatherDist: metres a player may move after picking up his dribble

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
  rattleMin: 0.07, rattleMax: 0.17, rattleSteps: 6, rattleTries: 40,
  // No two shots fly alike. loft: the most a shot is thrown steeper than it need be, in radians; none of it nearer the
  // hoop than loftFrom, all of it from twice that. ways: of the makes
  // that are not green, the share that go in clean, then (running totals) off the rim, rolling round it, and off the
  // glass. rollBounces: bounces on the rim that make a roll. bankLow, bankHigh, bankWide: where on the glass a bank
  // shot is aimed: metres above the rim, and to either side of its middle. tease: the share of misses that sit on the
  // rim before they fall out.
  loft: 0.2, loftFrom: 2.5, ways: f([0.3, 0.62, 0.84, 1]), rollBounces: 2, bankLow: 0.2, bankHigh: 0.55, bankWide: 0.25, tease: 0.25,
  minRelease: 0.6,    // a shot is never released closer to the rim centre than this
  insideDist: 3,      // a shot from nearer the hoop than this is taken on his inside rating
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
// The box score (see stats.js). assist: seconds after a catch within which a shot that scores earns the passer an
// assist. chasePace, chaseBehind: a block is a chase-down when the blocker is running at the hoop this fast (m/s) and
// is no nearer to it than this much short of the shooter (metres).
export const STAT = f({ assist: 3, chasePace: 4, chaseBehind: 0.5 });
// An assist, beyond STAT.assist's seconds: quick: seconds from the catch within which a basket is assisted however far
// he took the ball (a cutter or a roller finishing on the run); carry: after that, metres he may have taken it from
// where he caught it (further, and he made the shot himself).
export const ASSIST = f({ quick: 2.4, carry: 3 });

// The ball handler's moves (see moves.js). time: seconds a move lasts. push: metres it carries him. keep: the share of
// his speed he keeps through it. steal: what a reach's chance is multiplied by while it lasts. hidden: a reach from the
// front cannot win the ball.
export const MOVES = f({
  cross: f({ time: 0.30, push: 1.5, keep: 0.5, steal: 1.5, hidden: false }),
  legs: f({ time: 0.40, push: 1.1, keep: 0.5, steal: 0.5, hidden: false }),
  back: f({ time: 0.50, push: 1.2, keep: 1, steal: 1, hidden: true }),
  stepBack: f({ time: 0.35, push: 1.3 }),
  gap: 0.3,            // seconds after a move before another may start
  plant: 0.25,         // the share of a move, at its start and again at its end, over which its push builds and is spent
  cost: 0.02,          // energy a move takes
  tired: 0.6,          // the share of its push a move keeps at no energy (all of it at full, in a straight line between)
  near: 1.6,           // metres: a defender this close can be beaten
  late: 0.25, latePer10: 0.1, lateMax: 0.6,   // seconds he is late at equal ratings; more per 10 points of Handle over Defence
  leaning: 0.5,        // m/s: a defender already moving the move's way this fast is not late
  ankle: f({ edge: 15, wrong: 1, chance: 0.25, time: 1 }),   // Handle less Defence at least; m/s he moves the wrong way; how often; seconds down
  side: 0.3,           // how far across the move keys must point for them to choose the side
  // The post fade. within: metres from the hoop it can be taken from. drift: metres he floats back in the air. contest:
  // the share of what a defender would take off a plain shot. make: what the shot's chance is multiplied by. block:
  // what a blocker's reach is multiplied by.
  fade: f({ within: 5.5, drift: 0.8, contest: 0.6, make: 0.92, block: 0.6 }),
});
// Finishes at the rim: the layup and the dunk (see finish.js; measured from reference clips, see the spec).
// layupNear, layupFar: metres from the rim's centre between which a finish can begin. drive: the least speed toward
// the rim, m/s, that makes the shot key a layup from anywhere in that range. close: nearer the rim than this it is a
// layup from a standstill too (a step in), unless he is going away from it faster than `away`. gather: seconds of the two steps. gatherSpeed: the fastest he is
// carried through them. takeoff: metres from the rim's centre at which he leaves the floor. jump: m/s he jumps at.
// arrive: metres in front of the rim's centre he is at the finish's moment. dunkMoment: the share of the jump at
// which the ball goes down: just past the top of it, the only part of the jump in which his hand is above the rim (the
// reference clip's dunker, taller and higher, threw it down at 0.69). dunkAt: the Inside from which he can dunk. dunkEnergy: the energy below which he cannot.
// dunkChance: an open dunk's chance; dunkContest: how much of it a defender can take. reach: the furthest from the
// rim's centre he can be at the dunk's moment and still dunk. dunkDrop: m/s the ball goes down through the rim.
// windmillAt, windmillRoom: a dunk is a windmill for a player whose Inside is at least the first, with no defender
// within the second (metres) as he begins it. It changes how it looks, not what it is.
// release: where a layup leaves his raised hand: metres above his feet, and out from him toward the rim: where the
// motion has the ball in his hand at that moment, so that it is not seen to jump as it leaves.
// stealFactor: what a reach's chance is multiplied by through a finish, on the floor and in the air. block: what a
// block's chance is multiplied by on a finish: it goes up high with his body between the ball and the defender.
export const FINISH = f({
  layupNear: 0.5, layupFar: 4.5, drive: 2, close: 2.8, away: 1, gather: 0.5, gatherSpeed: 5,
  takeoff: f({ layup: 1.6, dunk: 2.2 }), jump: f({ layup: 3.7, dunk: 4.6 }), arrive: f({ layup: 0.9, dunk: 0.2 }),
  release: f({ up: 2.15, ahead: 0.3 }), windmillAt: 86, windmillRoom: 2.5,
  dunkMoment: 0.55, dunkAt: 78, dunkEnergy: 0.25, dunkChance: 0.97, dunkContest: 0.45, reach: 0.9, dunkDrop: 4, stealFactor: 0.5, block: 0.5,
});
export const BLOCK = f({ reach: 1.2, minHeight: 0.3, chance: 0.36, cone: 45, deflect: 4 });

export const CLOCK = f({ quarters: 4, quarter: 180, overtime: 60, shot: 24, shotAfterFoul: 14, dead: 1.5, quarterBreak: 2, timeout: 3 });

export const AI = f({
  interval: 0.3, openDist: 1.8, shootRange: 7.5, laneWidth: 1.07, panicClock: 4,
  stealRate: 0.03, inboundDelay: 1, onBallGap: 1.35, offBallGap: 1.8,
  jitter: 0.1,            // random extra seconds between decisions
  arrive: 0.3,            // close enough to a target to stop
  slowDist: 1.5,          // within this of a target a player asks for part speed, in proportion to the distance left
  layupDist: 2.8,         // this close to the rim, just shoot
  // The moves (see moves.js). moveAt: the Handle from which he tries a dribble move on a defender this near (moveNear).
  // moveEvery: seconds between one player's moves. stepAt: the rating, for where he stands, from which he steps back
  // from a defender within stepNear. fadeAt: the Inside from which he fades over a defender within fadeNear.
  // mateMoves: how often your team-mates take a move that is right (the computer's team: the level's `moves`).
  // moveFrom: seconds into the shot clock from which he may try a dribble move. beatFor: seconds after a move in which
  // he drives at a clear lane even early in the shot clock.
  moveAt: 78, moveNear: 1.5, moveEvery: 2.5, stepAt: 82, stepNear: 1.3, fadeAt: 80, fadeNear: 1.5, mateMoves: 0.6, moveFrom: 6, beatFor: 1,
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
  keyOut: 1.9,            // seconds in the key after which a player off the ball steps out of it, whatever he was doing
  callAt: 70,             // he calls for the ball only where his rating for the shot is at least this
  shootAt: 60,            // he takes an open shot only if his rating for it is at least this (unless the clock is short)
  earlyThree: 88, roomFor: 3,   // early in the shot clock a three is taken only by a shooter this good with this much room
  roomGap: 0.2,          // per 10 points of his rating for the shot: how much less room he needs to take it
  passAfter: 1.4,         // seconds a player keeps a ball he has caught before he passes it on, unless to a man at the rim
  noReturn: 4,            // seconds in which he does not pass back to the man who passed to him, unless that man has cut
  goTo: 0.5,              // how often, once the offence has been run, a handler without a shot gives the ball to the star
  lean: 1.5, shy: 0.6,    // how much a pass leans to the star and to a hot hand, and away from a cold one
  shooterGap: 0.06, quickGap: 0.04, offShooterGap: 0.08,   // per 10 points: closer on a shooter, further off a quick man, on the ball and off it
  gapRange: f([0.9, 1.9]),   // the nearest and furthest an on-ball defender stands, in metres
  patience: f([12, 19]),   // seconds into the shot clock before a team will shoot from outside: between these, afresh each possession
  insideDist: 5,          // a team-mate nearer the hoop than this is inside: early in the shot clock he is not passed to
  breakLead: 2.5,         // a handler this many metres nearer the hoop than every defender is on a fast break
  onePass: 6.5,           // a man within this of the ball is one pass away; further, two
  sag: 0.4, sagTo: 3, sagWithin: 11,   // two passes away a defender stands this share of the way toward a spot this far in front of the rim, when his man is this near the hoop
  closeFor: 0.7,          // seconds after his man catches the ball that he closes out at a sprint
  boards: 2,              // how many of the defence go for a rebound once they have boxed out: those nearest the rim
  boxFor: 0.9, boxGap: 0.7,   // seconds a defender boxes out when a shot goes up, and how far from his man he stands, toward the hoop
  helpFrom: 8,            // a handler with a clear lane this near the hoop draws a helper
  helpAt: 1.6,            // metres in front of the rim the helper stands
  helpFor: 1,             // seconds he stays once he has come
  adaptAfter: 4,          // baskets you must have made before the computer's defence changes for them
  vary: 0.3,              // how often a pass goes to an open man other than the one nearest the hoop
  lowSpotZ: 3.2,          // the low spacing spot sits this far from the middle, clear of the key
  safetyGap: 4,           // metres between those who get back together when a ball is loose
});

// What a player with the ball reads before he runs the offence (see ai.js). wide: metres clear of every defender that
// make him, or a team-mate, wide open. onCatch: seconds after catching the ball that a wide-open shot goes up. crowd:
// this many defenders within AI.contestDist of him at the rim are a crowd, and he looks for the man they left.
export const READ = f({ wide: 2.5, onCatch: 0.25, crowd: 2 });

// Off the ball, for the team that has it (see offball.js). shooterAt: the three rating from which a player is a
// shooter. apart: no two places nearer than this. sideHold: how far past the middle the ball must go before the
// places change sides. every: seconds between a player's own moments to move, between these two. cutGap: his defender
// this far from him is beaten. cutFrom: he does not cut from nearer the hoop than this. cutWidth: how near his way to
// the rim a defender must be to stop the cut. cutFor: seconds a cut lasts. rimAt: how far up the court a cut ends,
// in front of the rim. giveAndGo: seconds after passing in which he may cut for the ball back. drivePace: a handler
// moving at the hoop faster than this is driving. clear, clearTo: a
// team-mate within the first of the drive's line moves the second off it. breakUntil: a fast break is run until the
// ball is this far up the court. breakWide, breakTrail: the lanes run on it: wide of the ball, and behind it.
export const OFF = f({ shooterAt: 80, apart: 2.5, sideHold: 1.5, every: f([2.5, 5]), cutGap: 2.4, cutFrom: 4.5, cutWidth: 0.9, cutFor: 1.6, rimAt: 11,
  giveAndGo: 0.8, drivePace: 2.5, clear: 2.2, clearTo: 3, breakUntil: 6, breakWide: 6, breakTrail: 4 });
// Cutting for three (see offball.js). threeAt: the Three a man needs to go looking for one. openAt: metres from the
// nearest defender a spot on the arc must be to count as open. driftReach: how far a shooter goes to one when a
// team-mate drives; relocateReach: how far at his own moments.
export const ARC = f({ threeAt: 75, openAt: 2.5, driftReach: 4.5, relocateReach: 6.5 });

// Plays. wait: seconds after a play ends before the coach calls another. minClock: the least shot clock a play is
// started with. startX: how far past the centre line the ball must be. screenGap: metres between a screener and the
// defender he screens, centre to centre. setDist: a screener this near his spot, standing still, is set. useBy: seconds
// after the screen is set by which the handler is taken to have used it. cut: seconds a turn of the 5-out motion lasts.
// ripeBy: seconds into any play after which its handler no longer waits for it to form. roll: seconds a screener
// who rolls stays in front of the rim before he clears out of the key. feedWidth: how near the line of a pass to the
// man the play is for a defender must be to stop it being thrown: less than for other passes. startAt: seconds into
// the shot clock before the coach calls a play. roundGap: how wide of the screener's centre the handler goes to get
// round him. roundBy: how far past the screener he must be before he turns for the hoop.
export const PLAY = f({ wait: 1.5, minClock: 9, startX: 1.5, screenGap: 0.66, setDist: 0.9, useBy: 1.6, cut: 4.5, ripeBy: 4, roll: 1.7, feedWidth: 0.65, startAt: 6, roundGap: 1.05, roundBy: 0.3 });

// The difficulty levels, easiest first, what the menus call them, and what each changes. For you (team 0): green: how
// wide the green window of your shots is, against All-Star's; make: the share of its chance a shot of yours that is
// not green keeps; sweep: how fast the free-throw meter moves; timing:
// the share of a shot's chance a badly timed release keeps (SHOT.worstTiming at All-Star). For the computer's team
// (team 1): jitter: seconds either side of the best moment its shots are let go; cpuGreen: how wide its green window
// is, against All-Star's; cpuMake: the share of its chance a shot of its own that is not green keeps; interval: seconds between its
// players' decisions; steal: how often it reaches for the ball, against All-Star; adapt: how far it changes its
// defence to what you score with, from 0 (not at all) to 1.
export const DIFFICULTY = f({
  order: f(['rookie', 'starter', 'allstar', 'superstar', 'legend']),
  label: f({ rookie: 'Rookie', starter: 'Starter', allstar: 'All-Star', superstar: 'Superstar', legend: 'Legend' }),
  levels: f({
    rookie: f({ green: 2, make: 1, sweep: 0.6, timing: 0.8, jitter: 0.3, cpuGreen: 0.7, cpuMake: 0.85, interval: 0.45, steal: 0.5, adapt: 0, moves: 0.15 }),
    starter: f({ green: 1.5, make: 1, sweep: 0.8, timing: 0.7, jitter: 0.22, cpuGreen: 0.85, cpuMake: 0.92, interval: 0.36, steal: 0.75, adapt: 0.3, moves: 0.35 }),
    allstar: f({ green: 1, make: 1, sweep: 1, timing: 0.6, jitter: 0.16, cpuGreen: 1, cpuMake: 1, interval: 0.3, steal: 1, adapt: 0.6, moves: 0.6 }),
    // An open shot is green on seven steps at All-Star, on three at Superstar and at Legend; a guarded one on five,
    // three and one. A shot of yours that is not green goes in half as often at Superstar and almost never at Legend.
    superstar: f({ green: 0.34, make: 0.5, sweep: 1.25, timing: 0.45, jitter: 0.09, cpuGreen: 1.25, cpuMake: 1.1, interval: 0.25, steal: 1.25, adapt: 0.85, moves: 0.8 }),
    legend: f({ green: 0.2, make: 0.08, sweep: 1.5, timing: 0.3, jitter: 0.06, cpuGreen: 1.35, cpuMake: 1.18, interval: 0.2, steal: 1.5, adapt: 1, moves: 1 }),
  }),
});
// How much sharper (or duller) the computer's team decides at each level, added to each of its players' IQ in Play (see
// choose.js). Your team-mates, and a match nobody plays, are unchanged. Kept apart from DIFFICULTY so that the levels'
// own numbers stay what they were.
export const LEVEL_IQ = f({ rookie: -0.2, starter: -0.1, allstar: 0, superstar: 0.08, legend: 0.15 });
// What the match's level changes: see DIFFICULTY.levels.
export const levelOf = state => DIFFICULTY.levels[state.difficulty] ?? DIFFICULTY.levels.allstar;
// Whether a person plays `team` (in Play, team 0; in a match nobody plays, neither), and the level a team nobody plays
// plays at: in Play the difficulty; in a match nobody plays, All-Star's for both, whatever the difficulty.
export const isHuman = (state, team) => (state.humans ?? [0]).includes(team);
export const cpuLevelOf = state => ((state.humans ?? [0]).length ? levelOf(state) : DIFFICULTY.levels.allstar);

// The end of a period and of a game. closing: the last seconds of the game in which everyone hustles, if it is close.
// hurry: the last seconds in which the team behind shoots early and the team ahead uses the clock. close: a lead of
// this many points or fewer is within reach. foulUnder, foulOver: the team behind fouls on purpose with this much left,
// and no longer with less than the second. hurryClock: the shot clock at which a team in a hurry shoots. milkClock:
// the shot clock a team ahead waits for. heave: with less than this left a player far from the hoop throws it up
// rather than run nearer. pressGap: metres an on-ball defender stands off when pressing. run: unanswered points that
// make a coach call a timeout. tired: his five's mean energy below which he calls one. clutch, clutchLead: with
// this many seconds left in the game and the lead this small either way, the ball goes to the star.
export const LATE = f({ closing: 60, hurry: 45, close: 8, foulUnder: 24, foulOver: 1.5, hurryClock: 12, milkClock: 6, heave: 1.3, pressGap: 1, run: 8, tired: 0.4, clutch: 12, clutchLead: 3 });

// How long a match is. minutes: the quarter lengths you can choose. For each, fouls: the personal fouls a player
// fouls out on, and bonus: the team foul in a quarter from which every foul is shot. The shortest is the game's
// own (CLOCK.quarter, FOUL.limit, FOUL.bonus); a longer match allows more, up to a full game's six and five.
export const MATCH = f({ minutes: f([3, 5, 8, 12]), fouls: f({ 3: 3, 5: 4, 8: 5, 12: 6 }), bonus: f({ 3: 3, 5: 4, 8: 5, 12: 5 }) });
// The length after `minutes`, going round from the longest to the shortest.
export const nextMinutes = minutes => MATCH.minutes[(MATCH.minutes.indexOf(minutes) + 1) % MATCH.minutes.length];

// Timeouts. each: how many a team has in a match. rest: the energy everyone gets back. apart: seconds a coach
// leaves between two of his own. (How long one lasts is CLOCK.timeout.)
export const TIMEOUT = f({ each: 3, rest: 0.3, apart: 20 });
// The level after `level`, going round from the hardest to the easiest.
export const nextDifficulty = level => DIFFICULTY.order[(DIFFICULTY.order.indexOf(level) + 1) % DIFFICULTY.order.length];

// Switching. lost: a screened defender's man is getting away when he is further than this, in metres. save: the least
// running, in metres over the whole team, that makes a new matching worth taking when getting back. wait: seconds a
// defender who has just swapped men swaps with nobody.
export const MATCHUP = f({ lost: 2, save: 6, wait: 2 });

// The coaches' defensive schemes (see coach.js and the DEFENCES in teams.js). switchReach: on a switching team, the
// screener's defender takes the man when he is this near him. dropAt: metres in front of the rim a dropping big sits.
// changeEvery: possessions a coach lets pass between two changes of scheme. beaten: points per possession by which
// the other team's pick-and-roll must beat its own average, over at least `seen` of them, for him to change.
// doubleAt, doubleWithin, doubleFor: a post man with this Inside who has the ball this near the rim, for no longer than
// this, is doubled; doubleGap: metres from him the second defender stands. flyPast: metres past the shooter a flying
// closeout aims.
export const SCHEME = f({ switchReach: 2.5, dropAt: 3.5, changeEvery: 8, beaten: 0.25, seen: 5, doubleAt: 85, doubleWithin: 4, doubleFor: 2.5, doubleGap: 0.9, flyPast: 0.4 });

// A finish with an opponent this near him (metres) may draw contact on the drive, in a style that calls it.
export const DRIVE = f({ dist: 1.2 });

export const VIOLATION = f({ backcourt: 8, key: 3, inbound: 5, keyHalfWidth: 2.45, keyDepth: 5.8 });

export const FOUL = f({
  reachFront: 0.12, reachBack: 0.3,          // chance a failed steal is a foul
  shooting: 0.25, contactDist: 0.8,          // chance, and how close an airborne defender must be at release
  charge: 0.6, block: 0.15,                  // chance when a sprinting handler hits a set / a moving defender
  chargeSpeed: 5, setTime: 0.4, setSpeed: 0.5, cooldown: 1,
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

// The two teams, in the shape the game has always read them (see teams.js, where they live as data). Eight a side,
// in roster order: the first three start a three-a-side match, the first five a five-a-side one. positions: by
// roster row, the same for both teams. ratings: in the order inside, mid, three, handle, speed, defence, rebound,
// stamina (see ratings.js).
const RATING_ORDER = ['inside', 'mid', 'three', 'handle', 'speed', 'defence', 'rebound', 'stamina'];
const TWO = TEAMS.slice(0, 2);
export const ROSTER = f({
  numbers: f(TWO.map(t => f(t.players.map(p => p.number)))),
  teams: f(TWO.map(t => t.name)),
  abbr: f(TWO.map(t => t.abbr)),   // each team's name on a scoreboard
  names: f(TWO.map(t => f(t.players.map(p => p.name)))),
  positions: f(TWO[0].players.map(p => p.position)),
  roles: f(TWO.map(t => f(t.players.map(p => p.role)))),
  ratings: f(TWO.map(t => f(t.players.map(p => f(RATING_ORDER.map(k => p.ratings[k])))))),
});

// What 10 points of a rating are worth, as a share of the thing it changes: a shot's chance, the green window's
// width, running speed, a steal's chance, what a contest takes off a shot, how fast he tires, his pull on a rebound.
export const RATE = f({ shot: 0.07, window: 0.1, speed: 0.012, steal: 0.1, contest: 0.08, tire: 0.08, rebound: 0.1 });
// Streaks. after: the makes (or misses) in a row that make a player hot (or cold). hot, hotWindow: what a hot
// player's chance and green window are multiplied by. cold: the same for a cold player's chance.
export const HEAT = f({ after: 3, hot: 1.1, hotWindow: 1.2, cold: 0.92 });
