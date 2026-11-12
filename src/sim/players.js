import { BALL, BLOCK, CLOCK, COURT, PASS, PLAYER, RIM, SHOT, STEAL, THREE_PT } from './tuning.js';
import { attackSign, rand } from './state.js';
import { rimCentre, solveShot } from './ball.js';

const grounded = p => p.y === 0 && p.vy === 0;

export function jump(player) {
  if (!grounded(player)) return;
  player.vy = PLAYER.jumpV;
  player.jumpT = 0;
  // Plant the feet: a jump goes mostly up, so nobody sails out of bounds off a sprint.
  player.vx *= PLAYER.jumpCarry; player.vz *= PLAYER.jumpCarry;
}

function moveOne(p, intent, dt, hasBall) {
  if (p.inbounder) { p.vx = p.vz = 0; return; }

  if (grounded(p)) {
    // Steer toward the wanted velocity. Diagonal input is scaled back to length 1.
    const len = Math.hypot(intent.moveX, intent.moveZ);
    const scale = ((intent.sprint ? PLAYER.sprint : PLAYER.run) * (hasBall ? PLAYER.dribbleSpeed : 1)) / Math.max(len, 1);
    const dvx = intent.moveX * scale - p.vx, dvz = intent.moveZ * scale - p.vz;
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
  if (Math.hypot(p.vx, p.vz) > 0.5) p.facing = Math.atan2(p.vz, p.vx);
}

function separate(players) {
  const min = 2 * PLAYER.radius;
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const a = players[i], b = players[j];
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d >= min) continue;
    // Exactly on top of each other there is no direction to push along: pick +x.
    const nx = d < 1e-6 ? 1 : dx / d, nz = d < 1e-6 ? 0 : dz / d;
    const push = min - d;
    // An inbounder is fixed, so the other player takes the whole push.
    const shareA = a.inbounder ? 0 : b.inbounder ? 1 : 0.5;
    a.x -= nx * push * shareA; a.z -= nz * push * shareA;
    b.x += nx * push * (1 - shareA); b.z += nz * push * (1 - shareA);
  }
}

function clampToCourt(p) {
  if (p.inbounder) return;
  const maxX = COURT.halfLength + COURT.margin, maxZ = COURT.halfWidth + COURT.margin;
  if (Math.abs(p.x) > maxX) { p.x = Math.sign(p.x) * maxX; p.vx = 0; }
  if (Math.abs(p.z) > maxZ) { p.z = Math.sign(p.z) * maxZ; p.vz = 0; }
}

export function movePlayers(state, intents, dt) {
  state.players.forEach((p, i) => moveOne(p, intents[i], dt, state.ball.holder === p.id));
  separate(state.players);
  state.players.forEach(clampToCourt);
}

// Keeps a held ball in the holder's hand; bounces it while they run (looks only).
export function carryBall(state, dt) {
  const { ball } = state;
  if (ball.holder === null) return;
  const p = state.players[ball.holder];
  ball.x = p.x + Math.cos(p.facing) * PLAYER.carryDist;
  ball.z = p.z + Math.sin(p.facing) * PLAYER.carryDist;
  ball.vx = p.vx; ball.vy = 0; ball.vz = p.vz;
  const dribbling = grounded(p) && !p.shooting && !p.inbounder && Math.hypot(p.vx, p.vz) > 0.5;
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
  ball.holder = null; ball.mode = mode;
  ball.noPickupId = player.id; ball.noPickupT = PASS.noPickup;
  state.lastTouch = player.team;
  player.shooting = false;
}

export function makeChance(state, player) {
  const hoop = rimCentre(attackSign(player.team));
  const byDistance = Math.max(SHOT.minChance, SHOT.nearChance + (SHOT.farChance - SHOT.nearChance) * (dist(player, hoop) / SHOT.farDist));

  const apex = PLAYER.jumpV / BALL.gravity;
  const byTiming = 1 - (1 - SHOT.worstTiming) * Math.min(1, Math.abs(player.jumpT - apex) / apex);

  let nearest = null;
  for (const o of state.players) if (o.team !== player.team && (!nearest || dist(o, player) < dist(nearest, player))) nearest = o;
  const d = dist(nearest, player);
  let byContest = clamp(SHOT.maxContest + (1 - SHOT.maxContest) * (d / SHOT.contestDist), SHOT.maxContest, 1);
  if (nearest.y > 0 && d < SHOT.airContestDist) byContest *= SHOT.airContest;

  return byDistance * byTiming * byContest;
}

export function releaseShot(state, player) {
  const { ball } = state;
  const sign = attackSign(player.team), hoop = rimCentre(sign);
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

  const blocker = state.players.find(o => o.team !== player.team && o.y > BLOCK.minHeight
    && dist(o, player) <= BLOCK.reach && inArc(player, o, BLOCK.cone));
  if (blocker && rand(state) < BLOCK.chance) {
    letGo(state, player, 'loose');
    state.lastTouch = blocker.team;
    ball.vx = -sign * BLOCK.deflect; ball.vy = 0; ball.vz = 0;
    ball.shooter = null; ball.shotValue = 0;
    return;
  }

  const target = hoop;
  const made = rand(state) < makeChance(state, player);
  if (!made) {
    const off = SHOT.missMin + rand(state) * (SHOT.missMax - SHOT.missMin), angle = rand(state) * 2 * Math.PI;
    target.x += off * Math.cos(angle); target.z += off * Math.sin(angle);
  }
  Object.assign(ball, solveShot(ball, target, made ? RIM.radius : 0));
  ball.shooter = player.id;
  ball.shotValue = isThree(player.x, player.z, sign) ? 3 : 2;
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
}

export function giveBall(state, player) {
  const { ball } = state;
  ball.holder = player.id; ball.mode = 'held';
  ball.shooter = null; ball.shotValue = 0;
  if (state.possession !== player.team) state.shotClock = CLOCK.shot;
  state.possession = state.lastTouch = player.team;
  if (player.team === 0) state.controlled = player.id;
}

export function trySteal(state, player) {
  const holder = state.players[state.ball.holder];
  if (player.stealCooldown > 0 || !holder || holder.team === player.team || holder.inbounder) return;
  if (dist(holder, player) > STEAL.reach) return;
  player.stealCooldown = STEAL.cooldown;
  const chance = inArc(holder, player, STEAL.frontArc) ? STEAL.frontChance : STEAL.backChance;
  if (rand(state) < chance) { holder.shooting = false; giveBall(state, player); }
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

// Turns this step's intents into shots, passes, steals, jumps, control switches and pickups.
export function applyActions(state, intents, dt) {
  const { ball } = state;
  ball.noPickupT = Math.max(0, ball.noPickupT - dt);

  state.players.forEach((p, i) => {
    const intent = intents[i];
    const pressed = key => intent[key] && !p.prev[key];
    p.stealCooldown = Math.max(0, p.stealCooldown - dt);

    if (ball.holder === p.id) {
      if (pressed('pass')) passBall(state, p, intent);
      else if (p.inbounder) { /* an inbounder may only pass */ }
      else if (p.shooting) {
        if (!intent.shoot || grounded(p)) releaseShot(state, p);
      } else if (pressed('shoot') && grounded(p)) {
        const hoop = rimCentre(attackSign(p.team));
        p.facing = Math.atan2(hoop.z - p.z, hoop.x - p.x);
        jump(p);
        p.shooting = true;
      }
    } else {
      if (pressed('shoot') && !p.inbounder) jump(p);
      if (pressed('steal')) trySteal(state, p);
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
}
