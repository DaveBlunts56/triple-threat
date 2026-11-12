import { AI, BALL, COURT, PASS, PLAYER, STEAL } from './tuning.js';
import { attackSign, emptyIntent, rand } from './state.js';
import { rimCentre } from './ball.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nearestTo = (list, point) => list.reduce((a, b) => (dist(b, point) < dist(a, point) ? b : a));

export const spots = sign => [{ x: sign * 6.9, z: -4.5 }, { x: sign * 6.9, z: 4.5 }, { x: sign * 10.9, z: AI.lowSpotZ }];

const opponents = (state, p) => state.players.filter(o => o.team !== p.team);
const mates = (state, p) => state.players.filter(m => m.team === p.team && m !== p);
const space = (state, p) => Math.min(...opponents(state, p).map(o => dist(o, p)));

export const isOpen = (state, player) => space(state, player) > AI.openDist;

// No opponent near the straight line from the player to `target` (by default the hoop they attack).
// `skip` ignores opponents this close to the player: a pass is already past them when it can first be touched.
export function laneClear(state, player, target = rimCentre(attackSign(player.team)), skip = 0) {
  const lx = target.x - player.x, lz = target.z - player.z, len2 = lx * lx + lz * lz || 1;
  return opponents(state, player).every(o => {
    if (dist(o, player) < skip) return true;
    const t = Math.min(1, Math.max(0, ((o.x - player.x) * lx + (o.z - player.z) * lz) / len2));
    return Math.hypot(o.x - (player.x + lx * t), o.z - (player.z + lz * t)) > AI.laneWidth;
  });
}

// Targets are kept inside the lines so nobody dribbles or chases a ball out of bounds.
const inside = (v, half) => Math.min(Math.max(v, -half + PLAYER.radius), half - PLAYER.radius);
const goTo = (ai, point, sprint = false) => {
  ai.targetX = inside(point.x, COURT.halfLength); ai.targetZ = inside(point.z, COURT.halfWidth); ai.sprint = sprint;
};
const passTo = (ai, p, mate) => {
  const d = dist(mate, p) || 1;
  ai.action = 'pass'; ai.passX = (mate.x - p.x) / d; ai.passZ = (mate.z - p.z) / d;
};

function planWithBall(state, p) {
  const { ai } = p, sign = attackSign(p.team), hoop = rimCentre(sign);
  goTo(ai, p);

  if (p.inbounder) {
    // The nearest teammate comes to the ball; wait a moment for them, then pass.
    ai.wait = (ai.wait || 0) + AI.interval;
    if (ai.wait >= AI.inboundDelay) passTo(ai, p, nearestTo(mates(state, p), p));
    return;
  }
  ai.wait = 0;
  if (p.shooting) { ai.action = 'shoot'; return; }

  const toHoop = dist(p, hoop);
  // Behind the backboard there is no shot: come back out in front of the rim first.
  if (sign * (p.x - hoop.x) > 0 && state.shotClock >= AI.panicClock) return goTo(ai, { x: hoop.x - sign * AI.layupDist, z: p.z / 2 }, true);
  const shoot = () => {
    ai.action = 'shoot';
    ai.releaseAt = PLAYER.jumpV / BALL.gravity + (rand(state) * 2 - 1) * AI.releaseJitter;
  };
  if (state.shotClock < AI.panicClock) return shoot();
  const settled = ai.heldT >= AI.holdTime;   // just caught it: gather before shooting or passing
  if (settled && toHoop < AI.layupDist) return shoot();
  // Nobody between him and the hoop: take it all the way in, don't pull up for a jump shot.
  if (laneClear(state, p)) return goTo(ai, { x: sign * AI.driveX, z: 0 }, true);
  if (settled && isOpen(state, p) && toHoop <= AI.shootRange) return shoot();

  // Running out of time to cross half court: stop looking for a pass and bring it up.
  if (state.backcourtT > AI.hurryAt && !state.frontcourt) return goTo(ai, { x: sign * AI.topX, z: 0 }, true);

  // A defender this close cannot reach the ball before it is past him.
  const untouchable = PLAYER.carryDist + PASS.speed * PASS.clearTime - PLAYER.pickupRadius;
  // With nobody on him he only passes to move the ball nearer the hoop; otherwise he brings it up himself.
  const pressured = !isOpen(state, p);
  const open = mates(state, p).filter(m => isOpen(state, m) && dist(m, p) <= AI.passRange
    && (pressured || dist(m, hoop) < toHoop) && laneClear(state, p, m, untouchable));
  if (settled && open.length) passTo(ai, p, nearestTo(open, hoop));
  else goTo(ai, { x: sign * AI.topX, z: 0 });
}

// Chasing a ball nobody holds. Two per team go for it, the third gets back on defence.
function planFreeBall(state, p) {
  const { ai } = p, { ball } = state, sign = attackSign(p.team);
  const team = state.players.filter(m => m.team === p.team && !m.inbounder);

  if (ball.mode === 'pass') {
    // The teammate the pass is heading for waits for it; everyone else carries on.
    if (state.lastTouch === p.team) {
      const along = m => (ball.vx * (m.x - ball.x) + ball.vz * (m.z - ball.z)) / (dist(m, ball) || 1);
      const receiver = team.filter(m => m.id !== ball.noPickupId).reduce((a, b) => (along(b) > along(a) ? b : a), p);
      if (receiver !== p) return planOffBall(state, p);
      // Run to where the ball comes back down to catching height.
      const t = (ball.vy + Math.sqrt(ball.vy ** 2 + 2 * BALL.gravity * Math.max(0, ball.y - PASS.height))) / BALL.gravity;
      return goTo(ai, { x: ball.x + ball.vx * t, z: ball.z + ball.vz * t }, true);
    }
    return planDefence(state, p);
  }

  // A shot is rebounded by those nearest the rim it is heading for; a loose ball by those nearest it.
  const focus = ball.mode === 'shot' ? rimCentre(ball.x >= 0 ? 1 : -1) : ball;
  const chasers = [...team].sort((a, b) => dist(a, focus) - dist(b, focus)).slice(0, 2);
  if (!chasers.includes(p)) return goTo(ai, { x: -sign * AI.safetyX, z: 0 }, true);

  goTo(ai, ball, true);
  if (dist(p, ball) < AI.reboundDist && ball.y < AI.reboundHeight && ball.y > PLAYER.reach && ball.vy < 0) ai.action = 'jump';
}

function planOffBall(state, p) {
  const { ai } = p, sign = attackSign(p.team);
  const holder = state.players[state.ball.holder];
  const { x, z } = state.inboundSpot;
  const inward = Math.abs(z) > COURT.halfWidth ? { x: 0, z: -Math.sign(z) } : { x: -Math.sign(x), z: 0 };
  const help = { x: x + inward.x * AI.inboundHelp, z: z + inward.z * AI.inboundHelp };
  if (state.phase === 'dead') {
    // Nearest to the spot takes the inbound, next nearest comes to receive it, the third heads up the court.
    const order = state.players.filter(m => m.team === p.team).sort((a, b) => dist(a, state.inboundSpot) - dist(b, state.inboundSpot));
    if (order[0] === p) return goTo(ai, state.inboundSpot, true);
    if (order[1] === p) return goTo(ai, help, true);
  } else if (holder?.inbounder && nearestTo(mates(state, holder), holder) === p) {
    return goTo(ai, help, true);
  }
  const spot = spots(sign)[(p.slot + Math.floor(state.time / AI.swapEvery)) % 3];
  goTo(ai, spot, dist(p, spot) > AI.farAway);
}

function planDefence(state, p) {
  const { ai } = p;
  const man = state.players.find(o => o.team !== p.team && o.slot === p.slot);
  const hoop = rimCentre(-attackSign(p.team));   // the hoop this player defends
  const hasBall = state.ball.holder === man.id;
  const gap = hasBall ? AI.onBallGap : AI.offBallGap;
  const d = dist(hoop, man) || 1;
  let guard = { x: man.x + ((hoop.x - man.x) / d) * gap, z: man.z + ((hoop.z - man.z) / d) * gap };
  // No full-court press: while their man is still up the court, wait for him on the pick-up line, between him and the hoop.
  const line = Math.sign(hoop.x) * AI.pickupX;
  if (Math.abs(hoop.x - guard.x) > Math.abs(hoop.x - line)) {
    const u = (line - man.x) / (hoop.x - man.x);
    guard = { x: line, z: man.z + (hoop.z - man.z) * u };
  }
  goTo(ai, guard, dist(p, guard) > AI.farAway);

  if (man.shooting && dist(p, man) < AI.contestDist) ai.action = 'jump';
  else if (hasBall && !man.inbounder && p.stealCooldown <= 0 && dist(p, man) <= STEAL.reach && rand(state) < AI.stealRate) ai.action = 'steal';
}

function plan(state, p) {
  const holder = state.players[state.ball.holder];
  p.ai.action = null;
  if (holder === p) planWithBall(state, p);
  // A dead ball is not chased: the team about to inbound sets up, the other gets back on defence.
  else if (state.phase === 'dead') (p.team === state.possession ? planOffBall : planDefence)(state, p);
  else if (!holder) planFreeBall(state, p);
  else if (holder.team === p.team) planOffBall(state, p);
  else planDefence(state, p);
}

// Turns the current plan into this step's intent.
function act(state, p) {
  const { ai } = p, intent = emptyIntent();
  const dx = ai.targetX - p.x, dz = ai.targetZ - p.z, d = Math.hypot(dx, dz);
  if (d > AI.arrive) { intent.moveX = dx / d; intent.moveZ = dz / d; intent.sprint = ai.sprint; }

  const hasBall = state.ball.holder === p.id;
  if (ai.action === 'shoot' && hasBall) {
    intent.moveX = intent.moveZ = 0;
    // Press (a fresh press needs the key up first), hold through the jump, let go at the chosen moment.
    intent.shoot = p.shooting ? p.jumpT < ai.releaseAt : !p.prev.shoot;
  } else if (ai.action === 'pass' && hasBall) {
    intent.pass = !p.prev.pass;
    intent.moveX = ai.passX; intent.moveZ = ai.passZ;
    if (intent.pass) ai.action = null;
  } else if (ai.action === 'jump') {
    intent.shoot = true;
    ai.action = null;
  } else if (ai.action === 'steal') {
    intent.steal = true;
    ai.action = null;
  }
  return intent;
}

// One Intent per player. Each player re-plans every AI.interval seconds, not every step,
// so the computer reacts with a human-like delay.
export function aiIntents(state, dt) {
  return state.players.map(p => {
    p.ai.timer -= dt;
    // Getting the ball is not something you take a moment to notice.
    const has = state.ball.holder === p.id;
    if (has && !p.ai.had) p.ai.timer = 0;
    // Nor is a pass from a teammate: the receiver runs onto it at once.
    const ownPass = state.ball.mode === 'pass' && state.lastTouch === p.team;
    if (ownPass && !p.ai.sawPass) p.ai.timer = 0;
    p.ai.sawPass = ownPass;
    p.ai.heldT = has ? (p.ai.had ? p.ai.heldT + dt : 0) : 0;
    p.ai.had = has;
    if (p.ai.timer <= 0) {
      plan(state, p);
      p.ai.timer = AI.interval + rand(state) * AI.jitter;
    }
    return act(state, p);
  });
}
