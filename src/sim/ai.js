import { AI, BALL, CLOCK, COURT, DT, FT, LATE, PASS, PLAY, PLAYER, SHOT, STEAL, TIP, levelOf } from './tuning.js';
import { SHOT_BEST, SHOT_LANDS, zoneOf } from './players.js';
import { lift, drop, rated, starOf, heatOf } from './ratings.js';
import { ftChance } from './freethrow.js';
import { attackSign, emptyIntent, isJumper, onFloor, personOf, rand } from './state.js';
import { rimCentre } from './ball.js';
import { manOf } from './matchups.js';
import { playHolds, playSpot, playTarget } from './plays.js';
import { situation } from './late.js';

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
// `width` is how near the line counts as in the way.
export function laneClear(state, player, target = rimCentre(attackSign(player.team)), skip = 0, width = AI.laneWidth) {
  const lx = target.x - player.x, lz = target.z - player.z, len2 = lx * lx + lz * lz || 1;
  return opponents(state, player).every(o => {
    if (dist(o, player) < skip) return true;
    const t = Math.min(1, Math.max(0, ((o.x - player.x) * lx + (o.z - player.z) * lz) / len2));
    return Math.hypot(o.x - (player.x + lx * t), o.z - (player.z + lz * t)) > width;
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

// How many seconds into the shot clock the team with the ball waits before it will shoot from outside or drive at a
// set defence: a patient possession or a quick one, drawn afresh each time the shot clock starts again. (A lay-up or
// a fast break is taken whenever it comes.)
function patience(state) {
  const { tempo } = state;
  if (state.shotClock > tempo.clock + 0.5) tempo.wait = AI.patience[0] + rand(state) * (AI.patience[1] - AI.patience[0]);
  tempo.clock = state.shotClock;
  return tempo.wait;
}

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
  const sit = situation(state, p.team);
  const shoot = () => {
    ai.action = 'shoot';
    const at = SHOT_BEST + (rand(state) * 2 - 1) * (p.team === 1 ? levelOf(state).jitter : AI.releaseJitter);   // the computer's team times its shots as the level says
    ai.releaseAt = Math.min(Math.max(at, SHOT.gather + DT), SHOT_LANDS - 3 * DT);   // in the air, and clear of the landing
  };
  // Out of time on the shot clock: he shoots. A team behind late in the game does not wait that long.
  if (state.shotClock < (sit.hurry ? LATE.hurryClock : AI.panicClock)) return shoot();
  // The period is running out: he shoots before it does, running nearer first if he is far out and there is time.
  if (state.gameClock < AI.panicClock) {
    if (toHoop > AI.shootRange && state.gameClock > LATE.heave) return goTo(ai, { x: hoop.x - sign * AI.layupDist, z: p.z / 2 }, true);
    return shoot();
  }
  const settled = ai.heldT >= AI.holdTime;   // just caught it: gather before shooting or passing
  if (settled && toHoop < AI.layupDist) return shoot();
  // Early in the shot clock he does not settle for a shot from outside or take on a set defence: the offence is run
  // first. A team behind late in the game has no time for that.
  const early = !sit.hurry && CLOCK.shot - state.shotClock < patience(state);
  // Nobody between him and the hoop: take it all the way in, don't pull up for a jump shot. Early on that is only
  // for a fast break, with every defender well behind him: otherwise he walks the ball up.
  const ahead = opponents(state, p).every(o => dist(o, hoop) > toHoop + AI.breakLead);
  if (laneClear(state, p) && (!early || ahead)) return goTo(ai, { x: sign * AI.driveX, z: 0 }, true);
  // His play has not formed yet: he keeps the ball rather than shoot from outside or pass. So does a team ahead late
  // in the game, until the shot clock is nearly out. A team behind late waits for nothing.
  const waits = !sit.hurry && (playHolds(state, p) || (sit.milk && state.shotClock > LATE.milkClock));
  // A defender this close cannot reach the ball before it is past him.
  const untouchable = PLAYER.carryDist + PASS.speed * PASS.clearTime - PLAYER.pickupRadius;
  const reaches = m => m && m !== p && dist(m, p) <= AI.passRange && laneClear(state, p, m, untouchable, PLAY.feedWidth);
  // The room a player needs to shoot from where he stands: the better he shoots from there the less it is, so a shot
  // creator shoots over a defender and a sharpshooter needs only a step.
  const roomOf = m => AI.openDist * drop(rated(state, m, zoneOf(m)), AI.roomGap);
  // The man the play is for gets the ball if it can reach him, open or not, before the handler looks for his own
  // shot: a post man is fed with his defender on him.
  const wanted = playTarget(state, p);
  if (settled && !waits && reaches(wanted)) return passTo(ai, p, wanted);
  // He takes the open shots he is good at. Early in the shot clock only a great shooter with room takes a three.
  const zone = zoneOf(p), skill = rated(state, p, zone);
  const mayNow = !early || (zone === 'three' && skill >= AI.earlyThree && space(state, p) > AI.roomFor);
  if (settled && !waits && mayNow && skill >= AI.shootAt && space(state, p) > roomOf(p) && toHoop <= AI.shootRange) return shoot();

  // Running out of time to cross half court: stop looking for a pass and bring it up.
  if (state.backcourtT > AI.hurryAt && !state.frontcourt) return goTo(ai, { x: sign * AI.topX, z: 0 }, true);

  // With nobody on him he only passes to move the ball nearer the hoop; otherwise he brings it up himself.
  const pressured = !isOpen(state, p);
  // A team-mate is open for a pass when he has the room he needs for his own shot, or is simply open. Early in the
  // shot clock the ball is moved round the outside, not thrown in to a man near the hoop: that pass is made once the
  // offence has been run.
  const free = m => space(state, m) > Math.min(AI.openDist, roomOf(m));
  const open = mates(state, p).filter(m => free(m) && dist(m, p) <= AI.passRange
    && (pressured || dist(m, hoop) < toHoop) && !(early && dist(m, hoop) < AI.insideDist) && laneClear(state, p, m, untouchable));
  const star = state.players.find(m => m.team === p.team && m.person === starOf(state, p.team));
  // Of the open men the pass leans to the star and to a hot hand, and away from a cold one.
  const pull = m => (m === star ? AI.lean : 1) * ({ hot: AI.lean, cold: AI.shy }[heatOf(personOf(state, m))] ?? 1);
  const best = () => open.reduce((a, b) => (dist(b, hoop) / pull(b) < dist(a, hoop) / pull(a) ? b : a));
  // With the game on the line the ball goes to the star, if it can reach him. And once the offence has been run, a
  // handler with no shot of his own often gives it to the star to make one.
  if (settled && reaches(star) && (sit.clutch || (!waits && !early && rand(state) < AI.goTo))) passTo(ai, p, star);
  // Usually to the best of the open men, sometimes to another, so that he is not read.
  else if (settled && !waits && open.length) passTo(ai, p, open.length > 1 && rand(state) < AI.vary ? open[Math.floor(rand(state) * open.length)] : best());
  // Nothing on: in three a side he takes the ball to the top; in five a side that is a team-mate's place, so he keeps his own.
  // In a play he takes it where the play says.
  else goTo(ai, playSpot(state, p) ?? (state.size === 5 ? spotOf(state, p) : { x: sign * AI.topX, z: 0 }));
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
  const spot = playSpot(state, p) ?? spotOf(state, p);   // his part in the play, or his place in the motion
  goTo(ai, spot, spot.sprint || situation(state, p.team).hustle || dist(p, spot) > AI.farAway);
}

// How the computer's team stands off you for what you have scored with: tighter on a team making threes, and off
// the ball looser on one scoring inside. Only team 1 adapts, by as much as the level says.
function adapted(state, p, hasBall) {
  const [twos, threes] = state.made[0], made = twos + threes, { adapt } = levelOf(state);
  if (p.team !== 1 || made < AI.adaptAfter) return 1;
  const share = threes / made;
  return share >= 0.45 ? 1 - 0.3 * adapt : share <= 0.2 && !hasBall ? 1 + 0.35 * adapt : 1;
}

// Whether `p` should leave his man to help: the ball handler, who is not his man, has a clear lane and is near the
// hoop, and of the defenders off the ball `p` is the nearest to the hoop. Once he has come he stays a moment.
function helps(state, p, man, hoop) {
  const holder = state.players[state.ball.holder];
  if (!holder || holder.team === p.team || holder === man || holder.inbounder || state.phase !== 'live') return false;
  if (state.time < (p.ai.helpUntil ?? 0) && dist(holder, hoop) <= AI.helpFrom) return true;
  if (dist(holder, hoop) > AI.helpFrom || !laneClear(state, holder)) return false;
  const off = state.players.filter(m => m.team === p.team && manOf(state, m) !== holder);
  if (nearestTo(off, hoop) !== p) return false;
  p.ai.helpUntil = state.time + AI.helpFor;
  return true;
}

function planDefence(state, p) {
  const { ai } = p, sit = situation(state, p.team);
  const man = manOf(state, p);
  const hoop = rimCentre(-attackSign(p.team));   // the hoop this player defends
  const hasBall = state.ball.holder === man.id;
  // How far off his man he stands: closer to a good shooter and further from a poor one, and on the ball a step more
  // for a quick man.
  const three = rated(state, man, 'three');
  const usual = hasBall ? Math.min(Math.max(AI.onBallGap * drop(three, AI.shooterGap) * lift(rated(state, man, 'speed'), AI.quickGap), AI.gapRange[0]), AI.gapRange[1])
    : AI.offBallGap * drop(three, AI.offShooterGap);
  const gap = (hasBall && sit.press ? LATE.pressGap : usual) * adapted(state, p, hasBall);
  const d = dist(hoop, man) || 1;
  let guard = { x: man.x + ((hoop.x - man.x) / d) * gap, z: man.z + ((hoop.z - man.z) / d) * gap };
  // No full-court press: while their man is still up the court, wait for him on the pick-up line, between him and the
  // hoop. A team behind late in the game does press.
  const line = Math.sign(hoop.x) * AI.pickupX;
  if (!sit.press && Math.abs(hoop.x - guard.x) > Math.abs(hoop.x - line)) {
    const u = (line - man.x) / (hoop.x - man.x);
    guard = { x: line, z: man.z + (hoop.z - man.z) * u };
  }
  // Help: he steps in front of the rim, on the handler's way to it.
  const holder = state.players[state.ball.holder];
  if (helps(state, p, man, hoop)) {
    const far = dist(holder, hoop) || 1;
    guard = { x: hoop.x + ((holder.x - hoop.x) / far) * AI.helpAt, z: hoop.z + ((holder.z - hoop.z) / far) * AI.helpAt };
  }
  // To foul on purpose he goes straight at the ball.
  if (sit.foul && hasBall && !man.inbounder) guard = { x: man.x, z: man.z };
  goTo(ai, guard, sit.hustle || sit.press || dist(p, guard) > AI.farAway);

  // A gather does not draw him off the floor: he goes up when his man does.
  if (shotJump(man) && dist(p, man) < AI.contestDist) ai.action = 'jump';
  else if (sit.foul && state.phase === 'live' && holder && holder.team !== p.team && !holder.inbounder && dist(p, holder) <= STEAL.reach) ai.action = 'foul';
  else if (hasBall && !man.inbounder && p.stealCooldown <= 0 && dist(p, man) <= STEAL.reach && rand(state) < AI.stealRate * (p.team === 1 ? levelOf(state).steal : 1)) ai.action = 'steal';
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
  } else if (ai.action === 'foul') {
    intent.foul = !p.prev.foul;
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
      p.ai.timer = (p.team === 1 ? levelOf(state).interval : AI.interval) + rand(state) * AI.jitter;   // the computer's team thinks as fast as the level says
    }
    return act(state, p);
  });
}
