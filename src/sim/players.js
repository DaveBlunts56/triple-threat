import { BALL, BLOCK, BOARD, CLOCK, COURT, DT, FOUL, PASS, PLAYER, RIM, SHOT, STAMINA, STEAL, THREE_PT } from './tuning.js';
import { attackSign, onFloor as grounded, personOf, rand } from './state.js';
import { shotFactor, speedFactor, spend } from './stamina.js';
import { rimCentre, solveShot, stepBall } from './ball.js';
import { rematch } from './matchups.js';

// Seconds after the press of a shot: the best moment to let go, and the moment he is back on the floor.
export const SHOT_BEST = SHOT.gather + SHOT.bestAt * PLAYER.shotJumpV / BALL.gravity;
export const SHOT_LANDS = SHOT.gather + 2 * PLAYER.shotJumpV / BALL.gravity;

// On the floor between pressing shoot and leaving it. Half a step of slack: shotT is a sum of steps.
export const gathering = player => player.shooting && player.shotT < SHOT.gather - DT / 2;

export function jump(player, speed = PLAYER.jumpV) {
  if (!grounded(player)) return;
  player.vy = player.takeoff = speed;
  player.jumpT = 0;
  // Plant the feet: a jump goes mostly up, so nobody sails out of bounds off a sprint.
  player.vx *= PLAYER.jumpCarry; player.vz *= PLAYER.jumpCarry;
}

function moveOne(p, intent, dt, hasBall, tired) {
  if (p.inbounder) { p.vx = p.vz = 0; return; }

  if (grounded(p)) {
    // Steer toward the wanted velocity. Diagonal input is scaled back to length 1.
    // A player gathering for a shot is deaf to the move keys, so he brakes to a stop.
    const [moveX, moveZ] = gathering(p) ? [0, 0] : [intent.moveX, intent.moveZ];
    const len = Math.hypot(moveX, moveZ);
    const scale = ((intent.sprint ? PLAYER.sprint : PLAYER.run) * (hasBall ? PLAYER.dribbleSpeed : 1) * tired) / Math.max(len, 1);
    const dvx = moveX * scale - p.vx, dvz = moveZ * scale - p.vz;
    const dv = Math.hypot(dvx, dvz), step = PLAYER.accel * dt;
    const k = dv <= step ? 1 : step / dv;
    p.vx += dvx * k; p.vz += dvz * k;
  } else {
    p.y += p.vy * dt - 0.5 * BALL.gravity * dt * dt;
    p.vy -= BALL.gravity * dt;
    p.jumpT += dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; }
  }

  p.x += p.vx * dt; p.z += p.vz * dt;
  if (!p.shooting && Math.hypot(p.vx, p.vz) > 0.5) p.facing = Math.atan2(p.vz, p.vx);   // a shooter keeps facing the hoop
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
    moveOne(p, intents[i], dt, hasBall, speedFactor(personOf(state, p).energy));
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

export function isThree(x, z, sign) {
  return Math.abs(z) > THREE_PT.cornerZ || Math.hypot(x - sign * RIM.x, z) > THREE_PT.radius;
}

// The free ball leaves `player`'s hands: they cannot grab it straight back.
function letGo(state, player, mode) {
  const { ball } = state;
  ball.holder = null; ball.mode = mode; ball.target = null;
  ball.noPickupId = player.id; ball.noPickupT = PASS.noPickup;
  state.lastTouch = player.team;
  player.shooting = false;
}

// How much of a shot's chance its timing keeps, `t` seconds after the press: all of it at the best moment,
// falling in a straight line to the worst at the press and at the landing.
export function shotTiming(t) {
  const off = t < SHOT_BEST ? (SHOT_BEST - t) / SHOT_BEST : (t - SHOT_BEST) / (SHOT_LANDS - SHOT_BEST);
  return 1 - (1 - SHOT.worstTiming) * Math.min(1, off);
}

// The share of a shot's chance the nearest defender leaves it: half with him on the shooter, all of it from
// SHOT.contestDist away, and less again if he is in the air close by.
export function contest(state, player) {
  let nearest = null;
  for (const o of state.players) if (o.team !== player.team && (!nearest || dist(o, player) < dist(nearest, player))) nearest = o;
  const d = dist(nearest, player);
  const factor = clamp(SHOT.maxContest + (1 - SHOT.maxContest) * (d / SHOT.contestDist), SHOT.maxContest, 1);
  return nearest.y > 0 && d < SHOT.airContestDist ? factor * SHOT.airContest : factor;
}

export function makeChance(state, player) {
  const hoop = rimCentre(attackSign(player.team));
  const byDistance = Math.max(SHOT.minChance, SHOT.nearChance + (SHOT.farChance - SHOT.nearChance) * (dist(player, hoop) / SHOT.farDist));
  return byDistance * shotTiming(player.shotT) * contest(state, player) * shotFactor(personOf(state, player).energy);
}

// Behind the backboard of the hoop he attacks, with the board between him and the rim.
export function boardInWay(player) {
  const x = attackSign(player.team) * player.x;
  if (x <= BOARD.x) return false;
  const crossing = player.z * (BOARD.x - RIM.x) / (x - RIM.x);   // where his straight line to the rim centre meets the board's plane
  return Math.abs(crossing) <= BOARD.halfWidth + BALL.radius;
}

// The green window of a shot from where `player` stands: a release within `half` seconds of `best` always goes in.
// It is as wide as his defender allows, and narrows with range and tiredness.
export function shotWindow(state, player) {
  const far = dist(player, rimCentre(attackSign(player.team)));
  const range = clamp(1 - (far - SHOT.greenFull) / (SHOT.greenNone - SHOT.greenFull), 0, 1);
  const guarded = contest(state, player);
  const { name, steps } = SHOT.levels.find(level => level.above <= guarded);
  return {
    best: SHOT_BEST,
    half: steps * DT * range * shotFactor(personOf(state, player).energy),
    level: name,
    inRange: range > 0 && !boardInWay(player),
  };
}

// Half a step of slack: a release can only come on a step, so the step nearest the best moment is always green.
export const greenAt = (window, t) => window.inRange && Math.abs(t - window.best) <= window.half + DT / 2;

export function releaseShot(state, player) {
  const { ball } = state;
  const sign = attackSign(player.team), hoop = rimCentre(sign);
  // Judged from where he stands, before the ball is moved to where it leaves his hand.
  const window = shotWindow(state, player), green = greenAt(window, player.shotT);
  state.shot = { shooter: player.id, t: player.shotT, at: state.time, ...window, green, blocked: false };
  // Released from the player's position, but never from right under the rim, where no arc can get over it:
  // a lay-up leaves the hand a little out in front of the hoop.
  let rx = player.x - hoop.x, rz = player.z - hoop.z;
  const r = Math.hypot(rx, rz);
  if (r < SHOT.minRelease) {
    const k = r > 1e-6 ? SHOT.minRelease / r : 0;
    rx = r > 1e-6 ? -sign * Math.abs(rx * k) : -sign * SHOT.minRelease;   // always on the court side of the rim
    rz *= k;
  }
  ball.x = hoop.x + rx; ball.z = hoop.z + rz; ball.y = player.y + PLAYER.releaseHeight;

  // The nearest opponent in the air and close enough to have made contact, for the rules to judge.
  const close = state.players.filter(o => o.team !== player.team && o.y > 0 && dist(o, player) <= FOUL.contactDist);
  const defender = close.length ? close.reduce((a, b) => (dist(b, player) < dist(a, player) ? b : a)).id : null;

  const blocker = state.players.find(o => o.team !== player.team && o.y > BLOCK.minHeight
    && dist(o, player) <= BLOCK.reach && inArc(player, o, BLOCK.cone));
  if (blocker && rand(state) < BLOCK.chance) {
    letGo(state, player, 'loose');
    state.lastTouch = blocker.team;
    ball.vx = -sign * BLOCK.deflect; ball.vy = 0; ball.vz = 0;
    ball.shooter = null; ball.shotValue = 0;
    state.shot.blocked = true;
    return { shooter: player.id, defender, blocked: true };
  }

  // A green release always goes in, clean, and draws no random number to find out. Other makes sometimes rattle in.
  const made = green || rand(state) < makeChance(state, player);
  launchShot(state, player, made, isThree(player.x, player.z, sign) ? 3 : 2, made && !green && rand(state) < SHOT.rattle);
  return { shooter: player.id, defender, blocked: false };
}

// A launch from where the ball is that bounces on the rim of the hoop at `sign` and then goes in, or null if none of
// the aims tried does. Each aim's flight is played ahead with the ball's own physics.
function rimIn(state, ball, sign) {
  for (let i = 0; i < SHOT.rattleTries; i++) {
    const target = rimCentre(sign);
    const off = SHOT.rattleMin + rand(state) * (SHOT.rattleMax - SHOT.rattleMin), angle = rand(state) * 2 * Math.PI;
    target.x += off * Math.cos(angle); target.z += off * Math.sin(angle);
    const launch = solveShot(ball, target), flight = { x: ball.x, y: ball.y, z: ball.z, ...launch };
    for (let step = 0, touched = -1; step < 300 && flight.y > RIM.height - 1; step++) {
      const events = stepBall(flight, DT);
      if (events.hitRim && touched < 0) touched = step;
      if (!events.scored) continue;
      if (events.scored === sign && touched >= 0 && step - touched >= SHOT.rattleSteps) return launch;
      break;
    }
  }
  return null;
}

// Throws the ball from where it is at the hoop `player` attacks: on target if `made`, otherwise nudged off it. A made
// shot asked to `rattle` comes off the rim on its way in, if such a shot can be found from there.
export function launchShot(state, player, made, value, rattle = false) {
  const { ball } = state;
  const target = rimCentre(attackSign(player.team));
  if (!made) {
    const off = SHOT.missMin + rand(state) * (SHOT.missMax - SHOT.missMin), angle = rand(state) * 2 * Math.PI;
    target.x += off * Math.cos(angle); target.z += off * Math.sin(angle);
  }
  Object.assign(ball, (made && rattle && rimIn(state, ball, attackSign(player.team))) || solveShot(ball, target, made ? RIM.radius : 0));
  ball.shooter = player.id;
  ball.shotValue = value;
  letGo(state, player, 'shot');
}

export function passBall(state, player, intent) {
  const { ball } = state;
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
  const won = rand(state) < (front ? STEAL.frontChance : STEAL.backChance) * (holder.held ? STEAL.heldFactor : 1);
  if (won) { holder.shooting = false; giveBall(state, player); }
  return { won, front };
}

export function tryPickup(state) {
  const { ball } = state;
  if (ball.holder !== null || ball.mode === 'shot') return null;
  // A pass just thrown cannot be snatched at the hand by a defender; teammates may catch it at any range.
  const justThrown = ball.mode === 'pass' && ball.noPickupT > PASS.noPickup - PASS.clearTime;
  let best = null;
  for (const p of state.players) {
    if (justThrown && p.team !== state.lastTouch) continue;
    if (p.inbounder || (p.id === ball.noPickupId && ball.noPickupT > 0)) continue;
    // A pass is caught by the team it was meant for at arm's length; a defender must be right in its path.
    const radius = ball.mode === 'pass' && p.team !== state.lastTouch ? PASS.interceptRadius : PLAYER.pickupRadius;
    if (dist(p, ball) > radius || p.y + PLAYER.reach < ball.y) continue;
    if (!best || dist(p, ball) < dist(best, ball)) best = p;
  }
  return best;
}

// One step of a shot already begun: the gather on the floor, the take-off, then the release or the landing.
function continueShot(state, p, intent, dt, report) {
  const wasGathering = gathering(p);
  p.shotT += dt;
  if (!wasGathering) {
    if (grounded(p)) { p.shooting = false; report.travel = p.id; }   // came down still holding the ball
    else if (!intent.shoot) report.release = releaseShot(state, p);
    return;
  }
  if (!intent.shoot) p.letGo = true;
  if (gathering(p)) return;
  jump(p, PLAYER.shotJumpV); spend(state, p, STAMINA.jump);
  if (p.letGo) report.release = releaseShot(state, p);   // let go on the floor: the ball leaves as his feet do
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
      else if (pressed('shoot') && grounded(p)) {
        // The press: he turns to the hoop and gathers; the jump comes SHOT.gather later.
        const hoop = rimCentre(attackSign(p.team));
        p.facing = Math.atan2(hoop.z - p.z, hoop.x - p.x);
        p.shooting = true; p.shotT = 0; p.letGo = false;
        state.shot = null;
      } else if (pressed('hold') && grounded(p)) {
        if (p.held) report.doubleDribble = p.id;
        else p.held = true;
      }
    } else {
      if (pressed('shoot') && !p.inbounder && grounded(p)) { jump(p); spend(state, p, STAMINA.jump); }
      if (pressed('steal')) {
        const victim = ball.holder;
        const attempt = trySteal(state, p);
        if (attempt && !attempt.won) report.stealMisses.push({ by: p.id, on: victim, front: attempt.front });
      }
      const holder = state.players[ball.holder];
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
