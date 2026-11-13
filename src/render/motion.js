// Which motion a player shows, and what the shot meter shows, worked out from the match alone. No Three.js here, so it can be tested without a browser.
import { BALL, DT, PLAYER, ROSTER, SHOT } from '../sim/tuning.js';
import { attackSign, onFloor } from '../sim/state.js';
import { gathering, shotWindow } from '../sim/players.js';

// Seconds from leaving the floor to landing, for a full jump.
export const AIR_TIME = (2 * PLAYER.jumpV) / BALL.gravity;

// Speeds in metres per second. stick: how far past an edge he must go before the gait changes.
// minRate, maxRate: limits on how slow or fast a clip is played. fade: seconds to blend from one motion to the next.
// guardDist: a defender this close to his man is drawn facing him. guardSpeed: walking pace: above it a defender turns
// and runs. guardStick: how far past that pace he must go once he is guarding. sideways: degrees either side of
// straight ahead that still count as forward, and the same either side of straight back as backward.
// land: seconds the knees give after a landing. followHold: the share of the follow-through he holds until he lands.
// reachBefore: seconds before a pass arrives that the hands go out for it. catchReach: the share of the catch that is
// the reach. pullIn: seconds to pull a caught ball in. handUpDist: a defender this close to a shooter raises a hand.
// handSide: how far to one side of the way he faces a defender must be before the ball goes to the other hand.
export const MOTION = Object.freeze({
  idleBelow: 0.3, walkBelow: 2.2, runBelow: 5.6, stick: 0.2, minRate: 0.6, maxRate: 1.5, fade: 0.15,
  guardDist: 4, guardSpeed: 2.2, guardStick: 0.4, sideways: 50,
  land: 0.12, followHold: 0.6, reachBefore: 0.2, catchReach: 0.6, pullIn: 0.15, handUpDist: 2, handSide: 0.3,
});

// The shot meter. stay: seconds it is kept after the release. aside: metres it stands from the shooter, on the side
// away from the hoop he attacks. high: the height its top is level with, about his shoulder; it does not rise with his
// jump. ease: the power its axis is bent by, so the last part of the fill's travel, where the band is, is drawn larger.
export const SHOT_METER = Object.freeze({ stay: 1.2, aside: 0.6, high: 1.45, ease: 2 });

// Every motion of the legs, and every motion the arms can take over from them.
export const LEG_CLIPS = Object.freeze(['idle', 'stance', 'walk', 'run', 'sprint', 'strafeLeft', 'strafeRight', 'backpedal', 'jump', 'land', 'gather']);
export const ARM_CLIPS = Object.freeze(['dribble', 'dribbleLeft', 'hold', 'holdLeft', 'shoot', 'follow', 'freeThrow', 'pass', 'catch', 'reach', 'handUp', 'contest', 'tip']);

const GAITS = ['idle', 'walk', 'run', 'sprint'];
const EDGES = [MOTION.idleBelow, MOTION.walkBelow, MOTION.runBelow];   // EDGES[i] lies between GAITS[i] and GAITS[i + 1]
// The gait each other way of standing or stepping counts as, when deciding whether he keeps the one he is in.
const COUNTS_AS = { stance: 'idle', strafeLeft: 'walk', strafeRight: 'walk', backpedal: 'walk' };
const STOPPED = ['freeThrow', 'dead', 'quarterEnd'];   // the phases in which whoever has the ball just holds it

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Seconds from leaving the floor to landing for the jump `player` is in, or last made: a shot's jump is the smaller.
export const airTime = player => (2 * (player.takeoff || PLAYER.jumpV)) / BALL.gravity;

// How far through his jump he is: 0 at take-off, 1 at the landing.
export const jumpShare = player => Math.min(1, player.jumpT / airTime(player));

// The opponent he guards, or is guarded by: the one in the same slot.
export const manOf = (state, player) => state.players.find(o => o.team !== player.team && o.slot === player.slot);

// Whether the ball is in play and the other team's.
export const defending = (state, player) => (state.phase === 'live' || state.phase === 'inbound') && state.possession !== player.team;

// The hand `player` keeps the ball in: the one away from the nearest opponent. `last` is the hand it is in now, kept
// when nobody is near, or when the nearest is so nearly straight ahead or behind that neither hand is further from him.
export function dribbleHand(state, player, last = 'right') {
  const nearest = state.players.filter(o => o.team !== player.team).reduce((a, b) => (dist(b, player) < dist(a, player) ? b : a));
  // Metres he stands to the right of the line the player faces along; negative to its left.
  const right = Math.cos(player.facing) * (nearest.z - player.z) - Math.sin(player.facing) * (nearest.x - player.x);
  if (dist(nearest, player) > MOTION.guardDist || Math.abs(right) < MOTION.handSide) return last;
  return right > 0 ? 'left' : 'right';
}

const HAPPENINGS = ['pass', 'release', 'catch', 'reach', 'land', 'switched'];

// What the renderer remembers from frame to frame, by player id. For each of HAPPENINGS, the seconds since it last
// happened to him (Infinity if never); `guard`, whether he is guarding his man; `hand`, the hand the ball goes in;
// `was`, what the last frame looked like.
export const newMarks = () => ({ pass: {}, release: {}, catch: {}, reach: {}, land: {}, switched: {}, guard: {}, hand: {}, was: null });

// One frame of noticing: `dt` seconds have passed since the last. The first frame has nothing to compare with, so
// nothing counts as having just happened.
export function noteChanges(marks, state, dt) {
  const { ball } = state, was = marks.was, now = { holder: ball.holder, players: {} };
  for (const p of state.players) {
    const id = p.id, before = was?.players[id];
    for (const what of HAPPENINGS) marks[what][id] = (marks[what][id] ?? Infinity) + dt;

    // Past walking pace he turns and runs; near it he stays as he is, so he does not flip between the two.
    const pace = MOTION.guardSpeed + (marks.guard[id] ? MOTION.guardStick : 0);
    marks.guard[id] = defending(state, p) && onFloor(p) && dist(p, manOf(state, p)) <= MOTION.guardDist && Math.hypot(p.vx, p.vz) < pace;
    const hand = dribbleHand(state, p, marks.hand[id] ?? 'right');

    if (before) {
      // A release belongs to the jump it was made on: a later jump without the ball forgets it. Before the release
      // is looked for, because a shot let go on the floor leaves his hands on the frame he takes off.
      if (!before.inAir && !onFloor(p) && !p.shooting) marks.release[id] = Infinity;
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
    now.players[id] = { shooting: p.shooting, inAir: !onFloor(p), stealCooldown: p.stealCooldown };
  }
  marks.was = now;
}

// The way he is drawn facing: a defender guarding his man watches him, whichever way he steps. The rules never read it.
export function drawnFacing(state, player, marks) {
  if (!marks.guard[player.id]) return player.facing;
  const man = manOf(state, player);
  return Math.atan2(man.z - player.z, man.x - player.x);
}

// What legMotion needs to know beyond the player himself. crouch: he holds a ball he has picked up, knees bent to
// pass or shoot; an inbounder stands upright. landed: seconds since he last landed.
export function legLook(state, player, marks) {
  return {
    facing: drawnFacing(state, player, marks),
    defending: defending(state, player),
    guarding: marks.guard[player.id],
    crouch: state.ball.holder === player.id && player.held && !player.inbounder,
    landed: marks.land[player.id],
  };
}

// The step of a guarding defender travelling along (vx, vz) while drawn facing `facing`: a back-step, a side-step
// toward his own left or right, or null when he goes forward and walks or runs as anyone does.
function guardStep(player, facing) {
  const turn = Math.atan2(player.vz, player.vx) - facing;
  const off = (Math.atan2(Math.sin(turn), Math.cos(turn)) * 180) / Math.PI;   // degrees from straight ahead, positive to his right
  if (Math.abs(off) >= 180 - MOTION.sideways) return 'backpedal';
  if (Math.abs(off) > MOTION.sideways) return off < 0 ? 'strafeLeft' : 'strafeRight';
  return null;
}

// The leg motion for `player` (needs vx, vz, y, vy, jumpT). `gaits` is the natural speed of each moving clip; `last`
// is the clip he showed on the previous frame; `look` is what legLook gave. Without a `look` he only stands, walks,
// runs, sprints and jumps.
// Played at a rate: { clip, rate }. Placed by hand: { clip, at }, with `at` from 0 at the clip's start to 1 at its end.
export function legMotion(player, gaits, last = null, look = null) {
  if (!onFloor(player)) return { clip: 'jump', at: jumpShare(player) };
  if (look && gathering(player)) return { clip: 'gather', at: player.shotT / SHOT.gather };
  if (look && look.landed < MOTION.land) return { clip: 'land', at: look.landed / MOTION.land };

  const speed = Math.hypot(player.vx, player.vz);
  let band = EDGES.findIndex(edge => speed < edge);
  if (band < 0) band = GAITS.length - 1;
  // Close to an edge he keeps the gait he is already in, so the legs do not flicker between two clips.
  const kept = GAITS.indexOf(COUNTS_AS[last] ?? last);
  if (Math.abs(kept - band) === 1 && kept >= 0 && Math.abs(speed - EDGES[Math.min(kept, band)]) < MOTION.stick) band = kept;

  if (band === 0) return { clip: look?.defending || look?.crouch ? 'stance' : 'idle', rate: 1 };
  const clip = (look?.guarding && guardStep(player, look.facing)) || GAITS[band];
  // Played faster or slower so the feet cover the ground he really covers.
  return { clip, rate: Math.min(MOTION.maxRate, Math.max(MOTION.minRate, speed / gaits[clip])) };
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

  if (marks.pass[id] < length('pass')) return { clip: 'pass', at: marks.pass[id] / length('pass') };
  const released = marks.release[id], landed = marks.land[id];
  if (state.phase === 'freeThrow' && state.freeThrow.shooter === id && released < length('freeThrow')) {
    return { clip: 'freeThrow', at: released / length('freeThrow') };
  }
  if (!hasBall && released < Infinity) {
    // The arm goes up and stays up while he is in the air, and comes down once he has landed.
    const up = Math.min(MOTION.followHold, released / length('follow'));
    if (inAir && landed > released) return { clip: 'follow', at: up };
    const at = up + landed / length('follow');
    if (!inAir && landed <= released && at < 1) return { clip: 'follow', at };
  }
  // The set point is reached as his feet leave the floor, and held until he lets go.
  if (player.shooting) return { clip: 'shoot', at: Math.min(1, player.shotT / SHOT.gather) };
  if (hasBall && marks.catch[id] < MOTION.pullIn) {
    return { clip: 'catch', at: MOTION.catchReach + ((1 - MOTION.catchReach) * marks.catch[id]) / MOTION.pullIn };
  }
  const arrival = passArrival(state, player);
  if (arrival < MOTION.reachBefore) return { clip: 'catch', at: MOTION.catchReach * (1 - arrival / MOTION.reachBefore) };
  if (hasBall && (player.inbounder || player.held || STOPPED.includes(state.phase))) return { clip: sided('hold'), rate: 1 };
  if (hasBall) return { clip: sided('dribble'), rate: 1 };
  if (marks.reach[id] < length('reach')) return { clip: 'reach', at: marks.reach[id] / length('reach') };
  if (inAir && state.phase === 'jumpBall' && player.slot === 1) return { clip: 'tip', at: jumpShare(player) };
  if (inAir) return { clip: 'contest', at: jumpShare(player) };
  const shooter = o => o.team !== player.team && o.shooting && dist(o, player) <= MOTION.handUpDist;
  if (defending(state, player) && state.players.some(shooter)) return { clip: 'handUp', rate: 1 };
  return null;
}

// One frame of a cross-fade. `weights` is { clip: its share of the pose }; `step` is the share of a whole fade that
// passed this frame. Every other motion fades out and the chosen one takes what is left, so the shares always add up
// to 1: whatever is missing would be filled in with the rest pose, and limbs would flick toward it.
export function fade(weights, chosen, step) {
  let others = 0;
  for (const name in weights) if (name !== chosen) others += weights[name] = Math.max(0, weights[name] - step);
  weights[chosen] = 1 - others;
  return weights;
}

// Throws unless `facts` (assets/motion.json) gives every gait and every guarding step a speed: without one a moving
// player cannot be drawn.
export function checkGaits(facts) {
  for (const gait of [...GAITS.slice(1), 'strafeLeft', 'strafeRight', 'backpedal']) {
    if (!(facts?.gaits?.[gait] > 0)) throw new Error(`assets/motion.json has no speed for "${gait}"`);
  }
}

// The name of a person's model in assets/players.glb.
export const personName = (team, number) => `player-${team}-${number}`;

// The model name for each court player, in `state.players` order.
export const courtPeople = state => state.players.map(p => personName(p.team, state.rosters[p.team][p.person].number));

// Whether a track of a motion is kept at load: every turn of a bone, and where the hips are. The other bones' positions
// and every scale never change, and would stamp the bone lengths of the player the motions were made on onto everyone.
export const keepTrack = name => name.endsWith('.quaternion') || name === 'mixamorigHips.position';

// The gait speeds of a player `scale` times the size of the one they were measured on: longer legs cover more ground.
export function sized(gaits, scale) {
  return Object.fromEntries(Object.entries(gaits).map(([gait, speed]) => [gait, Math.round(speed * scale * 1000) / 1000]));
}

// Every person on a roster who has no model among `names`.
export function missingPeople(names) {
  return ROSTER.numbers.flatMap((numbers, team) => numbers.map(number => personName(team, number))).filter(name => !names.includes(name));
}

// The meter of a shot `t` seconds after its press, beside `player`. `window` is what shotWindow gave, or the record of
// the release, which carries the same fields. The fill and the band are read on one axis, so the fill is inside the
// band exactly when a release at `t` is green.
function meterOf(player, t, window, frozen) {
  const { best, half } = window;
  // How far up the bar a moment `off` seconds before or after the best one sits: the top at the best moment, the
  // bottom at the press, and as far down after it as the same time before it.
  const up = off => Math.max(0, 1 - off / best) ** SHOT_METER.ease;
  return {
    player: player.id,
    x: player.x - attackSign(player.team) * SHOT_METER.aside, z: player.z,
    fill: up(Math.abs(t - best)),
    band: window.inRange ? { from: up(half + DT / 2), to: 1 } : null,   // the half step is greenAt's
    level: window.level,
    frozen,
  };
}

// The shot meter to draw, or null for none. Only team 0 gets one: live while one of them is in his shooting motion,
// then frozen as the rules judged the release, for SHOT_METER.stay seconds of match time.
export function shotMeter(state) {
  if (state.phase === 'start' || state.phase === 'final') return null;
  const shooter = state.players.find(p => p.team === 0 && p.shooting);
  if (shooter) return meterOf(shooter, shooter.shotT, shotWindow(state, shooter), null);

  // The record outlives the shot, until the next press: only a fresh release by team 0 is shown.
  const { shot } = state;
  if (!shot || state.players[shot.shooter].team !== 0 || state.time - shot.at > SHOT_METER.stay) return null;
  const verdict = shot.green ? 'green' : shot.t < shot.best ? 'early' : 'late';
  return meterOf(state.players[shot.shooter], shot.t, shot, { verdict, blocked: shot.blocked });
}
