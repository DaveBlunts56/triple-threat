// Which motion a player shows, worked out from the match alone. No Three.js here, so it can be tested without a browser.
import { BALL, PLAYER, SHOT, MOVES } from '../sim/tuning.js';
import { isJumper, onFloor } from '../sim/state.js';
import { gathering } from '../sim/players.js';
import { manOf } from '../sim/matchups.js';

// Speeds in metres per second. stick: how far past an edge he must go before the gait changes.
// minRate, maxRate: limits on how slow or fast a clip is played. fade: seconds to blend from one motion to the next.
// guardDist: a defender this close to his man is drawn facing him. guardSpeed: walking pace: above it a defender turns
// and runs. guardStick: how far past that pace he must go once he is guarding. sideways: degrees either side of
// straight ahead that still count as forward, and the same either side of straight back as backward.
// land: seconds the knees give after a landing. followHold: the share of the follow-through he holds until he lands.
// reachBefore: seconds before a pass arrives that the hands go out for it. catchReach: the share of the catch that is
// the reach. pullIn: seconds to pull a caught ball in. handUpDist: a defender this close to a shooter raises a hand.
// handSide: how far to one side of the way he faces a defender must be before the ball goes to the other hand.
// handStick: seconds a dribbling hand is kept before it may change again. guardFar: how far past guardDist a defender
// who is guarding goes on guarding. sideStick: degrees past the edge of a guarding step that he keeps the step he is
// in. minRateStep: the limit that stands in for minRate on a side-step, which is one long bound.
// quick: the one-off moves, which come in over fadeIn seconds and leave over fadeOut.
// apart: the share of a cycle between where one person's standing motions start and where the next person's do.
// drift: how much slower or faster than made the slowest and the fastest of the ten play them.
// dribbleHold: the share of each bounce the ball is at the hand. handSwitch: seconds the ball takes to cross from one
// dribbling hand to the other. freeThrowSet: the share of the free throw at which its set point is, above the forehead.
// turnRate: degrees a second the drawn heading turns at most. leanForward, leanSide: degrees the body tips at most,
// forward or back and to either side. leanEase: seconds over which the lean follows what he does. headYaw, headPitch:
// degrees the head turns at most, to either side and up or down. headEase: how quickly the head follows, a second.
// eye: metres from his feet up to his eyes. chestDribble: degrees forward the chest leans in the dribble, which was made
// on legs that lean; chestMade: degrees forward it leans at most under the poses made by hand, made on upright legs.
// guardHold: seconds a defender keeps guarding, or not guarding, before he may change. headBehind: degrees round from
// the way he is drawn facing beyond which he does not look at a thing but where he is going. headRate: degrees a second
// the head turns at most, each way. ballHeld: metres up a ball somebody holds is looked at, whatever its bounce.
export const MOTION = Object.freeze({
  idleBelow: 0.3, walkBelow: 2.2, runBelow: 5.6, stick: 0.2, minRate: 0.6, maxRate: 1.5, fade: 0.15,
  guardDist: 4, guardSpeed: 2.2, guardStick: 0.4, sideways: 50,
  land: 0.12, followHold: 0.6, reachBefore: 0.2, catchReach: 0.6, pullIn: 0.15, handUpDist: 2, handSide: 0.3,
  fadeIn: 0.07, fadeOut: 0.22, quick: Object.freeze(['pass', 'reach', 'follow', 'freeThrow', 'handUp']),
  apart: 0.618, drift: 0.08,
  handStick: 0.4, guardFar: 0.4, sideStick: 10, minRateStep: 0.35,
  dribbleHold: 0.55, handSwitch: 0.2, freeThrowSet: 0.45,
  turnRate: 900, leanForward: 12, leanSide: 10, leanEase: 0.15, headYaw: 70, headPitch: 30, headEase: 8, eye: 1.7,
  chestDribble: 30, chestMade: 15,
  guardHold: 0.5, headBehind: 120, headRate: 360, ballHeld: 1.1,
});

// Every motion of the legs, and every motion the arms can take over from them.
export const LEG_CLIPS = Object.freeze(['idle', 'stance', 'walk', 'run', 'sprint', 'strafeLeft', 'strafeRight', 'backpedal', 'jump', 'land', 'gather']);

export const ARM_CLIPS = Object.freeze(['dribble', 'dribbleLeft', 'hold', 'holdLeft', 'shoot', 'follow', 'freeThrow', 'pass', 'catch', 'reach', 'handUp', 'contest', 'tip',
  'crossover', 'crossoverLeft', 'betweenLegs', 'betweenLegsLeft', 'behindBack', 'behindBackLeft', 'stepBack', 'fade']);

// Motions the file has only if their clips were downloaded: the game does without any that are missing.
export const OPTIONAL_CLIPS = Object.freeze(['celebrate', 'dejected', 'stumble']);

// The motion of each move (see sim/moves.js). The three dribbles are made for a ball that starts in the right hand
// and have a twin, named with Left, for one that starts in the left.
const MOVE_CLIP = Object.freeze({ cross: 'crossover', legs: 'betweenLegs', back: 'behindBack', stepBack: 'stepBack' });
const TWINNED = ['cross', 'legs', 'back'];

// Is motion `name` a downloaded clip of the whole body, which the legs play as well as the arms? `clips` is the
// `clips` of assets/motion.json. A motion made by hand moves the arms only.
export const wholeBody = (clips, name) => clips?.[name]?.from === 'clip';

export const GAITS = ['idle', 'walk', 'run', 'sprint'];

const EDGES = [MOTION.idleBelow, MOTION.walkBelow, MOTION.runBelow];   // EDGES[i] lies between GAITS[i] and GAITS[i + 1]

// The gait each other way of standing or stepping counts as, when deciding whether he keeps the one he is in.
const COUNTS_AS = { stance: 'idle', strafeLeft: 'walk', strafeRight: 'walk', backpedal: 'walk' };

const STOPPED = ['freeThrow', 'dead', 'quarterEnd'];   // the phases in which whoever has the ball just holds it

// The gaits whose stride carries the dribble: one stride is one bounce.
export const STRIDES = Object.freeze(['run', 'sprint']);

export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// The opponent nearest to `player`.
export const nearestOpponent = (state, player) => state.players.filter(o => o.team !== player.team).reduce((a, b) => (dist(b, player) < dist(a, player) ? b : a));

// Seconds from leaving the floor to landing for the jump `player` is in, or last made: a shot's jump is the smaller.
export const airTime = player => (2 * (player.takeoff || PLAYER.jumpV)) / BALL.gravity;

// How far through his jump he is: 0 at take-off, 1 at the landing.
export const jumpShare = player => Math.min(1, player.jumpT / airTime(player));

// Whether the ball is in play and the other team's.
export const defending = (state, player) => (state.phase === 'live' || state.phase === 'inbound') && state.possession !== player.team;

// The hand `player` keeps the ball in: the one away from the nearest opponent. `last` is the hand it is in now, kept
// when nobody is near, or when the nearest is so nearly straight ahead or behind that neither hand is further from him.
export function dribbleHand(state, player, last = 'right') {
  const nearest = nearestOpponent(state, player);
  // Metres he stands to the right of the line the player faces along; negative to its left.
  const right = Math.cos(player.facing) * (nearest.z - player.z) - Math.sin(player.facing) * (nearest.x - player.x);
  if (dist(nearest, player) > MOTION.guardDist || Math.abs(right) < MOTION.handSide) return last;
  return right > 0 ? 'left' : 'right';
}

const HAPPENINGS = ['pass', 'release', 'catch', 'reach', 'land', 'switched'];
const OTHER_HAND = { left: 'right', right: 'left' };

// What the renderer remembers from frame to frame, by player id. For each of HAPPENINGS, the seconds since it last
// happened to him (Infinity if never); `guard`, whether he is guarding his man, and `guarded`, the seconds since that
// last changed; `hand`, the hand the ball goes in; `was`, what the last frame looked like.
export const newMarks = () => ({ ...Object.fromEntries(HAPPENINGS.map(what => [what, {}])), guard: {}, guarded: {}, hand: {}, was: null });

// One frame of noticing: `dt` seconds have passed since the last. The first frame has nothing to compare with, so
// nothing counts as having just happened.
export function noteChanges(marks, state, dt) {
  const { ball } = state, was = marks.was, now = { holder: ball.holder, players: {} };
  for (const p of state.players) {
    const id = p.id, before = was?.players[id];
    for (const what of HAPPENINGS) marks[what][id] = (marks[what][id] ?? Infinity) + dt;

    // Past walking pace, or far from his man, he turns and runs; near either edge he stays as he is, and either way he
    // keeps to it for MOTION.guardHold seconds, so he does not flip between the two. Once his team has the ball he
    // guards nobody, at once.
    const pace = MOTION.guardSpeed + (marks.guard[id] ? MOTION.guardStick : 0);
    const reach = MOTION.guardDist + (marks.guard[id] ? MOTION.guardFar : 0);
    const guarding = defending(state, p) && onFloor(p) && dist(p, manOf(state, p)) <= reach && Math.hypot(p.vx, p.vz) < pace;
    marks.guarded[id] = (marks.guarded[id] ?? 0) + dt;
    const free = marks.guard[id] === undefined || !defending(state, p) || marks.guarded[id] >= MOTION.guardHold;
    if (free && guarding !== marks.guard[id]) [marks.guard[id], marks.guarded[id]] = [guarding, 0];
    // A hand just changed to is kept for a while, so a defender crossing in front does not make the ball flutter.
    // During a dribble move it stays in the hand the move began in; as the move ends it is in the other.
    const kept = marks.hand[id], settled = kept === undefined || marks.switched[id] >= MOTION.handStick;
    const crossed = before && TWINNED.includes(before.move) && !p.move && state.ball.holder === id;
    const hand = crossed ? OTHER_HAND[kept ?? 'right'] : settled && !p.move ? dribbleHand(state, p, kept ?? 'right') : kept ?? 'right';

    if (before) {
      // A release belongs to the jump it was made on: every take-off forgets the last one. Before the release is
      // looked for, because a shot let go on the floor leaves his hands on the frame he takes off.
      if (!before.inAir && !onFloor(p)) marks.release[id] = Infinity;
      const lost = was.holder === id && ball.holder === null;
      if (lost && ball.mode === 'pass') marks.pass[id] = 0;
      // A blocked shot never becomes a shot in the air, but he was shooting when it left his hands. A pass thrown
      // out of the shooting motion is a pass, never a release.
      if (lost && ball.mode !== 'pass' && ((ball.mode === 'shot' && ball.shooter === id) || before.shooting)) marks.release[id] = 0;
      if (ball.holder === id && was.holder !== id) marks.catch[id] = 0;
      if (p.stealCooldown > before.stealCooldown) marks.reach[id] = 0;
      if (before.inAir && onFloor(p)) marks.land[id] = 0;
      if (hand !== marks.hand[id]) marks.switched[id] = 0;
    }
    marks.hand[id] = hand;
    now.players[id] = { shooting: p.shooting, inAir: !onFloor(p), stealCooldown: p.stealCooldown, move: p.move?.kind ?? null };
  }
  marks.was = now;
}

// The way he is drawn facing: a defender guarding his man watches him, whichever way he steps. The rules never read it.
export function drawnFacing(state, player, marks) {
  if (!marks.guard[player.id]) return player.facing;
  const man = manOf(state, player);
  return Math.atan2(man.z - player.z, man.x - player.x);
}

// What legMotion needs to know beyond the player himself. crouch: he has the ball low, knees bent: one he has picked
// up, to pass or shoot, or one he dribbles in live play, which is dribbled in a low stance; an inbounder stands
// upright. landed: seconds since he last landed.
export function legLook(state, player, marks) {
  const dribbling = state.phase === 'live' && onFloor(player);
  return {
    facing: drawnFacing(state, player, marks),
    defending: defending(state, player),
    guarding: marks.guard[player.id],
    crouch: state.ball.holder === player.id && !player.inbounder && (player.held || dribbling),
    landed: marks.land[player.id],
  };
}

const SIDE_STEPS = ['strafeLeft', 'strafeRight'];

// The step of a guarding defender travelling along (vx, vz) while drawn facing `facing`: a back-step, a side-step
// toward his own left or right, or null when he goes forward and walks or runs as anyone does. `last` is the clip he
// showed on the previous frame: the step he is in is kept a little past its edges, so he does not flicker between two.
function guardStep(player, facing, last) {
  const turn = Math.atan2(player.vz, player.vx) - facing;
  const off = (Math.atan2(Math.sin(turn), Math.cos(turn)) * 180) / Math.PI;   // degrees from straight ahead, positive to his right
  // How wide the back-step and the walk forward each reach: wider for the back-step he is in, narrower around a
  // side-step he is in.
  const kept = last === 'backpedal' ? MOTION.sideStick : SIDE_STEPS.includes(last) ? -MOTION.sideStick : 0;
  if (180 - Math.abs(off) <= MOTION.sideways + kept) return 'backpedal';
  if (Math.abs(off) > MOTION.sideways + Math.min(kept, 0)) return off < 0 ? 'strafeLeft' : 'strafeRight';
  return null;
}

// The leg motion for `player` (needs vx, vz, y, vy, jumpT, takeoff, and with a `look` shooting and shotT). `gaits` is
// the natural speed of each moving clip; `last` is the clip he showed on the previous frame; `look` is what legLook
// gave. Without a `look` he only stands, walks, runs, sprints and jumps.
// Played at a rate: { clip, rate }. Placed by hand: { clip, at }, with `at` from 0 at the clip's start to 1 at its end.
export function legMotion(player, gaits, last = null, look = null) {
  if (!onFloor(player)) return { clip: 'jump', at: jumpShare(player) };
  if (player.stumbleT > 0) return { clip: 'stance', rate: 1 };   // beaten by a move: he staggers low, wherever he was going
  if (look && gathering(player)) return { clip: 'gather', at: player.shotT / SHOT.gather };
  if (look && look.landed < MOTION.land) return { clip: 'land', at: look.landed / MOTION.land };

  const speed = Math.hypot(player.vx, player.vz);
  let band = EDGES.findIndex(edge => speed < edge);
  if (band < 0) band = GAITS.length - 1;
  // Close to an edge he keeps the gait he is already in, so the legs do not flicker between two clips.
  const kept = GAITS.indexOf(COUNTS_AS[last] ?? last);
  if (Math.abs(kept - band) === 1 && kept >= 0 && Math.abs(speed - EDGES[Math.min(kept, band)]) < MOTION.stick) band = kept;

  if (band === 0) return { clip: look?.defending || look?.crouch ? 'stance' : 'idle', rate: 1 };
  const clip = (look?.guarding && guardStep(player, look.facing, last)) || GAITS[band];
  // Played faster or slower so the feet cover the ground he really covers.
  const slowest = SIDE_STEPS.includes(clip) ? MOTION.minRateStep : MOTION.minRate;
  return { clip, rate: Math.min(MOTION.maxRate, Math.max(slowest, speed / gaits[clip])) };
}

// Seconds until a pass in the air for `player` is within his reach; Infinity when there is none.
export function passArrival(state, player) {
  const { ball } = state;
  if (ball.mode !== 'pass' || ball.holder !== null || ball.target !== player.id) return Infinity;
  return Math.max(0, dist(ball, player) - PLAYER.pickupRadius) / Math.hypot(ball.vx, ball.vz);
}

// The arm motion for `player`, or null when the arms follow the legs' motion. `marks` is what noteChanges keeps;
// `facts` is assets/motion.json, for how long each clip lasts.
// Placed by hand: { clip, at }, with `at` from 0 to 1. Played at a rate: { clip, rate }.
export function armMotion(player, state, marks, facts) {
  const { ball } = state, id = player.id;
  const hasBall = ball.holder === id, inAir = !onFloor(player);
  const length = name => facts.clips[name].duration;
  const sided = name => (marks.hand[id] === 'left' ? `${name}Left` : name);

  // In a move: its motion, as far through as the move is.
  if (hasBall && player.move && MOVE_CLIP[player.move.kind]) {
    const { kind, t } = player.move, name = MOVE_CLIP[kind];
    return { clip: TWINNED.includes(kind) ? sided(name) : name, at: Math.min(1, t / MOVES[kind].time) };
  }
  // On the floor to a move, if the file has that motion.
  if (player.stumbleT > 0 && facts.clips.stumble) return { clip: 'stumble', at: Math.min(1, Math.max(0, 1 - player.stumbleT / MOVES.ankle.time)) };
  if (marks.pass[id] < length('pass')) return { clip: 'pass', at: marks.pass[id] / length('pass') };
  const released = marks.release[id], landed = marks.land[id];
  // A free throw leaves from the set point, where he held it, and plays on from there at its own pace.
  const atLine = state.phase === 'freeThrow' && state.freeThrow.shooter === id;
  const shot = MOTION.freeThrowSet + released / length('freeThrow');
  if (atLine && shot < 1) return { clip: 'freeThrow', at: shot };
  if (!hasBall && released < Infinity) {
    // The arm goes up and stays up while he is in the air, and comes down once he has landed.
    const up = Math.min(MOTION.followHold, released / length('follow'));
    if (inAir && landed > released) return { clip: 'follow', at: up };
    const at = up + landed / length('follow');
    if (!inAir && landed <= released && at < 1) return { clip: 'follow', at };
  }
  // The set point is reached as his feet leave the floor, and held until he lets go.
  if (player.shooting) return { clip: player.fading ? 'fade' : 'shoot', at: Math.min(1, player.shotT / SHOT.gather) };   // a fade leans back as it goes up
  if (hasBall && marks.catch[id] < MOTION.pullIn) {
    return { clip: 'catch', at: MOTION.catchReach + ((1 - MOTION.catchReach) * marks.catch[id]) / MOTION.pullIn };
  }
  const arrival = passArrival(state, player);
  if (arrival < MOTION.reachBefore) return { clip: 'catch', at: MOTION.catchReach * (1 - arrival / MOTION.reachBefore) };
  if (hasBall && atLine) return { clip: 'freeThrow', at: MOTION.freeThrowSet };   // set to shoot it
  // Nobody dribbles in the air: a ball caught up there is held until he lands.
  if (hasBall && (player.inbounder || player.held || inAir || STOPPED.includes(state.phase))) return { clip: sided('hold'), rate: 1 };
  if (hasBall) return { clip: sided('dribble'), rate: 1 };
  if (marks.reach[id] < length('reach')) return { clip: 'reach', at: marks.reach[id] / length('reach') };
  if (inAir && state.phase === 'jumpBall' && isJumper(state, player)) return { clip: 'tip', at: jumpShare(player) };
  if (inAir) return { clip: 'contest', at: jumpShare(player) };
  const shooter = o => o.team !== player.team && o.shooting && dist(o, player) <= MOTION.handUpDist;
  if (defending(state, player) && state.players.some(shooter)) return { clip: 'handUp', rate: 1 };
  // A hand up for the ball, or up at a shooter he is closing out on.
  if (player.calling || player.closing) return { clip: 'handUp', rate: 1 };
  return null;
}

// One frame of a cross-fade in which each motion leaves at its own pace. `weights` is { clip: its share of the pose };
// `dt` is the seconds that passed. A one-off move leaves slowly; anything else makes way at once for a one-off move,
// and at the usual pace for any other. The chosen motion takes what is left, so the shares always add up to 1.
export function crossFade(weights, chosen, dt) {
  const makeWay = MOTION.quick.includes(chosen) ? MOTION.fadeIn : MOTION.fade;
  let others = 0;
  for (const name in weights) {
    if (name !== chosen) others += weights[name] = Math.max(0, weights[name] - dt / (MOTION.quick.includes(name) ? MOTION.fadeOut : makeWay));
  }
  weights[chosen] = 1 - others;
  return weights;
}

const LEG_BONES = /^mixamorig(Hips|Spine|(Left|Right)(UpLeg|Leg|Foot|ToeBase))\./;

// The layer a track of a motion plays on, by the bone it moves: 'legs' for the hips, the lowest spine bone and both
// legs, 'arms' for everything above. The lean of a run is in the hips and the lowest spine bone, so the legs keep it
// whatever the arms do.
export const layerOf = trackName => (LEG_BONES.test(trackName) ? 'legs' : 'arms');

// Where in its cycle (0 to 1) person `index` of the ten starts standing and guarding, and how fast he plays them, so
// that no two breathe in step. Each start is `apart` of a cycle on from the last; the rates are spread evenly from
// `drift` slow to `drift` fast, in an order that keeps team mates' rates well apart.
export function outOfStep(index) {
  return { start: (index * MOTION.apart) % 1, rate: 1 - MOTION.drift + (2 * MOTION.drift * ((index * 7) % 10)) / 9 };
}

// The dribble's place in its cycle (0 to 1) when the legs carry it. `legPhase` is how far through its cycle the
// striding clip is, and may count on past 1; `strike` is where in that cycle the foot on the ball's side lands;
// `dribble` is the dribble's facts: `push`, where in its cycle the ball leaves the hand, and `bounces`, how many times
// it does in one cycle. One stride is one bounce, and the ball leaves the hand as that foot lands.
export function stridePhase(legPhase, strike, dribble) {
  const phase = (dribble.push + (legPhase - strike) / dribble.bounces) % 1;
  return phase < 0 ? phase + 1 : phase;
}
