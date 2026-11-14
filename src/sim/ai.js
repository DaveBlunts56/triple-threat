import { AI, BALL, COURT, DT, FT, PASS, PLAYER, SHOT, STEAL, TIP } from './tuning.js';
import { SHOT_BEST, SHOT_LANDS } from './players.js';
import { ftChance } from './freethrow.js';
import { attackSign, emptyIntent, isJumper, onFloor, rand } from './state.js';
import { rimCentre } from './ball.js';
import { manOf } from './matchups.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nearestTo = (list, point) => list.reduce((a, b) => (dist(b, point) < dist(a, point) ? b : a));

// Where a team attacking toward `sign` stands without the ball, in a match of `size` a side.
export const spots = (sign, size = 3) => (size === 5 ? AI.spots5.map(([x, z]) => ({ x: sign * x, z }))
  : [{ x: sign * 6.9, z: -4.5 }, { x: sign * 6.9, z: 4.5 }, { x: sign * 10.9, z: AI.lowSpotZ }]);

// The spot of player `p` now. At every turn all of a team move on one place. In five a side the places run round the
// arc, and the first in the team's order starts at the top of the key.
function spotOf(state, p) {
  const all = spots(attackSign(p.team), state.size);
  if (state.size !== 5) return all[(p.slot + Math.floor(state.time / AI.swapEvery)) % 3];
  return all[(p.slot + 2 + Math.floor(state.time / AI.swapEvery5)) % 5];
}

const opponents = (state, p) => state.players.filter(o => o.team !== p.team);
const mates = (state, p) => state.players.filter(m => m.team === p.team && m !== p);
const space = (state, p) => Math.min(...opponents(state, p).map(o => dist(o, p)));

export const isOpen = (state, player) => space(state, player) > AI.openDist;

// In the air for a shot he has not let go yet. Once the ball has left his hand a jump can no longer trouble it.
const shotJump = man => !onFloor(man) && man.shooting;

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
    const at = SHOT_BEST + (rand(state) * 2 - 1) * AI.releaseJitter;
    ai.releaseAt = Math.min(Math.max(at, SHOT.gather + DT), SHOT_LANDS - 3 * DT);   // in the air, and clear of the landing
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
  // Nothing on: in three a side he takes the ball to the top; in five a side that is a team-mate's place, so he keeps his own.
  else goTo(ai, state.size === 5 ? spotOf(state, p) : { x: sign * AI.topX, z: 0 });
}

// Chasing a ball nobody holds. Two per team go for it, the rest get back on defence, side by side.
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
      ai.chase = true;
      return goTo(ai, { x: ball.x + ball.vx * t, z: ball.z + ball.vz * t }, true);
    }
    return planDefence(state, p);
  }

  // A shot is rebounded by those nearest the rim it is heading for; a loose ball by those nearest it.
  const focus = ball.mode === 'shot' ? rimCentre(ball.x >= 0 ? 1 : -1) : ball;
  const chasers = [...team].sort((a, b) => dist(a, focus) - dist(b, focus)).slice(0, 2);
  if (!chasers.includes(p)) {
    const back = state.players.filter(m => m.team === p.team && !chasers.includes(m)).sort((a, b) => a.z - b.z);
    return goTo(ai, { x: -sign * AI.safetyX, z: (back.indexOf(p) - (back.length - 1) / 2) * AI.safetyGap }, true);
  }

  goTo(ai, ball, true); ai.chase = true;
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
  const spot = spotOf(state, p);
  goTo(ai, spot, dist(p, spot) > AI.farAway);
}

function planDefence(state, p) {
  const { ai } = p;
  const man = manOf(state, p);
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

  // A gather does not draw him off the floor: he goes up when his man does.
  if (shotJump(man) && dist(p, man) < AI.contestDist) ai.action = 'jump';
  else if (hasBall && !man.inbounder && p.stealCooldown <= 0 && dist(p, man) <= STEAL.reach && rand(state) < AI.stealRate) ai.action = 'steal';
}

function plan(state, p) {
  const holder = state.players[state.ball.holder];
  p.ai.action = null; p.ai.chase = false;
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
  if (d > AI.arrive) {
    // He eases into a spot instead of stopping dead on it, but goes flat out for a ball that is there to be won.
    const part = ai.chase ? 1 : Math.min(1, d / AI.slowDist);
    intent.moveX = (dx / d) * part; intent.moveZ = (dz / d) * part; intent.sprint = ai.sprint;
  }

  const hasBall = state.ball.holder === p.id;
  if (ai.action === 'shoot' && hasBall) {
    intent.moveX = intent.moveZ = 0;
    // Press (a fresh press needs the key up first), hold through the gather and the jump,
    // and let go on the first step at or after the chosen moment.
    intent.shoot = p.shooting ? p.shotT + DT < ai.releaseAt : !p.prev.shoot;
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
  if (state.phase === 'jumpBall') {
    // Only the jumpers act: each goes up when the falling ball reaches a height he picked, a little early or late.
    return state.players.map(p => {
      if (!isJumper(state, p)) return emptyIntent();
      p.ai.tipAt ??= TIP.aiJumpAt + (rand(state) * 2 - 1) * TIP.aiError;
      return { ...emptyIntent(), shoot: state.ball.vy < 0 && state.ball.y <= p.ai.tipAt };
    });
  }
  const ft = state.freeThrow;
  if (state.phase === 'freeThrow' && !ft.live) {
    // Nobody may move. Team 1's shooter is thrown for by the rules; a computer shooter on team 0 stops the meter
    // himself, a little off centre, so both make about the same share.
    return state.players.map(p => ({ ...emptyIntent(),
      shoot: p.id === ft.shooter && ft.armed && ft.t >= FT.aiDelay && ftChance(ft.meter) <= FT.aiChance }));
  }
  return state.players.map(p => {
    p.ai.timer -= dt;
    // Getting the ball is not something you take a moment to notice.
    const has = state.ball.holder === p.id;
    if (has && !p.ai.had) p.ai.timer = 0;
    // Nor is a pass from a teammate: the receiver runs onto it at once.
    const ownPass = state.ball.mode === 'pass' && state.lastTouch === p.team;
    if (ownPass && !p.ai.sawPass) p.ai.timer = 0;
    p.ai.sawPass = ownPass;
    // His man going up for a shot: he reacts within AI.contestDelay, not at his next decision.
    const up = shotJump(manOf(state, p));
    if (up && !p.ai.sawJump) p.ai.timer = Math.min(p.ai.timer, rand(state) * AI.contestDelay);
    p.ai.sawJump = up;
    p.ai.heldT = has ? (p.ai.had ? p.ai.heldT + dt : 0) : 0;
    p.ai.had = has;
    if (p.ai.timer <= 0) {
      plan(state, p);
      p.ai.timer = AI.interval + rand(state) * AI.jitter;
    }
    return act(state, p);
  });
}
