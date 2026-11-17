import { AI, BALL, CLOCK, COURT, DT, FINISH, FT, LANE, LATE, MOVES, PASS, PLAY, PLAYER, READ, RIM, SHOT, STEAL, THREE_PT, TIP, VIOLATION, LEVEL_IQ, SCHEME, RATE, cpuLevelOf, isHuman, levelOf } from './tuning.js';
import { SHOT_BEST, SHOT_LANDS, gatherOf, isThree, shotBest, shotLands, zoneOf } from './players.js';
import { canDunk, finishFor } from './finish.js';
import { lift, drop, rated, starOf, heatOf } from './ratings.js';
import { ftChance } from './freethrow.js';
import { attackSign, emptyIntent, isJumper, onFloor, personOf, rand } from './state.js';
import { rimCentre } from './ball.js';
import { manOf, schemeOf } from './matchups.js';
import { playHolds, playRan, playSpot, playTarget, screenerOn } from './plays.js';
import { needOf, situation } from './late.js';
import { offBallSpot, passed } from './offball.js';
import { OFF } from './tuning.js';
import { KINDS } from './moves.js';
import { styled } from './styles.js';
import { lean, moodSkill } from './mood.js';
import { speedFactor } from './stamina.js';
import { easeOf, focusOf, gambleOf, playbookOf, tightness } from './coach.js';
import { STAR_AT, choose, sharpness, starPull } from './choose.js';
import { overall } from './overall.js';
import { contestShare, distanceChance, expectedShot, greenShare, levelFor, meanTiming as sharedTiming, rangeShare, shotChance, skillOf, windowHalf, zoneFor } from './shooting.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nearestTo = (list, point) => list.reduce((a, b) => (dist(b, point) < dist(a, point) ? b : a));

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
// A team that plays quickly (its playbook's pace above 1) waits less.
function patience(state, team = state.possession) {
  const { tempo } = state;
  if (state.shotClock > tempo.clock + 0.5) { const [early, late] = styled(state, 'ai.patience'); tempo.wait = (early + rand(state) * (late - early)) / playbookOf(state, team).pace; tempo.fed = false; }
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
  if (p.shooting) { ai.action = p.shotKey; return; }   // on with the shot he began, a fade if it is one
  if (p.move) return;                                  // in a move: nothing to decide until it ends

  const toHoop = dist(p, hoop);
  // Behind the backboard there is no shot: come back out in front of the rim first.
  if (sign * (p.x - hoop.x) > 0 && state.shotClock >= AI.panicClock) return goTo(ai, { x: hoop.x - sign * AI.layupDist, z: p.z / 2 }, true);
  const sit = situation(state, p.team);
  const shoot = (how = 'shoot') => {
    ai.action = how;
    ai.releaseOff = (rand(state) * 2 - 1) * (!isHuman(state, p.team) ? cpuLevelOf(state).jitter : AI.releaseJitter);   // a team nobody plays times its shots as the level says
    ai.releaseAt = Math.min(Math.max(SHOT_BEST + ai.releaseOff, SHOT.gather + DT), SHOT_LANDS - 3 * DT);   // in the air, and clear of the landing
  };
  // Driving at the rim from in range, the shot he begins is a finish (see finish.js): a dunk with nobody between him
  // and the rim if he can dunk, otherwise a layup, which is what the shot key gives him there.
  const driving = () => finishFor(state, p, 'shoot') === 'layup';
  const finish = () => { if (driving() && laneClear(state, p) && canDunk(state, p)) ai.action = 'dunk'; else shoot(); };
  // Out of time on the shot clock: he shoots. A team behind late in the game does not wait that long.
  if (state.shotClock < (sit.hurry ? LATE.hurryClock : AI.panicClock)) return shoot();
  // The period is running out: he shoots before it does, running nearer first if he is far out and there is time.
  if (state.gameClock < AI.panicClock) {
    if (toHoop > AI.shootRange && state.gameClock > LATE.heave) return goTo(ai, { x: hoop.x - sign * AI.layupDist, z: p.z / 2 }, true);
    return shoot();
  }
  const settled = ai.heldT >= AI.holdTime;   // just caught it: gather before shooting or passing
  if (ai.stepped !== undefined && state.time - ai.stepped < 1) { ai.stepped = undefined; return shoot(); }   // he stepped back to shoot: he shoots
  // A defender this close cannot reach the ball before it is past him.
  const untouchable = PLAYER.carryDist + PASS.speed * PASS.clearTime - PLAYER.pickupRadius;
  // Once the ball is in the front court it is not passed back over the centre line.
  const legal = m => !(state.frontcourt && sign * m.x < PLAYER.radius + 0.5);
  // The ball is not thrown about for its own sake. Whoever has just caught a pass keeps it a moment before he moves
  // it on (a man at the rim apart), and does not give it straight back to the man it came from unless that man has
  // cut to the hoop.
  const cutter = state.cut[p.team]?.id, mayPass = ai.heldT >= AI.passAfter;
  const back = m => m.id === ai.from && state.time - ai.gotAt < AI.noReturn && m.id !== cutter;
  const zone = zoneOf(p), skill = rated(state, p, zone), room = space(state, p);
  // A team ahead late in the game uses the clock, whatever it is offered.
  const milking = !sit.hurry && sit.milk && state.shotClock > LATE.milkClock;

  // ---- The reads. What he sees is acted on before the offence is run: an offence is run to get these. ----
  // The man the defence has left: a team-mate wide open where he can shoot, whom a pass will reach. The best shooter
  // of them. He is looked for by a handler about to shoot over a defender (see `guarded` below).
  const left = () => {
    const men = mayPass && !milking ? mates(state, p).filter(m => space(state, m) >= READ.wide && dist(m, hoop) <= AI.shootRange && rated(state, m, zoneOf(m)) >= AI.shootAt
      && legal(m) && !back(m) && dist(m, p) <= AI.passRange && laneClear(state, p, m, untouchable)) : [];
    return men.length ? men.reduce((a, b) => (rated(state, b, zoneOf(b)) > rated(state, a, zoneOf(a)) ? b : a)) : null;
  };
  // About to shoot with a defender on him: if somebody is wide open the ball goes to him instead. Returns whether it did.
  const guarded = () => { const man = left(); if (man) passTo(ai, p, man); return !!man; };
  // At the rim he goes up, unless the defence has collapsed on him and left a man.
  if (settled && toHoop < AI.layupDist) {
    const crowd = opponents(state, p).filter(o => dist(o, p) <= AI.contestDist).length >= READ.crowd;
    return crowd && guarded() ? undefined : finish();
  }
  // Wide open where he shoots well: he takes it, on the catch, early in the shot clock or with his play still
  // forming. With a clear lane to the rim as well he takes that instead, below, when he may. Walking the ball up
  // against a defence that has not come out to him yet is not being open: the offence must be set (AI.moveFrom
  // seconds into the shot clock), or a pass must have found him.
  const found = ai.from != null && ai.heldT < AI.passAfter;   // undefined before his first decision with the ball
  // (Found by a pass, an open man may shoot it at once only once the style's openFrom seconds of the shot clock are gone.)
  const into = CLOCK.shot - state.shotClock;
  const open = room >= READ.wide && toHoop <= AI.shootRange && skill >= AI.callAt && !milking && ((found && into >= styled(state, 'decide.openFrom')) || into >= AI.moveFrom);
  if (open && ai.heldT < READ.onCatch) ai.soon = READ.onCatch - ai.heldT + DT;   // he looks again as the ball settles in his hands
  // A move, when it is the right one, he may make it (not within AI.moveEvery of his last), and the level lets him:
  // the number is drawn last, so a player with no move to make draws none.
  const tight = nearestTo(opponents(state, p), p), gap = dist(tight, p);
  const person = personOf(state, p), role = person.role, tend = person.tend;
  const moves = right => {
    if (!right || state.time - Math.max(p.moved, ai.triedAt ?? -Infinity) < AI.moveEvery) return false;
    ai.triedAt = state.time;   // one chance at a time: a level that seldom moves does not get there by asking again
    return rand(state) < (!isHuman(state, p.team) ? cpuLevelOf(state).moves : AI.mateMoves);
  };
  // Early in the shot clock he does not settle for a shot from outside or take on a set defence: the offence is run
  // first. A team behind late in the game has no time for that.
  // Once the screen of a play has been used the offence has been run, however early it is.
  const wait = patience(state, p.team), early = !sit.hurry && CLOCK.shot - state.shotClock < wait && !playRan(state, p.team);
  // Nobody between him and the hoop, every defender well behind him: a fast break, run whenever it comes.
  // (A team that likes to run reads a break with less of a lead.)
  const ahead = opponents(state, p).every(o => dist(o, hoop) > toHoop + AI.breakLead * Math.min(1.2, Math.max(0.6, 2 - playbookOf(state, p.team).run)));
  // A handler who has just beaten his man with a move goes too, early or not: that is what the move was for.
  const beat = state.time - p.moved < AI.beatFor;
  // His play has not formed yet: he keeps the ball rather than shoot from outside or pass. So does a team ahead late
  // in the game, until the shot clock is nearly out. A team behind late waits for nothing.
  const waits = (!sit.hurry && playHolds(state, p)) || milking;
  const reaches = m => m && m !== p && legal(m) && dist(m, p) <= AI.passRange && laneClear(state, p, m, untouchable, PLAY.feedWidth);
  const star = state.players.find(m => m.team === p.team && m.person === starOf(state, p.team));

  // Running out of time to cross half court: stop looking for a pass and bring it up.
  if (state.backcourtT > AI.hurryAt && !state.frontcourt) return goTo(ai, { x: sign * AI.topX, z: 0 }, true);
  // With the game on the line the ball goes to the star, if it can reach him.
  if (settled && sit.clutch && star !== p && reaches(star)) { passTo(ai, p, star); state.tempo.fed = true; return; }

  // ---- The choice. Everything open to him, each worth so many expected points (see shotValue below), adjusted for
  // what kind of player he is, the clock and the score; he takes one as his IQ allows (see choose.js). ----
  const options = [];
  const add = (key, value, extra = {}) => options.push({ key, value, ...extra });
  // What keeping the possession going is worth now. Wide open beyond the arc on the catch, it is worth no more than the
  // style says an open three on the catch is to be weighed against: an open catch-and-shoot three is taken.
  const openThree = open && zone === 'three' && ai.heldT >= READ.onCatch;
  const keep = openThree ? Math.min(holdValue(state), styled(state, 'decide.openKeep')) : holdValue(state);
  // The team's rules come first, and the choice is made within them. Early in the shot clock no shot from outside and
  // no drive at a set defence: not unless it is a fast break, he has just beaten his man, he is wide open on the catch,
  // or he is a great shooter with room for an early three. While his play forms, or his team uses the clock, no shot
  // from outside and no pass: he may still take a clear lane to the rim.
  const caught = open && ai.heldT >= READ.onCatch;
  // A star has the green light (where the style gives it): the offence need not be run first for him to create.
  const green = styled(state, 'decide.starLight') && overall(personOf(state, p)) >= STAR_AT && CLOCK.shot - state.shotClock >= styled(state, 'decide.starFrom');   // once the offence is set
  const mayNow = !early || ahead || beat || caught || green || (zone === 'three' && skill >= styled(state, 'decide.earlyThree') && room > styled(state, 'decide.earlyRoom'));
  const shooterBias = leaning(state, p, zone);
  // Shoot from here: once he has gathered the ball, or at once if it found him wide open.
  // Just after a catch the look is as good as it will get, before his man recovers: a shot in rhythm is worth more.
  const rhythm = ai.from != null && ai.heldT < AI.passAfter ? styled(state, 'decide.rhythm') : 0;
  if ((settled || caught) && mayNow && !waits && toHoop <= AI.shootRange && skill >= styled(state, 'decide.floor')) add('shoot', shotValue(state, p, { closing: RISE }) + shooterBias + rhythm);
  // Take it to the rim, along a clear lane.
  if (laneClear(state, p) && (!early || ahead || beat || green)) add('drive', rimValue(state, p) + styled(state, 'decide.drive') * (tend.drive - 0.5));
  // Or at his own man: only he is in the way (no help in the lane), for a man who likes to drive. Worth what the rim is,
  // less the style's cost of taking a man on, and more the quicker and surer with it he is than that man.
  else if (styled(state, 'decide.attack') > 0 && tend.drive >= 0.5 && gap <= 2.5 && laneClear(state, p, hoop, gap + 0.4) && (!early || beat || green))
    add('drive', rimValue(state, p) - styled(state, 'decide.attack') + styled(state, 'decide.drive') * (tend.drive - 0.5)
      + ((rated(state, p, 'speed') + rated(state, p, 'handle')) - (rated(state, tight, 'speed') + rated(state, tight, 'defence'))) / 100);
  // Pass to each team-mate a pass may go to: what he would make of it. Early in the shot clock the ball is moved round
  // the outside, not thrown in to a man near the hoop. With nobody on him he only passes the ball nearer the hoop.
  const pressured = !isOpen(state, p), wanted = playTarget(state, p);
  for (const m of mates(state, p)) {
    if (!legal(m) || back(m) || dist(m, p) > AI.passRange) continue;
    const want = m === wanted;
    if (waits || !(settled && (mayPass || dist(m, hoop) < AI.layupDist || want))) continue;
    // (A star near the hoop is fed early too, where the style gives stars the green light.)
    const inEarly = early && dist(m, hoop) < AI.insideDist && !(styled(state, 'decide.starLight') && overall(personOf(state, m)) >= STAR_AT && CLOCK.shot - state.shotClock >= styled(state, 'decide.starFrom'));
    if (!want && (inEarly || !(pressured || dist(m, hoop) < toHoop))) continue;
    // A lane he can see is not clear he does not throw into: unless he does not see the defender in it, which a
    // poor decision-maker sometimes does not (and the defender then picks it off, as passes are picked off).
    const clear = laneClear(state, p, m, untouchable, want ? PLAY.feedWidth : AI.laneWidth);
    if (!clear && rand(state) >= styled(state, 'decide.misread') * (1 - sharpness(state, iqOf(state, p), 'offence'))) continue;
    const them = personOf(state, m), heat = heatOf(them);
    const value = passValue(state, p, m, keep) + styled(state, 'decide.pass') * (tend.passFirst - 0.5) + (want ? 0.5 : 0)
      + (m === star ? 0.1 : 0) + starPull(state, them, m.team) + (heat === 'hot' ? 0.06 : heat === 'cold' ? -0.06 : 0);
    add('pass', value, { to: m.id });
  }
  // A move to get by a defender up on him, between him and the hoop. With the defender within reach of the ball, or
  // just after he has reached, he keeps it safe: between the legs, or behind the back at a run. With a little room he
  // crosses over. He need not wait for the offence to be run, only for it to be set.
  if (settled && !waits && CLOCK.shot - state.shotClock >= AI.moveFrom && state.frontcourt && rated(state, p, 'handle') >= AI.moveAt && gap <= AI.moveNear && dist(tight, hoop) < toHoop)
    add('move', keep + 0.1 + (rated(state, p, 'handle') - rated(state, tight, 'defence')) / 100 + styled(state, 'decide.drive') * (tend.drive - 0.5));
  // Near the hoop with a defender on him, a post scorer fades over him.
  if (settled && !waits && (!early || green) && toHoop <= MOVES.fade.within && gap <= AI.fadeNear && (rated(state, p, 'inside') >= AI.fadeAt || role === 'Post scorer'))
    add('fade', shotValue(state, p, { fading: true, closing: RISE }) + shooterBias);
  // A defender too close for the jump shot he is good at: a shooter steps back from him, and then shoots.
  if (settled && !waits && mayNow && zone !== 'inside' && gap <= AI.stepNear && toHoop <= AI.shootRange - MOVES.stepBack.push
    && skill >= AI.shootAt && (skill >= AI.stepAt || role === 'Shot creator' || role === 'Sharpshooter')) {
    const out = MOVES.stepBack.push / (toHoop || 1), at = { x: p.x + (p.x - hoop.x) * out, z: p.z + (p.z - hoop.z) * out };
    add('step', shotValue(state, p, { at, closing: RISE - 1 }) + shooterBias);
  }
  // A post scorer with his man on his back backs him down toward the rim.
  if (settled && !waits && tend.post >= 0.5 && toHoop > 2.6 && toHoop <= 6 && zone !== 'three' && gap <= 1.6)
    add('post', shotValue(state, p, { fading: true }) + 0.08 + styled(state, 'decide.drive') * (tend.post - 0.5) + needOf(state, p.team, 'mid'));
  // Keep it: wait for the play, the screen or the clock, or bring it up. Held long without a purpose the ball goes
  // stale, and the defence settles: worth less the longer he has had it, unless his play is still forming.
  add('hold', keep - (waits ? 0 : styled(state, 'decide.stale') * Math.max(0, ai.heldT - 1.5)));
  // In the lane with the three-second count running out, he does not stay: he shoots, passes or fades from there, and
  // with none of those on he takes the ball out of the lane.
  if (p.keyT > AI.keyOut) {
    for (let i = options.length - 1; i >= 0; i--) if (options[i].key === 'hold' || options[i].key === 'post' || options[i].key === 'move') options.splice(i, 1);
    if (!options.length) return goTo(ai, { x: p.x, z: Math.sign(p.z || 1) * (VIOLATION.keyHalfWidth + 0.9) }, true);
  }

  const pick = choose(state, lean(state, p, options), iqOf(state, p), 'offence');
  ai.chose = pick.key; ai.options = options;   // what he chose and from what, for whoever watches (the tests)
  switch (pick.key) {
    case 'shoot': return shoot();
    case 'drive': {
      // Close enough for his two steps, he finishes; until then he runs at the rim.
      const kind = canDunk(state, p) ? 'dunk' : 'layup';
      if (settled && driving() && toHoop >= FINISH.takeoff[kind] + 0.3) return finish();
      return goTo(ai, { x: sign * AI.driveX, z: 0 }, true);
    }
    case 'pass': if (pick.to === star?.id) state.tempo.fed = true; return passTo(ai, p, state.players[pick.to]);
    case 'move':
      if (!moves(true)) break;
      ai.action = tight.stealCooldown > 0 || gap <= STEAL.reach ? (Math.hypot(p.vx, p.vz) < 3 ? 'legs' : 'back') : 'cross';
      ai.soon = MOVES[ai.action].time + DT;
      return;
    case 'fade': if (moves(true)) return shoot('fade'); break;
    case 'step':
      if (!moves(true)) break;
      ai.action = 'stepBack'; ai.stepped = state.time; ai.soon = MOVES.stepBack.time + DT;
      return;
    case 'post': {
      const far = toHoop || 1;
      return goTo(ai, { x: p.x + ((hoop.x - p.x) / far) * 1.2, z: p.z + ((hoop.z - p.z) / far) * 1.2 });
    }
    default: break;
  }
  // Just caught it open in the corner, he squares up there while he gathers (not on a break): a shooter left open in
  // the corner shoots from the corner. Closed out on, or anywhere else, he moves on into the offence.
  const inCorner = Math.abs(p.z) > THREE_PT.cornerZ - 0.4 && sign * p.x > RIM.x - 2.5;
  if (!settled && zone === 'three' && inCorner && room >= READ.wide && !ahead && styled(state, 'decide.squareUp')) return goTo(ai, { x: p.x, z: p.z });
  // Nothing on, and no play on. A man who caught a pass where he can play from squares up there and gathers it, as a
  // player does on the catch: he does not turn and dribble it out to the top to pass it on. Then, still with nothing
  // on, he works it along the arc toward its middle, but stays on his own side (AI.workTo, AI.slotTurn), where a three
  // or a passing angle may open; or, where the style has drivers attack (decide.catchDrive), a strong driver
  // (AI.catchDriveAt) inside the arc attacks the gap at the elbow on his side. In a play he takes the ball where the
  // play says: its action needs it there. The man who brought the ball up, or one who caught it far out, takes it where
  // the play says, or else to the top, which his team-mates leave to him.
  const spot = playSpot(state, p);
  const squares = ai.from != null && state.frontcourt && toHoop <= AI.shootRange + AI.catchRoom;
  if (squares && !spot) {
    if (ai.heldT < AI.holdTime) return goTo(ai, { x: p.x, z: p.z });
    if (styled(state, 'decide.catchDrive') && tend.drive >= AI.catchDriveAt && zone !== 'three') {
      const elbow = { x: sign * (COURT.halfLength - LANE.depth), z: Math.sign(p.z || 1) * LANE.halfWidth };
      return goTo(ai, dist(p, elbow) < AI.elbowNear || dist(elbow, hoop) >= toHoop ? { x: p.x, z: p.z } : elbow);
    }
    // Halfway round the arc from where he is toward its middle, but no nearer the middle than AI.slotTurn, at least at
    // the arc, and as far as AI.workTo takes him.
    const angle = Math.atan2(p.z, sign * (hoop.x - p.x)), turn = Math.sign(angle) * Math.max(Math.abs(angle) / 2, Math.min(Math.abs(angle), AI.slotTurn));
    const r = Math.max(toHoop, THREE_PT.radius + AI.arcOut);
    const slot = { x: hoop.x - sign * r * Math.cos(turn), z: r * Math.sin(turn) }, far = dist(slot, p), k = Math.min(1, AI.workTo / (far || 1));
    return goTo(ai, far < AI.elbowNear ? { x: p.x, z: p.z } : { x: p.x + (slot.x - p.x) * k, z: p.z + (slot.z - p.z) * k });
  }
  goTo(ai, spot ?? { x: sign * AI.topX, z: 0 });
}

// ---------- what a shot is worth: the shot model's expected points, as a computer shooter takes it ----------

// Metres a defender makes up while a shooter gathers and rises: a shot is judged by the gap it will be let go over,
// not the one he sees as he decides.
const RISE = 0.6;

// What his reaction to his man going up is multiplied by: in a style that reads it, the sharper the sooner.
const reaction = (state, p) => 1 + styled(state, 'react.iq') * (1.25 - iqOf(state, p) - 0.5);

// How well `p` decides: his own IQ, and in Play, for the computer's team, sharper or duller as the level says.
function iqOf(state, p) {
  const humans = state.humans ?? [0], iq = personOf(state, p).iq;
  if (!humans.length || humans.includes(p.team)) return iq;
  return Math.min(0.99, Math.max(0.2, iq + (LEVEL_IQ[state.difficulty] ?? 0)));
}

// The share of a shot's chance a computer's release keeps on average (see shooting.js).
const meanTiming = (jitter, worst) => sharedTiming(jitter, worst, SHOT_BEST, SHOT_LANDS, SHOT.gather);

// How a computer shooter of `team` shoots: his release spread, the share a bad release keeps, and the level's make and
// green-window factors. A team nobody plays shoots on the computer's numbers (in a match nobody plays, All-Star's);
// the computer players of your team shoot on your level's numbers, as makeChance has them.
function shooterLevel(state, team) {
  const level = levelOf(state), cpu = cpuLevelOf(state);
  return !isHuman(state, team) ? { jitter: cpu.jitter, worst: SHOT.worstTiming, make: cpu.cpuMake, green: cpu.cpuGreen }
    : { jitter: AI.releaseJitter, worst: level.timing, make: level.make, green: level.green };
}

// What a jump shot by `m` from `at` (his own place unless said) is worth in expected points: its value times its
// chance, a green release counted as the style counts it, with his nearest defender as far off as he is less
// `closing` (the ground a defender makes up while a pass is in the air). `fading`: a post fade.
export function shotValue(state, m, { at = m, closing = 0, fading = false } = {}) {
  const sign = attackSign(m.team), hoop = rimCentre(sign), far = dist(at, hoop);
  let nearest = null, gap = Infinity;
  for (const o of state.players) if (o.team !== m.team) { const d = dist(o, at); if (d < gap) { gap = d; nearest = o; } }
  // A man reads a closeout (as far ahead as the style says): his defender running at him will have come that much
  // further by the time the ball is up.
  const read = styled(state, 'decide.readClose');
  const toward = read > 0 && gap > 0 ? Math.max(0, (nearest.vx * (at.x - nearest.x) + nearest.vz * (at.z - nearest.z)) / gap) : 0;
  gap = Math.max(0.2, gap - closing - toward * read);
  const three = isThree(at.x, at.z, sign), corner = Math.abs(at.z) > THREE_PT.cornerZ;
  const zone = three ? 'three' : far < SHOT.insideDist ? 'inside' : 'mid';
  const person = personOf(state, m), rating = person.ratings[zone] + moodSkill(state, m), heat = heatOf(person), lv = shooterLevel(state, m.team);
  const contest = contestShare({ gap, defence: rated(state, nearest, 'defence'), fading });
  const base = distanceChance(styled(state, 'shot.curve'), far, zoneFor(far, three, corner, null));
  const meter = styled(state, 'shot.meter');   // without one (Simulation) a release is not judged and is never green
  const chance = shotChance({ base, timing: meter ? meanTiming(lv.jitter, lv.worst) : 1, contest, energy: person.energy, levelMake: lv.make,
    skill: skillOf(rating, heat), fading, make: styled(state, 'shot.make'), form: person.form ?? 1 });
  const range = rangeShare(far);
  const half = windowHalf({ steps: levelFor(contest).steps, range, energy: person.energy, levelGreen: lv.green, rating, heat });
  const green = meter ? greenShare(half, lv.jitter, range > 0 && sign * (at.x - hoop.x) <= 0) : 0;
  return expectedShot({ value: three ? 3 : 2, chance, green, rule: styled(state, 'shot.green'), boost: styled(state, 'shot.boost') });
}

// What taking it all the way to the rim is worth: a finish a metre in front of it, contested by whoever is nearest that
// spot, and something for the foul a drive draws; less a little for the steal or the charge it risks.
function rimValue(state, p) {
  const sign = attackSign(p.team), hoop = rimCentre(sign);
  return shotValue(state, p, { at: { x: hoop.x - sign * 1, z: 0 } }) + (canDunk(state, p) ? 0.1 : 0) + styled(state, 'decide.foulDraw') - 0.1 + styled(state, 'decide.rimBase') + needOf(state, p.team, 'rim');
}

// What a pass to `m` is worth: the best he could make of it on the catch (a shot as his man closes, the rim if his
// lane is clear), or the possession going on in his hands, less the moment the pass takes.
// A shot is weighed as its taker likes it: more for a man who looks for his shot (usage), and for one shooting from
// where he likes to (his diet), less for the others.
// His team's appetite for threes counts too, and the style's own (the modern game's).
function leaning(state, m, zone = zoneOf(m)) {
  const tend = personOf(state, m).tend;
  return styled(state, 'decide.usage') * (tend.usage - 0.5) + styled(state, 'decide.diet') * (tend.diet[zone === 'inside' ? 'rim' : zone] - 1 / 3)
    + (zone === 'three' ? styled(state, 'decide.threes') * (playbookOf(state, m.team).threes - 1) + styled(state, 'decide.threeBase') : 0)
    + (zone === 'inside' ? styled(state, 'decide.rimBase') : 0) - (zone === 'mid' ? styled(state, 'decide.midCost') : 0) + needOf(state, m.team, zone);
}

// Late in the shot clock a pass also costs the receiver the time he needs to gather it and get a shot up.
function passValue(state, p, m, keep) {
  const closing = (dist(p, m) / PASS.speed) * 4 + 0.3 + RISE;
  const drive = laneClear(state, m) ? rimValue(state, m) - 0.15 : 0;
  return Math.max(shotValue(state, m, { closing }) + leaning(state, m), drive, keep) - 0.04 - 0.08 * Math.max(0, 8 - state.shotClock);
}

// What keeping the possession going is worth: the style's points for a possession, less and less as the shot clock runs
// down and a shot must be got up whatever it is.
const holdValue = state => styled(state, 'decide.possession') * Math.min(1, Math.max(0.2, (state.shotClock - 3) / 9));

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

  // Boxing out: while a shot is in the air each defender gets between his man and the hoop and holds him off, before
  // anybody goes for the ball.
  if (ball.mode === 'shot' && ball.shooter !== null && state.players[ball.shooter].team !== p.team && state.shot && state.time - state.shot.at < AI.boxFor) {
    const man = manOf(state, p), own = rimCentre(-sign), far = dist(man, own) || 1;
    return goTo(ai, { x: man.x + ((own.x - man.x) / far) * AI.boxGap, z: man.z + ((own.z - man.z) / far) * AI.boxGap }, true);
  }

  // A shot is rebounded by those nearest the rim it is heading for; a loose ball by those nearest it.
  const focus = ball.mode === 'shot' ? rimCentre(ball.x >= 0 ? 1 : -1) : ball;
  // To a shot go the team's two best rebounders on the floor; to any other loose ball the two nearest it.
  // The team that shot sends its two best rebounders; the defence, which has boxed out and stands inside, sends
  // those of its players nearest the rim.
  const shot = ball.mode === 'shot' && ball.shooter !== null, ours = shot && state.players[ball.shooter].team === p.team;
  // How many of the team that shot go to the glass is its playbook's choice (two for a team like any other; a team
  // that gets back sends one, one that crashes three), and who goes is who rebounds and likes to.
  const crash = playbookOf(state, p.team).crash, crashers = Math.min(team.length - 1, Math.max(1, Math.round(((2 * crash) / 0.4) * styled(state, 'board.crash'))));
  const pull = m => rated(state, m, 'rebound') * (0.5 + personOf(state, m).tend.crash);
  const order = ours ? (a, b) => pull(b) - pull(a) || dist(a, focus) - dist(b, focus) : (a, b) => dist(a, focus) - dist(b, focus);
  const chasers = [...team].sort(order).slice(0, !shot ? 2 : ours ? crashers : styled(state, 'board.defence'));
  if (!chasers.includes(p)) {
    const back = state.players.filter(m => m.team === p.team && !chasers.includes(m)).sort((a, b) => a.z - b.z);
    return goTo(ai, { x: -sign * AI.safetyX, z: (back.indexOf(p) - (back.length - 1) / 2) * AI.safetyGap }, true);
  }

  // Held by a box-out (where the style has one hold): while the shot is in the air and his man is boxing him out, an
  // offensive rebounder cannot get past him to the rim; he works behind him until the ball comes off.
  if (ours && styled(state, 'board.boxHold') && state.shot && state.time - state.shot.at < AI.boxFor) {
    const boxer = state.players.find(o => o.team !== p.team && o.man === p.id), rim = rimCentre(sign);
    if (boxer && dist(boxer, p) < 1.3) {
      const far = dist(boxer, rim) || 1;
      return goTo(ai, { x: boxer.x - ((rim.x - boxer.x) / far) * 0.6, z: boxer.z - ((rim.z - boxer.z) / far) * 0.6 }, true);
    }
  }
  // Reading the carom (where the style has it): a loose ball is chased to where it will be when he gets there, as far
  // ahead as the style's lead (seconds), not to where it is.
  const lead = ball.mode === 'loose' ? Math.min(styled(state, 'board.lead'), dist(p, ball) / PLAYER.sprint) : 0;
  goTo(ai, lead > 0 ? { x: ball.x + ball.vx * lead, z: ball.z + ball.vz * lead } : ball, true); ai.chase = true;
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
  // His part in the play, or else what he does off the ball: his place, a cut, room for a drive, a lane on the break.
  const spot = playSpot(state, p) ?? offBallSpot(state, p) ?? { x: p.x, z: p.z };
  ai.why = spot.why ?? 'play';   // what he is doing off the ball: a part in a play, his place, a cut, clearing a drive, a break
  // Whatever he was sent in for, he does not stay in the key: with the count running out he steps out to the side.
  if (p.keyT > AI.keyOut) { spot.x = p.x; spot.z = Math.sign(p.z || 1) * (VIOLATION.keyHalfWidth + 0.9); spot.sprint = true; }
  goTo(ai, spot, spot.sprint || situation(state, p.team).hustle || dist(p, spot) > styled(state, 'ai.farAway'));
  // Open in a place he can score from, he puts a hand up for the ball. (Not the player you control: that is yours to do.)
  if (holder && holder !== p && holder.team === p.team && !(isHuman(state, p.team) && p.id === state.controlled)) {
    const zone = zoneOf(p), skill = rated(state, p, zone);
    p.calling = skill >= AI.callAt && dist(p, rimCentre(sign)) <= AI.shootRange && space(state, p) > Math.min(AI.openDist, AI.openDist * drop(skill, AI.roomGap));
  }
}

// Whether `p` should leave his man to help: the ball handler, who is not his man, has a clear lane and is near the
// hoop, and of the defenders off the ball `p` is the nearest to the hoop. Once he has come he stays a moment.
// It is a choice: what the handler would make at the rim, weighed by how readily this defender helps, against what his
// own man would make left open. A sharp defender weighs them well; a poor one sometimes stays when he should go.
function helps(state, p, man, hoop) {
  const holder = state.players[state.ball.holder];
  if (!holder || holder.team === p.team || holder === man || holder.inbounder || state.phase !== 'live') return false;
  if (state.time < (p.ai.helpUntil ?? 0) && dist(holder, hoop) <= AI.helpFrom) return true;
  if (dist(holder, hoop) > AI.helpFrom || !laneClear(state, holder)) return false;
  const off = state.players.filter(m => m.team === p.team && manOf(state, m) !== holder);
  if (nearestTo(off, hoop) !== p) return false;
  const eager = 0.6 + 0.8 * personOf(state, p).tend.help * schemeOf(state, p.team).help / 0.6;
  // A good shooter in the corner is not left (where the style has the defence stay home): the pass there is the shortest
  // and the three there the best.
  const home = Math.abs(man.z) > THREE_PT.cornerZ - 0.4 && rated(state, man, 'three') >= 80 ? styled(state, 'decide.stayHome') : 0;
  const options = [{ key: 'help', value: rimValue(state, holder) * eager }, { key: 'stay', value: shotValue(state, man, { closing: -1 }) + home }];
  if (choose(state, options, iqOf(state, p), 'defence').key !== 'help') return false;
  p.ai.helpUntil = state.time + AI.helpFor;
  return true;
}

// A post scorer who has caught the ball deep draws a second defender, if his team's defence doubles the post: the
// defender guarding the attacker nearest him who is no shooter (his man is the one left open, and the rest rotate).
function doubles(state, p, man, hoop) {
  const holder = state.players[state.ball.holder];
  if (!holder || holder.team === p.team || holder === man || holder.inbounder || state.phase !== 'live' || !schemeOf(state, p.team).postDouble) return false;
  if (rated(state, holder, 'inside') < SCHEME.doubleAt || dist(holder, hoop) > SCHEME.doubleWithin || (holder.ai.heldT ?? 0) > SCHEME.doubleFor) return false;
  const open = state.players.filter(m => m.team === p.team && manOf(state, m) !== holder && rated(state, manOf(state, m), 'three') < OFF.shooterAt);
  if (!open.length || nearestTo(open, holder) !== p) return false;
  p.ai.helpUntil = state.time + 0.5;   // he has left his man: the others rotate to him (help the helper, below)
  return true;
}

function planDefence(state, p) {
  const { ai } = p, sit = situation(state, p.team);
  const hoop = rimCentre(-attackSign(p.team));   // the hoop this player defends
  const holder = state.players[state.ball.holder], theirs = holder && holder.team !== p.team && state.phase === 'live';
  let man = manOf(state, p);
  // Getting back: while the ball is still in the other team's half, the defender nearest his own hoop guards the rim
  // and the next nearest the ball picks up whoever has it; the rest find their own men.
  if (theirs && attackSign(holder.team) * holder.x < 0 && !sit.press && !holder.inbounder) {
    const mine = state.players.filter(m => m.team === p.team), first = nearestTo(mine, hoop);
    // Only a defender who is between the ball and the hoop can stop it; one chasing from behind keeps to his man.
    const ahead = mine.filter(m => m !== first && dist(m, hoop) < dist(holder, hoop)), second = ahead.length ? nearestTo(ahead, holder) : null;
    if (p === first) return goTo(ai, { x: hoop.x - Math.sign(hoop.x) * AI.helpAt, z: 0 }, dist(p, hoop) > styled(state, 'ai.farAway'));
    if (p === second) man = holder;
  }
  const hasBall = state.ball.holder === man.id;
  // How far off his man he stands: closer to a good shooter and further from a poor one, and on the ball a step more
  // for a quick man.
  // Off the ball his scouting report counts too: tighter on a man who looks for his three, off one who never does.
  // On the ball his team's pressure.
  const three = rated(state, man, 'three'), scheme = schemeOf(state, p.team), iq = iqOf(state, p);
  const report = Math.min(1.2, Math.max(0.85, 1 + styled(state, 'decide.scout') * (1 / 3 - personOf(state, man).tend.diet.three)));
  const usual = hasBall ? Math.min(Math.max(AI.onBallGap * drop(three, AI.shooterGap) * lift(rated(state, man, 'speed'), AI.quickGap), AI.gapRange[0]), AI.gapRange[1]) / scheme.pressure
    : AI.offBallGap * drop(three, AI.offShooterGap) * report;
  // As his coach has adjusted it: to what the other team scores with, to the score late (a big lead eases off), and to
  // a man having a big night.
  const gap = (hasBall && sit.press ? LATE.pressGap : usual) * tightness(state, p.team, hasBall) * easeOf(state, p.team) * focusOf(state, man);
  const d = dist(hoop, man) || 1;
  let guard = { x: man.x + ((hoop.x - man.x) / d) * gap, z: man.z + ((hoop.z - man.z) / d) * gap };
  // No full-court press: while their man is still up the court, wait for him on the pick-up line, between him and the
  // hoop. A team behind late in the game does press.
  const line = Math.sign(hoop.x) * AI.pickupX;
  if (!sit.press && Math.abs(hoop.x - guard.x) > Math.abs(hoop.x - line)) {
    const u = (line - man.x) / (hoop.x - man.x);
    guard = { x: line, z: man.z + (hoop.z - man.z) * u };
  }
  // Off the ball a defender who decides poorly watches the ball, and drifts toward it from his man.
  if (theirs && !hasBall) {
    const watch = styled(state, 'decide.watch') * (1 - sharpness(state, iq, 'defence'));
    guard = { x: guard.x + (state.ball.x - guard.x) * watch, z: guard.z + (state.ball.z - guard.z) * watch };
  }
  // Two passes from the ball he sags toward the lane, where he can help; one pass away he stays close.
  const away = theirs && !hasBall && dist(man, holder) > AI.onePass && dist(man, hoop) < AI.sagWithin;
  if (away) {
    const lane = { x: hoop.x - Math.sign(hoop.x) * AI.sagTo, z: 0 };
    guard = { x: guard.x + (lane.x - guard.x) * AI.sag, z: guard.z + (lane.z - guard.z) * AI.sag };
    // Help the helper: of those sagging, the nearest to the man a helper has left stands between him and his own.
    const helper = state.players.find(m => m.team === p.team && m !== p && state.time < (m.ai.helpUntil ?? 0));
    const left = helper && manOf(state, helper);
    if (left && left !== holder) {
      const sagging = state.players.filter(m => m.team === p.team && m !== helper && manOf(state, m) !== holder && dist(manOf(state, m), holder) > AI.onePass);
      if (sagging.length && nearestTo(sagging, left) === p) guard = { x: (man.x + left.x) / 2, z: (man.z + left.z) / 2 };
    }
  }
  // Help: he steps in front of the rim, on the handler's way to it.
  if (helps(state, p, man, hoop)) {
    const far = dist(holder, hoop) || 1;
    guard = { x: hoop.x + ((holder.x - hoop.x) / far) * AI.helpAt, z: hoop.z + ((holder.z - hoop.z) / far) * AI.helpAt };
  } else if (doubles(state, p, man, hoop)) {
    // The double: beside the post man, on the side of the man he has left, so that the easy pass back out is not there.
    const toMan = dist(man, holder) || 1;
    guard = { x: holder.x + ((man.x - holder.x) / toMan) * SCHEME.doubleGap, z: holder.z + ((man.z - holder.z) / toMan) * SCHEME.doubleGap };
  }
  // A dropping big: his man is setting the screen on the ball, and he sits back between the ball and the rim until
  // the handler is past it, while the ball's defender goes over.
  if (theirs && scheme.screen === 'drop' && screenerOn(state, holder.team) === man.id) {
    const far = dist(holder, hoop) || 1;
    guard = { x: hoop.x + ((holder.x - hoop.x) / far) * SCHEME.dropAt, z: hoop.z + ((holder.z - hoop.z) / far) * SCHEME.dropAt };
  }
  // To foul on purpose he goes straight at the ball.
  if (sit.foul && hasBall && !man.inbounder) guard = { x: man.x, z: man.z };
  // Closing out: his man has just caught the ball, and he sprints at him with a hand up. A poor decision-maker may fly at
  // him instead of arriving under control: he aims past him, and the shooter has a lane to drive.
  p.closing = theirs && hasBall && !man.inbounder && (man.ai.heldT ?? Infinity) < AI.closeFor && dist(p, guard) > AI.arrive;
  if (p.closing && !ai.closingOut) ai.flying = rand(state) < styled(state, 'decide.fly') * (1 - iq);
  ai.closingOut = p.closing;
  if (p.closing && ai.flying) { const far = dist(p, man) || 1; guard = { x: man.x + ((man.x - p.x) / far) * SCHEME.flyPast, z: man.z + ((man.z - p.z) / far) * SCHEME.flyPast }; }
  goTo(ai, guard, p.closing || sit.hustle || sit.press || dist(p, guard) > styled(state, 'ai.farAway'));

  // A gather does not draw him off the floor: he goes up when his man does.
  if (shotJump(man) && dist(p, man) < AI.contestDist) ai.action = 'jump';
  else if (sit.foul && state.phase === 'live' && holder && holder.team !== p.team && !holder.inbounder && dist(p, holder) <= STEAL.reach) ai.action = 'foul';
  else if (hasBall && !man.inbounder && p.stealCooldown <= 0 && dist(p, man) <= STEAL.reach
    && rand(state) < styled(state, 'ai.stealRate') * (!isHuman(state, p.team) ? cpuLevelOf(state).steal : 1) * gambleOf(state, p, personOf(state, p)) * (0.5 + personOf(state, p).tend.gamble)) ai.action = 'steal';
}

function plan(state, p) {
  const holder = state.players[state.ball.holder];
  p.ai.action = null; p.ai.chase = false;
  p.calling = p.closing = false;
  if (holder === p) planWithBall(state, p);
  // A dead ball is not chased: the team about to inbound sets up, the other gets back on defence.
  else if (state.phase === 'dead') (p.team === state.possession ? planOffBall : planDefence)(state, p);
  else if (!holder) planFreeBall(state, p);
  else if (holder.team === p.team) planOffBall(state, p);
  else planDefence(state, p);
}

// Paced by his gaits (see the plan's glide meter): the share of his running speed he asks for to go `d` metres. Far
// off he runs, at least GAIT.run; nearer he walks, between GAIT.walk[0] and [1], easing in as he arrives; never the
// speeds between a walk and a run that no clip plays without the feet slipping.
const GAIT = Object.freeze({ walk: Object.freeze([1.1, 2.0]), run: 3.3, runFrom: 3.5 });
function gaitShare(state, p, d) {
  const hasBall = state.ball.holder === p.id, person = personOf(state, p);
  const top = PLAYER.run * speedFactor(person.energy) * lift(person.ratings.speed, RATE.speed) * (hasBall ? lift(person.ratings.handle, RATE.speed) * PLAYER.dribbleSpeed : 1);
  const v = d > GAIT.runFrom ? Math.max(GAIT.run, top) : Math.min(GAIT.walk[1], Math.max(GAIT.walk[0], d * 0.8));
  return Math.min(1, v / top);
}

// Turns the current plan into this step's intent.
function act(state, p) {
  const { ai } = p, intent = emptyIntent();
  const dx = ai.targetX - p.x, dz = ai.targetZ - p.z, d = Math.hypot(dx, dz);
  if (d > AI.arrive) {
    // He eases into a spot instead of stopping dead on it, but goes flat out for a ball that is there to be won. Where
    // the style paces him by his gaits, he moves only at speeds his legs can show: a walk, or a run.
    const part = ai.chase ? 1 : styled(state, 'move.pacing') === 'gaits' ? (ai.sprint ? 1 : gaitShare(state, p, d)) : Math.min(1, d / AI.slowDist);
    intent.moveX = (dx / d) * part; intent.moveZ = (dz / d) * part; intent.sprint = ai.sprint;
  }

  const hasBall = state.ball.holder === p.id;
  if (ai.action === 'shoot' && hasBall) {
    intent.moveX = intent.moveZ = 0;
    // Press (a fresh press needs the key up first), hold through the gather and the jump,
    // and let go on the first step at or after the chosen moment.
    // A layup's best moment is its own jump's, known once he has begun it.
    const releaseAt = p.finish ? Math.min(Math.max(shotBest(p) + (ai.releaseOff ?? 0), gatherOf(p) + DT), shotLands(p) - 3 * DT) : ai.releaseAt;
    intent.shoot = p.shooting ? p.shotT + DT < releaseAt : !p.prev.shoot;
  } else if (ai.action === 'pass' && hasBall) {
    intent.pass = !p.prev.pass;
    intent.moveX = ai.passX; intent.moveZ = ai.passZ;
    if (intent.pass) { ai.action = null; passed(state, p); }   // and he may cut for the ball back
  } else if (ai.action === 'fade' && hasBall) {
    intent.moveX = intent.moveZ = 0;
    intent.fade = p.shooting ? p.shotT + DT < ai.releaseAt : !p.prev.fade;   // held and let go as a shot is
  } else if (ai.action === 'dunk' && hasBall) {
    intent.moveX = intent.moveZ = 0;
    intent.dunk = !p.shooting && !p.prev.dunk;   // one press: a dunk has nothing to hold or time
    if (intent.dunk) ai.action = null;
  } else if (KINDS.includes(ai.action) && hasBall) {
    intent.moveX = intent.moveZ = 0;   // no key held: the move goes away from his defender
    intent[ai.action] = !p.prev[ai.action];
    ai.action = null;
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
    if (has && !p.ai.had) {
      p.ai.timer = 0;
      // Whom the ball came from, if a team-mate passed it, and when: he is not passed straight back to.
      const passer = state.players[state.passer];
      p.ai.from = passer && passer !== p && passer.team === p.team ? passer.id : null; p.ai.gotAt = state.time;
    }
    // Nor is a pass from a teammate: the receiver runs onto it at once.
    const ownPass = state.ball.mode === 'pass' && state.lastTouch === p.team;
    if (ownPass && !p.ai.sawPass) p.ai.timer = 0;
    p.ai.sawPass = ownPass;
    // His man going up for a shot: he reacts within the style's contest delay, not at his next decision.
    const up = shotJump(manOf(state, p));
    if (up && !p.ai.sawJump) p.ai.timer = Math.min(p.ai.timer, rand(state) * styled(state, 'ai.contestDelay') * reaction(state, p));
    p.ai.sawJump = up;
    // His man setting off on a cut: a defender watching the ball sees it late.
    const cutting = state.cut[1 - p.team]?.id === p.man;
    if (cutting && !p.ai.sawCut) p.ai.timer = Math.max(p.ai.timer, styled(state, 'decide.watchDelay') * (1 - iqOf(state, p)));
    p.ai.sawCut = cutting;
    p.ai.heldT = has ? (p.ai.had ? p.ai.heldT + dt : 0) : 0;
    p.ai.had = has;
    if (p.ai.timer <= 0) {
      plan(state, p);
      // The computer's team thinks as fast as the level says; within a team a sharp player looks again sooner.
      p.ai.timer = (!isHuman(state, p.team) ? cpuLevelOf(state).interval : AI.interval) * (1 + styled(state, 'decide.spread') * (0.7 - iqOf(state, p))) + rand(state) * AI.jitter;
      if (p.ai.soon !== undefined) { p.ai.timer = p.ai.soon; p.ai.soon = undefined; }   // he looks again as his move ends
    }
    return act(state, p);
  });
}
