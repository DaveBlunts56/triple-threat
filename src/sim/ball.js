import { BALL, RIM, BOARD, SHOT, HOOP_NET } from './tuning.js';

const rad = deg => (deg * Math.PI) / 180;

export const rimCentre = sign => ({ x: sign * RIM.x, y: RIM.height, z: 0 });

// Is the ball inside the net of the hoop at its end of the court: under the rim's plane, within the rim, above the net's bottom?
export const inNet = ball => ball.y < RIM.height && ball.y > RIM.height - HOOP_NET.depth
  && Math.hypot(Math.abs(ball.x) - RIM.x, ball.z) < RIM.radius;

// Launch velocity that carries the ball centre from `from` through `target`.
// The angle is steep enough that the ball drops into the target at SHOT.minEntry or more.
// Pass `rimRadius` when the target is the centre of a rim: the arc is then steepened until
// the ball also clears the front of that rim, which matters for lay-ups released low and close.
// `loft` is how much steeper than it need be the launch is, in radians: the same shot can be thrown flat or high.
export function solveShot(from, target, rimRadius = 0, loft = 0) {
  const dx = target.x - from.x, dz = target.z - from.z;
  const d = Math.max(Math.hypot(dx, dz), 0.05);
  const h = target.y - from.y;
  const drop = tan => Math.max(d * tan - h, 0.01) / (d * d);   // the arc is y = x·tan − drop·x²

  // Smallest gap between the ball's centre and the nearest point of the rim, along the arc.
  const rimGap = tan => {
    let gap = Infinity;
    for (let i = 0; i <= 40; i++) {
      const x = (d * i) / 40;
      gap = Math.min(gap, Math.hypot(x - (d - rimRadius), x * tan - drop(tan) * x * x - h));
    }
    return gap;
  };

  const steepest = Math.tan(rad(SHOT.maxAngle));
  let tan = Math.max(Math.tan(rad(SHOT.minAngle)), Math.tan(rad(SHOT.minEntry)) + (2 * h) / d);
  if (loft > 0) tan = Math.tan(Math.min(Math.atan(tan) + loft, rad(SHOT.maxAngle)));
  if (rimRadius > 0) {
    const room = BALL.radius + RIM.tube + SHOT.rimClear;
    while (tan < steepest && rimGap(tan) < room) tan *= 1.15;
  }
  tan = Math.min(tan, steepest);
  const cos2 = 1 / (1 + tan * tan);
  const speed = Math.sqrt(BALL.gravity / (2 * cos2 * drop(tan)));
  const horizontal = speed * Math.sqrt(cos2);
  return { vx: (horizontal * dx) / d, vy: horizontal * tan, vz: (horizontal * dz) / d };
}

function substep(ball, dt, events) {
  const prevY = ball.y;
  // Exact for constant gravity, so a solved shot arc does not drift off the rim centre.
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt - 0.5 * BALL.gravity * dt * dt;
  ball.z += ball.vz * dt;
  ball.vy -= BALL.gravity * dt;

  const sign = ball.x >= 0 ? 1 : -1;   // only the hoop at the ball's end of the court can matter

  // Backboard: a thin plate hit from either side. shortcut: its edges are ignored, add edge bounces if shots clipping the corner look wrong
  if (Math.abs(ball.z) <= BOARD.halfWidth && ball.y >= BOARD.bottom && ball.y <= BOARD.top) {
    const gap = sign * ball.x - BOARD.x;              // negative on the court side, positive behind the board
    const toward = sign * ball.vx * (gap < 0 ? 1 : -1) > 0;
    if (Math.abs(gap) < BALL.radius && toward) {
      ball.x = sign * (BOARD.x + Math.sign(gap || -1) * BALL.radius);
      ball.vx = -ball.vx * BALL.boardBounce;
      events.hitBoard = true;
    }
  }

  // Rim: nearest point on the rim circle to the ball centre.
  const cx = sign * RIM.x;
  const ox = ball.x - cx, oz = ball.z;
  const r = Math.hypot(ox, oz);
  if (r > 1e-9) {
    const px = cx + (ox / r) * RIM.radius, pz = (oz / r) * RIM.radius;
    let nx = ball.x - px, ny = ball.y - RIM.height, nz = ball.z - pz;
    const dist = Math.hypot(nx, ny, nz);
    const touch = BALL.radius + RIM.tube;
    if (dist < touch && dist > 1e-9) {
      nx /= dist; ny /= dist; nz /= dist;
      ball.x = px + nx * touch; ball.y = RIM.height + ny * touch; ball.z = pz + nz * touch;
      const into = ball.vx * nx + ball.vy * ny + ball.vz * nz;
      if (into < 0) {
        const k = (1 + BALL.rimBounce) * into;
        ball.vx -= k * nx; ball.vy -= k * ny; ball.vz -= k * nz;
      }
      // A ball balanced on top of the rim would sit there forever: tip it toward centre court.
      if (ny > Math.cos(rad(5))) ball.vx -= sign * 0.3;
      events.hitRim = true;
    }
  }

  // The net: it takes away a ball's sideways speed and slows its fall, so a make drops out under the hoop.
  if (inNet(ball)) {
    const keep = Math.exp(-dt / HOOP_NET.slow);
    ball.vx *= keep; ball.vz *= keep;
    if (ball.vy < -HOOP_NET.exit) ball.vy = -HOOP_NET.exit + (ball.vy + HOOP_NET.exit) * keep;
  }

  // Basket: the centre drops through the rim plane inside the rim.
  if (prevY >= RIM.height && ball.y < RIM.height && r < RIM.radius && !events.scored) events.scored = sign;

  // Floor
  if (ball.y < BALL.radius) {
    ball.y = BALL.radius;
    ball.vy = -ball.vy * BALL.floorBounce;
    events.hitFloor = true;
    if (Math.abs(ball.vy) >= BALL.restSpeed) {
      ball.vx *= BALL.floorGrip; ball.vz *= BALL.floorGrip;
    } else {
      // Resting on the floor: roll to a stop.
      ball.vy = 0;
      const speed = Math.hypot(ball.vx, ball.vz);
      const k = speed > 0 ? Math.max(0, speed - BALL.rollDecel * dt) / speed : 0;
      ball.vx *= k; ball.vz *= k;
    }
  }
}

// Advances a free ball by dt. Returns what it touched and which hoop (1, -1 or 0) it went through.
export function stepBall(ball, dt) {
  const events = { hitFloor: false, hitRim: false, hitBoard: false, scored: 0 };
  const h = dt / BALL.substeps;
  for (let i = 0; i < BALL.substeps; i++) substep(ball, h, events);
  return events;
}
