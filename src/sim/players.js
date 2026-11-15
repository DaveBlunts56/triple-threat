import { BALL, BLOCK, BOARD, CLOCK, COURT, DT, FINISH, FOUL, MOVES, PASS, PLAYER, RIM, SHOT, STAMINA, STAT, STEAL, THREE_PT, RATE, HEAT, levelOf } from './tuning.js';
import { attackSign, onFloor as grounded, personOf, rand } from './state.js';
import { shotFactor, speedFactor, spend } from './stamina.js';
import { rimCentre, solveShot, stepBall } from './ball.js';
import { rematch } from './matchups.js';
import { lift, drop, rated, heatOf } from './ratings.js';
import { DRIBBLES, KINDS, startMove, stepMove, finishMove } from './moves.js';
import { note } from './stats.js';
import { behindBoard, finishFor, gatherVelocity, jumpVelocity } from './finish.js';

// Seconds after the press of a shot: the best moment to let go, and the moment he is back on the floor.
export const SHOT_BEST = SHOT.gather + SHOT.bestAt * PLAYER.shotJumpV / BALL.gravity;
export const SHOT_LANDS = SHOT.gather + 2 * PLAYER.shotJumpV / BALL.gravity;

// On the floor between pressing shoot and leaving it. Half a step of slack: shotT is a sum of steps.
// How long he is on the floor between the press and the jump: a finish's two steps take longer than a shot's gather.
export const gatherOf = player => (player.finish ? FINISH.gather : SHOT.gather);
export const gathering = player => player.shooting && player.shotT < gatherOf(player) - DT / 2;
// How hard he jumps for the shot he is in, and from that, seconds after the press, the best moment to let it go and
// the moment he is back on the floor. For a jump shot they are SHOT_BEST and SHOT_LANDS.
export const jumpOf = player => (player.finish ? FINISH.jump[player.finish] : PLAYER.shotJumpV);
export const shotBest = player => gatherOf(player) + SHOT.bestAt * jumpOf(player) / BALL.gravity;
export const shotLands = player => gatherOf(player) + 2 * jumpOf(player) / BALL.gravity;

export function jump(player, speed = PLAYER.jumpV) {
  if (!grounded(player)) return;
  player.vy = player.takeoff = speed;
  player.jumpT = 0;
  // Plant the feet: a jump goes mostly up, so nobody sails out of bounds off a sprint.
  player.vx *= PLAYER.jumpCarry; player.vz *= PLAYER.jumpCarry;
}

// `pace`: what his top speed is multiplied by: his tiredness, his speed rating, and with the ball his handle.
function moveOne(p, intent, dt, hasBall, pace) {
  if (p.inbounder) { p.vx = p.vz = 0; return; }

  if (grounded(p)) {
    // Steer toward the wanted velocity. Diagonal input is scaled back to length 1.
    // A player gathering for a shot is deaf to the move keys, so he brakes to a stop. So does one beaten by a move.
    // In a move of his own his velocity is the move's (stepMove has set it).
    // Gathering for a finish he takes his two steps to the take-off spot, whatever the keys say.
    if (p.finish && gathering(p)) {
      const steps = gatherVelocity(p, p.finish, Math.max(dt, FINISH.gather - p.shotT));
      p.vx = steps.vx; p.vz = steps.vz;
      p.x += p.vx * dt; p.z += p.vz * dt;
      return;
    }
    const [moveX, moveZ] = gathering(p) || p.lateT > 0 ? [0, 0] : [intent.moveX, intent.moveZ];
    const len = Math.hypot(moveX, moveZ);
    const scale = ((intent.sprint ? PLAYER.sprint : PLAYER.run) * (hasBall ? PLAYER.dribbleSpeed : 1) * pace) / Math.max(len, 1);
    const dvx = moveX * scale - p.vx, dvz = moveZ * scale - p.vz;
    const dv = Math.hypot(dvx, dvz), step = PLAYER.accel * dt;
    const k = dv <= step ? 1 : step / dv;
    if (!p.move) { p.vx += dvx * k; p.vz += dvz * k; }
  } else {
    p.y += p.vy * dt - 0.5 * BALL.gravity * dt * dt;
    p.vy -= BALL.gravity * dt;
    p.jumpT += dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; }
  }

  p.x += p.vx * dt; p.z += p.vz * dt;
  if (!p.shooting && !p.move && Math.hypot(p.vx, p.vz) > 0.5) p.facing = Math.atan2(p.vz, p.vx);   // a shooter keeps facing the hoop, and a move does not turn him
}

// Pushes overlapping players apart. Returns the pairs of ids that overlapped.
function separate(players) {
  const min = 2 * PLAYER.radius, touched = [];
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const a = players[i], b = players[j];
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d >= min) continue;
    touched.push([a.id, b.id]);
    // Exactly on top of each other there is no direction to push along: pick +x.
    const nx = d < 1e-6 ? 1 : dx / d, nz = d < 1e-6 ? 0 : dz / d;
    const push = min - d;
    // An inbounder is fixed, so the other player takes the whole push. So does whoever runs into a player who has
    // stood his ground: a screen, or a defender who is set, is a wall.
    const setA = a.setT >= FOUL.setTime, setB = b.setT >= FOUL.setTime;
    const shareA = a.inbounder ? 0 : b.inbounder ? 1 : setA && !setB ? 0 : setB && !setA ? 1 : 0.5;
    a.x -= nx * push * shareA; a.z -= nz * push * shareA;
    b.x += nx * push * (1 - shareA); b.z += nz * push * (1 - shareA);
  }
  return touched;
}

function clampToCourt(p) {
  if (p.inbounder) return;
  const maxX = COURT.halfLength + COURT.margin, maxZ = COURT.halfWidth + COURT.margin;
  if (Math.abs(p.x) > maxX) { p.x = Math.sign(p.x) * maxX; p.vx = 0; }
  if (Math.abs(p.z) > maxZ) { p.z = Math.sign(p.z) * maxZ; p.vz = 0; }
}

// Moves everyone one step. Returns the pairs of player ids that ran into each other.
export function movePlayers(state, intents, dt) {
  state.players.forEach((p, i) => {
    const hasBall = state.ball.holder === p.id;
    const pace = speedFactor(personOf(state, p).energy) * lift(rated(state, p, 'speed'), RATE.speed) * (hasBall ? lift(rated(state, p, 'handle'), RATE.speed) : 1);
    if (p.move) stepMove(state, p, dt);
    moveOne(p, intents[i], dt, hasBall, pace);
    finishMove(state, p);
    p.moveWait = Math.max(0, p.moveWait - dt); p.lateT = Math.max(0, p.lateT - dt); p.stumbleT = Math.max(0, p.stumbleT - dt);
    // Once he has picked up his dribble, every metre on the floor counts toward a travel, but not the slide of a gather.
    const speed = Math.hypot(p.vx, p.vz);
    if (hasBall && p.held && grounded(p) && !gathering(p)) p.steps += speed * dt;
    p.setT = speed < FOUL.setSpeed ? p.setT + dt : 0;   // how long he has stood his ground
  });
  const contacts = separate(state.players);
  state.players.forEach(clampToCourt);
  return contacts;
}

// Keeps a held ball in the holder's hand; bounces it while they run (looks only).
export function carryBall(state, dt) {
  const { ball } = state;
  if (ball.holder === null) return;
  const p = state.players[ball.holder];
  ball.x = p.x + Math.cos(p.facing) * PLAYER.carryDist;
  ball.z = p.z + Math.sin(p.facing) * PLAYER.carryDist;
  ball.vx = p.vx; ball.vy = 0; ball.vz = p.vz;
  const dribbling = grounded(p) && !p.shooting && !p.inbounder && !p.held && Math.hypot(p.vx, p.vz) > 0.5;
  if (p.shooting) ball.y = p.y + PLAYER.releaseHeight;
  else if (dribbling) ball.y = BALL.radius + Math.abs(Math.sin(state.time * Math.PI * PLAYER.dribbleRate)) * (PLAYER.handHeight - BALL.radius);
  else ball.y = p.y + PLAYER.handHeight;
}

// ---------- actions ----------

const rad = deg => (deg * Math.PI) / 180;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
// Is `target` within `degrees` either side of the way `p` is facing?
const inArc = (p, target, degrees) =>
  Math.cos(p.facing) * (target.x - p.x) + Math.sin(p.facing) * (target.z - p.z) >= Math.cos(rad(degrees)) * dist(p, target);

// Where `player` stands for a shot at the hoop he attacks: 'inside' within SHOT.insideDist of it, 'three' behind the
// line, 'mid' between. It says which of his ratings a shot from there is taken on.
export function zoneOf(player) {
  const sign = attackSign(player.team);
  if (isThree(player.x, player.z, sign)) return 'three';
  return dist(player, rimCentre(sign)) < SHOT.insideDist ? 'inside' : 'mid';
}

export function isThree(x, z, sign) {
  return Math.abs(z) > THREE_PT.cornerZ || Math.hypot(x - sign * RIM.x, z) > THREE_PT.radius;
}

// The free ball leaves `player`'s hands: they cannot grab it straight back.
function letGo(state, player, mode) {
  const { ball } = state;
  ball.holder = null; ball.mode = mode; ball.target = null;
  ball.noPickupId = player.id; ball.noPickupT = PASS.noPickup;
  state.lastTouch = player.team;
  player.shooting = false; player.fading = false; player.finish = null;
}

// How much of a shot's chance its timing keeps, `t` seconds after the press: all of it at the best moment,
// falling in a straight line to the worst at the press and at the landing.
export function shotTiming(t, worst = SHOT.worstTiming, best = SHOT_BEST, lands = SHOT_LANDS) {
  const off = t < best ? (best - t) / best : (t - best) / (lands - best);
  return 1 - (1 - worst) * Math.min(1, off);
}

// The share of a shot's chance the nearest defender leaves it: half with him on the shooter (less with a good
// defender, more with a poor one), all of it from SHOT.contestDist away, and less again if he is in the air close by.
export function contest(state, player) {
  let nearest = null;
  for (const o of state.players) if (o.team !== player.team && (!nearest || dist(o, player) < dist(nearest, player))) nearest = o;
  const d = dist(nearest, player);
  const byDistance = clamp(SHOT.maxContest + (1 - SHOT.maxContest) * (d / SHOT.contestDist), SHOT.maxContest, 1);
  // A better defender takes more off the shot from the same distance.
  const factor = clamp(1 - (1 - byDistance) * lift(rated(state, nearest, 'defence'), RATE.contest), 0, 1);
  const left = nearest.y > 0 && d < SHOT.airContestDist ? factor * SHOT.airContest : factor;
  return player.fading ? 1 - (1 - left) * MOVES.fade.contest : left;   // a fade is harder to get to
}

export function makeChance(state, player) {
  const hoop = rimCentre(attackSign(player.team));
  const byDistance = Math.max(SHOT.minChance, SHOT.nearChance + (SHOT.farChance - SHOT.nearChance) * (dist(player, hoop) / SHOT.farDist));
  const timing = shotTiming(player.shotT, player.team === 0 ? levelOf(state).timing : SHOT.worstTiming, shotBest(player), shotLands(player));   // a bad release costs you what the level says
  // His rating for a shot from where he stands counts for or against him.
  const heat = heatOf(personOf(state, player));
  const skill = lift(rated(state, player, zoneOf(player)), RATE.shot) * (heat === 'hot' ? HEAT.hot : heat === 'cold' ? HEAT.cold : 1);
  return clamp(byDistance * timing * contest(state, player) * shotFactor(personOf(state, player).energy) * (player.team === 0 ? levelOf(state).make : levelOf(state).cpuMake) * skill * (player.fading ? MOVES.fade.make : 1), 0, 1);
}

// Behind the backboard of the hoop he attacks, with the board between him and the rim.
export const boardInWay = behindBoard;

// The green window of a shot from where `player` stands: a release within `half` seconds of `best` always goes in.
// It is as wide as his defender allows, and narrows with range and tiredness.
export function shotWindow(state, player) {
  const far = dist(player, rimCentre(attackSign(player.team)));
  const range = clamp(1 - (far - SHOT.greenFull) / (SHOT.greenNone - SHOT.greenFull), 0, 1);
  const guarded = contest(state, player);
  const { name, steps } = SHOT.levels.find(level => level.above <= guarded);
  return {
    best: shotBest(player),
    // Your window is the level's, and so is the computer's team's; anybody's is wider the better he shoots from there.
    half: steps * DT * range * shotFactor(personOf(state, player).energy) * (player.team === 0 ? levelOf(state).green : levelOf(state).cpuGreen)
      * Math.max(0, lift(rated(state, player, zoneOf(player)), RATE.window)) * (heatOf(personOf(state, player)) === 'hot' ? HEAT.hotWindow : 1),
    level: name,
    inRange: range > 0 && !boardInWay(player),
  };
}

// Half a step of slack: a release can only come on a step, so the step nearest the best moment is always green.
export const greenAt = (window, t) => window.inRange && Math.abs(t - window.best) <= window.half + DT / 2;

// Counts a shot from the floor toward his streak: his makes in a row, or his misses in a row as a negative number.
function streak(state, player, made) {
  const person = personOf(state, player);
  person.streak = made ? Math.max(person.streak, 0) + 1 : Math.min(person.streak, 0) - 1;
}

// What a shot is, for the box score and for whoever watches it go in: noted as an attempt, and returned as the record
// the basket will be remembered by.
function shotInfo(state, player, green) {
  const sign = attackSign(player.team), hoop = rimCentre(sign);
  const three = isThree(player.x, player.z, sign), gap = Math.min(...state.players.filter(o => o.team !== player.team).map(o => dist(o, player)));
  note(state, player, 'fga'); if (three) note(state, player, 'tpa');
  return { id: player.id, team: player.team, row: player.person, value: three ? 3 : 2, at: state.time, clock: state.gameClock,
    x: player.x, z: player.z, far: dist(player, hoop), gap, green, finish: player.finish,
    assist: player.fed && state.time - player.fed.at <= STAT.assist ? player.fed.row : null };
}

// The nearest opponent in the air and close enough to have made contact, for the rules to judge: his id, or null.
function contactOf(state, player) {
  const close = state.players.filter(o => o.team !== player.team && o.y > 0 && dist(o, player) <= FOUL.contactDist);
  return close.length ? close.reduce((a, b) => (dist(b, player) < dist(a, player) ? b : a)).id : null;
}

// Whether the shot `player` is letting go is blocked, and by whom: a defender in the air in front of him within reach
// gets it some of the time. A block knocks the ball loose and is recorded; returns the blocker, or null.
function blockedBy(state, player) {
  const { ball } = state, sign = attackSign(player.team), hoop = rimCentre(sign);
  const blocker = state.players.find(o => o.team !== player.team && o.y > BLOCK.minHeight
    && dist(o, player) <= BLOCK.reach * (player.fading ? MOVES.fade.block : 1) && inArc(player, o, BLOCK.cone));
  if (!blocker || rand(state) >= BLOCK.chance * (player.finish ? FINISH.block : 1)) return null;
  letGo(state, player, 'loose');
  state.lastTouch = blocker.team;
  ball.vx = -sign * BLOCK.deflect; ball.vy = 0; ball.vz = 0;
  ball.shooter = null; ball.shotValue = 0;
  state.shot.blocked = true;
  streak(state, player, false);
  // A chase-down: the blocker came from behind him, at a run toward that hoop.
  const toHoop = dist(blocker, hoop) || 1, pace = (blocker.vx * (hoop.x - blocker.x) + blocker.vz * (hoop.z - blocker.z)) / toHoop;
  note(state, blocker, 'blk');
  state.last.block = { by: blocker.id, on: player.id, at: state.time, chase: pace > STAT.chasePace && dist(blocker, hoop) >= dist(player, hoop) - STAT.chaseBehind };
  state.board = true; ball.info = null;
  return blocker;
}

// Puts the ball where a shot leaves his hand: at the player's position, but never right under the rim, where no arc
// can get over it: a lay-up leaves the hand a little out in front of the hoop.
function toRelease(state, player) {
  const { ball } = state, sign = attackSign(player.team), hoop = rimCentre(sign);
  let rx = player.x - hoop.x, rz = player.z - hoop.z;
  // A layup is rolled off the fingers of a raised arm: from above his head, out toward the rim.
  const layup = player.finish === 'layup', far = Math.hypot(rx, rz);
  if (layup && far > 1e-6) { const k = Math.max(0, far - FINISH.release.ahead) / far; rx *= k; rz *= k; }
  const r = Math.hypot(rx, rz);
  if (r < SHOT.minRelease) {
    const k = r > 1e-6 ? SHOT.minRelease / r : 0;
    rx = r > 1e-6 ? -sign * Math.abs(rx * k) : -sign * SHOT.minRelease;   // always on the court side of the rim
    rz *= k;
  }
  ball.x = hoop.x + rx; ball.z = hoop.z + rz; ball.y = player.y + (layup ? FINISH.release.up : PLAYER.releaseHeight);
}

// `green: false`: the release cannot be green, however it is timed (a layup let go by a tap, a dunk kept from the rim).
export function releaseShot(state, player, { green: mayBeGreen = true } = {}) {
  const { ball } = state;
  // Judged from where he stands, before the ball is moved to where it leaves his hand.
  const window = shotWindow(state, player), green = mayBeGreen && greenAt(window, player.shotT);
  state.shot = { shooter: player.id, t: player.shotT, at: state.time, clock: state.gameClock, ...window, green, blocked: false, finish: player.finish };
  // For the box score: the attempt, and what the basket will be remembered by if it goes in.
  const info = shotInfo(state, player, green);
  toRelease(state, player);
  const defender = contactOf(state, player);
  if (blockedBy(state, player)) return { shooter: player.id, defender, blocked: true };

  // A green release always goes in, clean, and draws no random number to find out. Other makes go in every way a
  // shot can: clean, off the rim, rolling round it, or off the glass. Some misses sit on the rim before they fall out.
  const made = green || rand(state) < makeChance(state, player);
  streak(state, player, made);
  const dice = made && green ? 1 : rand(state);
  // A layup that goes in is rolled over the front of the rim: it is not banked in, and does not rattle.
  const how = !made ? (dice < SHOT.tease ? 'tease' : 'clean') : green || player.finish === 'layup' ? 'clean' : ['clean', 'rattle', 'roll', 'bank'][SHOT.ways.findIndex(share => dice < share)];
  launchShot(state, player, made, info.value, how);
  ball.info = info;
  return { shooter: player.id, defender, blocked: false };
}

// An open dunk nearly always goes down; a defender on him takes some of that, less than he takes off a shot.
export const dunkChance = (state, player) => FINISH.dunkChance * (1 - FINISH.dunkContest * (1 - contest(state, player)));

// The dunk's moment: the ball goes down through the rim, or is blocked, or comes off the back of it. Kept from the
// rim, he lays it up from where he is instead. Returns what releaseShot returns.
function releaseDunk(state, player) {
  const { ball } = state, hoop = rimCentre(attackSign(player.team));
  if (dist(player, hoop) > FINISH.reach) { player.finish = 'layup'; return releaseShot(state, player, { green: false }); }
  state.shot = { shooter: player.id, t: player.shotT, at: state.time, clock: state.gameClock, ...shotWindow(state, player), green: false, blocked: false, finish: 'dunk' };
  const info = shotInfo(state, player, false);
  toRelease(state, player);                      // where a block or a miss finds the ball
  const defender = contactOf(state, player);
  if (blockedBy(state, player)) return { shooter: player.id, defender, blocked: true };
  const made = rand(state) < dunkChance(state, player);
  streak(state, player, made);
  if (made) {
    Object.assign(ball, { x: hoop.x, y: RIM.height + BALL.radius + 0.05, z: hoop.z, vx: 0, vy: -FINISH.dunkDrop, vz: 0, shooter: player.id, shotValue: 2, made: true });
    letGo(state, player, 'shot');
  } else launchShot(state, player, false, 2, 'clean');
  ball.info = info;
  return { shooter: player.id, defender, blocked: false };
}

// A number from 0 to 1 that differs from shot to shot, worked out from where and when the shot is taken: it draws
// nothing from the match's dice, so a green release still draws none.
function vary(state, player, salt) {
  const v = Math.sin(state.time * 127.1 + player.x * 311.7 + player.z * 74.7 + salt * 19.19) * 43758.5453;
  return v - Math.floor(v);
}

// A launch from where the ball is, at the hoop at `sign`, that does what `how` asks, or null if none of the aims tried
// does. Each aim's flight is played ahead with the ball's own physics. 'rattle': it comes off the rim and drops (a
// ball that only clips the rim on its way down does not count). 'roll': it bounces on the rim two times or more
// before it drops. 'bank': it goes in off the backboard. 'tease': it bounces on the rim twice or more and stays out.
function findShot(state, ball, sign, how) {
  for (let i = 0; i < SHOT.rattleTries; i++) {
    const target = rimCentre(sign), turn = rand(state) * 2 * Math.PI, loft = rand(state) * SHOT.loft;
    if (how === 'bank') {
      // A spot on the glass above the rim, a little to either side.
      Object.assign(target, { x: sign * (BOARD.x - BALL.radius), y: RIM.height + SHOT.bankLow + rand(state) * (SHOT.bankHigh - SHOT.bankLow), z: Math.cos(turn) * SHOT.bankWide });
    } else {
      const off = SHOT.rattleMin + rand(state) * (SHOT.rattleMax - SHOT.rattleMin);
      target.x += off * Math.cos(turn); target.z += off * Math.sin(turn);
    }
    const launch = solveShot(ball, target, 0, loft), flight = { x: ball.x, y: ball.y, z: ball.z, ...launch };
    let first = -1, last = -9, bounces = 0, board = false, scored = false, step = 0;
    for (; step < 400 && flight.y > RIM.height - 1; step++) {
      const events = stepBall(flight, DT);
      if (events.hitBoard) board = true;
      if (events.hitRim) { if (first < 0) first = step; if (step - last > 2) bounces++; last = step; }   // touches on steps apart are separate bounces
      if (events.scored) { scored = events.scored === sign; break; }
    }
    const good = how === 'tease' ? !scored && bounces >= SHOT.rollBounces
      : scored && (how === 'bank' ? board : how === 'roll' ? bounces >= SHOT.rollBounces : first >= 0 && step - first >= SHOT.rattleSteps);
    if (good) return launch;
  }
  return null;
}

// Throws the ball from where it is at the hoop `player` attacks: on target if `made`, otherwise nudged off it. No two
// shots fly alike: each is thrown a little flatter or higher than the last. A made shot is 'clean', or is asked to
// 'rattle', 'roll' on the rim or 'bank' in, if such a shot can be found from there; a miss may be asked to 'tease':
// to sit on the rim and fall out.
export function launchShot(state, player, made, value, how = 'clean') {
  const { ball } = state, sign = attackSign(player.team);
  const target = rimCentre(sign);
  let launch = null;
  if (how !== 'clean') launch = findShot(state, ball, sign, how) ?? (made && how !== 'rattle' ? findShot(state, ball, sign, 'rattle') : null);
  if (!launch && !made) {
    const off = SHOT.missMin + rand(state) * (SHOT.missMax - SHOT.missMin), angle = rand(state) * 2 * Math.PI;
    target.x += off * Math.cos(angle); target.z += off * Math.sin(angle);
  }
  // A lay-up is thrown as it must be to clear the rim; from further out there is room to throw it higher.
  const room = Math.min(1, Math.max(0, (dist(ball, target) - SHOT.loftFrom) / SHOT.loftFrom));
  Object.assign(ball, launch ?? solveShot(ball, target, made ? RIM.radius : 0, vary(state, player, 1) * SHOT.loft * room));
  ball.shooter = player.id;
  ball.shotValue = value;
  ball.made = made; ball.info = null;   // a shot from the floor says what it is after this (releaseShot)
  letGo(state, player, 'shot');
}

export function passBall(state, player, intent) {
  const { ball } = state;
  state.passer = player.id;   // who threw the last pass, for whoever catches it
  const mates = state.players.filter(m => m.team === player.team && m !== player);
  const len = Math.hypot(intent.moveX, intent.moveZ);
  // With a direction held, the teammate most in line with it; otherwise the nearest.
  const score = len > 0.1
    ? m => (intent.moveX * (m.x - player.x) + intent.moveZ * (m.z - player.z)) / (dist(m, player) || 1)
    : m => -dist(m, player);
  const mate = mates.reduce((best, m) => (score(m) > score(best) ? m : best));

  // Aim at the point where the ball and the receiver meet: |r + v t| = speed * t + carryDist, solved for t.
  const rx = mate.x - player.x, rz = mate.z - player.z;
  const a = PASS.speed ** 2 - mate.vx ** 2 - mate.vz ** 2;   // positive: the ball is faster than any player
  const b = rx * mate.vx + rz * mate.vz - PASS.speed * PLAYER.carryDist;
  const lead = Math.max(0, (b + Math.sqrt(Math.max(0, b * b + a * (rx * rx + rz * rz - PLAYER.carryDist ** 2)))) / a);
  const inCourt = (v, half) => clamp(v, -half + PLAYER.radius, half - PLAYER.radius);
  const ax = inCourt(mate.x + mate.vx * lead, COURT.halfLength) - player.x;
  const az = inCourt(mate.z + mate.vz * lead, COURT.halfWidth) - player.z;
  const d = Math.hypot(ax, az) || 1, t = Math.max(0, d - PLAYER.carryDist) / PASS.speed;   // the ball starts a little ahead of the passer
  player.facing = Math.atan2(az, ax);
  ball.x = player.x + (ax / d) * PLAYER.carryDist; ball.z = player.z + (az / d) * PLAYER.carryDist;
  ball.y = player.y + PASS.height;
  ball.vx = (ax / d) * PASS.speed; ball.vz = (az / d) * PASS.speed;
  ball.vy = (BALL.gravity * t) / 2;   // enough lift to arrive at the height it left
  ball.shooter = null; ball.shotValue = 0;
  letGo(state, player, 'pass');   // control moves to the receiver when they catch it (giveBall), so they keep running onto the pass
  ball.target = mate.id;
}

export function giveBall(state, player) {
  const { ball } = state;
  // For the box score. A missed shot taken is a rebound. A pass caught by the other team is a steal, and by his own
  // team is remembered, in case he scores off it.
  const passer = ball.mode === 'pass' ? state.players[state.passer] : null;
  if (state.board && state.phase !== 'dead') note(state, player, 'reb');
  state.board = false;
  if (passer && passer.team !== player.team) {
    note(state, player, 'stl'); note(state, passer, 'tov');
    state.last.steal = { by: player.id, on: passer.id, at: state.time };
  }
  player.fed = passer && passer.team === player.team && passer !== player ? { row: passer.person, at: state.time } : null;
  ball.holder = player.id; ball.mode = 'held'; ball.target = null;
  ball.shooter = null; ball.shotValue = 0;
  player.held = false; player.steps = 0;   // a live dribble
  if (state.possession !== player.team) {
    state.shotClock = CLOCK.shot;
    if (state.phase === 'live') rematch(state, 1 - player.team);   // the team that lost it gets back to whoever is nearest
  }
  state.possession = state.lastTouch = player.team;
  if (player.team === 0) state.controlled = player.id;
}

// Returns null when no attempt was made, otherwise whether it won the ball and whether it came from in front.
export function trySteal(state, player) {
  const holder = state.players[state.ball.holder];
  if (player.stealCooldown > 0 || !holder || holder.team === player.team || holder.inbounder) return null;
  if (dist(holder, player) > STEAL.reach) return null;
  player.stealCooldown = STEAL.cooldown;
  const front = inArc(holder, player, STEAL.frontArc);
  // A better defender wins more of his reaches, and a better handler loses fewer.
  const skill = lift(rated(state, player, 'defence'), RATE.steal) * drop(rated(state, holder, 'handle'), RATE.steal);
  // In a dribble move the ball is easier or harder to get at, and behind his back it cannot be had from in front.
  const move = holder.move && DRIBBLES.includes(holder.move.kind) ? MOVES[holder.move.kind] : null;
  const guarded = move ? (move.hidden && front ? 0 : move.steal) : 1;
  // In a finish he has it in both hands through his two steps, and high in one as he goes up: hard to get at.
  const gripped = holder.finish ? FINISH.stealFactor : 1;
  const won = rand(state) < clamp((front ? STEAL.frontChance : STEAL.backChance) * (holder.held ? STEAL.heldFactor : 1) * skill * guarded * gripped, 0, 1);
  if (won) {
    holder.shooting = false; holder.fading = false; holder.finish = null;
    note(state, player, 'stl'); note(state, holder, 'tov');
    state.last.steal = { by: player.id, on: holder.id, at: state.time };
    giveBall(state, player);
  }
  return { won, front };
}

export function tryPickup(state) {
  const { ball } = state;
  if (ball.holder !== null || ball.mode === 'shot') return null;
  // A pass just thrown cannot be snatched at the hand by a defender; teammates may catch it at any range.
  const justThrown = ball.mode === 'pass' && ball.noPickupT > PASS.noPickup - PASS.clearTime;
  let best = null, bestFar = Infinity;
  for (const p of state.players) {
    if (justThrown && p.team !== state.lastTouch) continue;
    if (p.inbounder || (p.id === ball.noPickupId && ball.noPickupT > 0)) continue;
    // A pass is caught by the team it was meant for at arm's length; a defender must be right in its path.
    const radius = ball.mode === 'pass' && p.team !== state.lastTouch ? PASS.interceptRadius : PLAYER.pickupRadius;
    if (dist(p, ball) > radius || p.y + PLAYER.reach < ball.y) continue;
    // A pass goes to whoever it reaches first. Any other ball two can reach goes to the better rebounder more often
    // than to the nearer man: each counts as nearer by his rebound rating.
    const far = dist(p, ball) / (ball.mode === 'pass' ? 1 : lift(rated(state, p, 'rebound'), RATE.rebound));
    if (!best || far < bestFar) { best = p; bestFar = far; }
  }
  return best;
}

// One step of a shot already begun: the gather on the floor, the take-off, then the release or the landing.
function continueShot(state, p, intent, dt, report) {
  const wasGathering = gathering(p);
  p.shotT += dt;
  if (!wasGathering) {
    if (grounded(p)) { p.shooting = false; p.fading = false; p.finish = null; report.travel = p.id; }   // came down still holding the ball
    // A dunk has nothing to time: the ball goes down at its moment of the jump.
    else if (p.finish === 'dunk') { if (p.jumpT >= FINISH.dunkMoment * 2 * FINISH.jump.dunk / BALL.gravity - DT / 2) report.release = releaseDunk(state, p); }
    // A layup let go by a tap goes at the best moment, and is not green; one still held as he starts down goes then.
    else if (p.finish === 'layup' && p.letGo) { if (p.shotT >= shotBest(p) - DT / 2) report.release = releaseShot(state, p, { green: false }); }
    else if (!intent[p.shotKey] || (p.finish === 'layup' && p.vy < 0)) report.release = releaseShot(state, p);
    return;
  }
  if (!intent[p.shotKey]) p.letGo = true;
  if (gathering(p)) return;
  jump(p, jumpOf(p)); spend(state, p, STAMINA.jump);
  if (p.finish) {
    // The jump of a finish carries him to the rim (see finish.js).
    const carry = jumpVelocity(p, p.finish);
    p.vx = carry.vx; p.vz = carry.vz;
  }
  if (p.fading) {
    // He goes up leaning away from the hoop and floats back MOVES.fade.drift before he lands.
    const hoop = rimCentre(attackSign(p.team)), far = dist(p, hoop) || 1, pace = MOVES.fade.drift / ((2 * PLAYER.shotJumpV) / BALL.gravity);
    p.vx = ((p.x - hoop.x) / far) * pace; p.vz = ((p.z - hoop.z) / far) * pace;
  }
  if (p.letGo && !p.finish) report.release = releaseShot(state, p);   // let go on the floor: the ball leaves as his feet do
}

// Turns this step's intents into shots, passes, steals, jumps, control switches and pickups.
// Returns what the rules may want to judge: it reports, and never calls anything itself.
export function applyActions(state, intents, dt) {
  const { ball } = state;
  const report = { travel: null, doubleDribble: null, stealMisses: [], release: null };
  ball.noPickupT = Math.max(0, ball.noPickupT - dt);

  state.players.forEach((p, i) => {
    const intent = intents[i];
    const pressed = key => intent[key] && !p.prev[key];
    p.stealCooldown = Math.max(0, p.stealCooldown - dt);

    if (ball.holder === p.id) {
      if (pressed('pass')) passBall(state, p, intent);
      else if (p.inbounder) { /* an inbounder may only pass */ }
      else if (p.shooting) continueShot(state, p, intent, dt, report);
      else if (KINDS.some(kind => pressed(kind) && startMove(state, p, kind, intent))) { /* a move has begun */ }
      else if ((pressed('shoot') || pressed('fade') || pressed('dunk')) && grounded(p)) {
        // The press: he turns to the hoop and gathers; the jump comes SHOT.gather later. On the fade key, close enough
        // to the hoop, the shot is a fade; further out that key is a plain shot. Driving at the rim the shot key is a
        // layup and the dunk key a dunk, or a layup for a player who cannot dunk (see finish.js); anywhere else the
        // dunk key is nothing.
        const key = pressed('shoot') ? 'shoot' : pressed('fade') ? 'fade' : 'dunk';
        const finish = key === 'fade' ? null : finishFor(state, p, key);
        if (key !== 'dunk' || finish) {
          const hoop = rimCentre(attackSign(p.team));
          p.facing = Math.atan2(hoop.z - p.z, hoop.x - p.x);
          p.shooting = true; p.shotT = 0; p.letGo = false;
          p.shotKey = key; p.finish = finish;
          p.fading = key === 'fade' && dist(p, hoop) <= MOVES.fade.within;
          state.shot = null;
        }
      } else if (pressed('hold') && grounded(p)) {
        if (p.held) report.doubleDribble = p.id;
        else p.held = true;
      }
    } else {
      if (p.shooting) { p.shooting = false; p.fading = false; p.finish = null; }   // the ball has left him some other way: no shot is left in his hands
      if (pressed('shoot') && !p.inbounder && grounded(p)) { jump(p); spend(state, p, STAMINA.jump); }
      if (pressed('steal')) {
        const victim = ball.holder;
        const attempt = trySteal(state, p);
        if (attempt && !attempt.won) report.stealMisses.push({ by: p.id, on: victim, front: attempt.front });
      }
      const holder = state.players[ball.holder];
      // A foul on purpose: he grabs a ball handler he can reach, and the whistle goes.
      if (pressed('foul') && holder && holder.team !== p.team && !holder.inbounder && dist(p, holder) <= STEAL.reach) {
        report.stealMisses.push({ by: p.id, on: holder.id, front: true, sure: true });
      }
      // Not while your own team's pass is in the air: the pass key is also the switch key,
      // and control has just moved to the receiver.
      const ownPass = ball.mode === 'pass' && state.lastTouch === 0;
      if (pressed('switch') && p.id === state.controlled && !ownPass && (!holder || holder.team !== 0)) {
        state.controlled = state.players.filter(m => m.team === 0).reduce((a, b) => (dist(b, ball) < dist(a, ball) ? b : a)).id;
      }
    }
    p.prev = { ...intent };
  });

  const taker = tryPickup(state);
  if (taker) giveBall(state, taker);
  return report;
}
