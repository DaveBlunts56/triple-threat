import { BALL, COURT, PLAYER } from './tuning.js';

const grounded = p => p.y === 0 && p.vy === 0;

export function jump(player) {
  if (!grounded(player)) return;
  player.vy = PLAYER.jumpV;
  player.jumpT = 0;
}

function moveOne(p, intent, dt) {
  if (p.inbounder) { p.vx = p.vz = 0; return; }

  if (grounded(p)) {
    // Steer toward the wanted velocity. Diagonal input is scaled back to length 1.
    const len = Math.hypot(intent.moveX, intent.moveZ);
    const scale = (intent.sprint ? PLAYER.sprint : PLAYER.run) / Math.max(len, 1);
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
  state.players.forEach((p, i) => moveOne(p, intents[i], dt));
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
