// One possession in the fast engine, as beats. Each beat gives the man with the ball his options (a shot from where he
// likes to shoot, a drive if a lane opens, a pass to each team-mate, a post move, keeping it), each a look drawn from
// the play being run and worth what the shared shot model says; he chooses with the same decision maker as the 3D
// game's players (choose.js), with the same leanings, rules of patience and clock.
import { AI, CLOCK, LATE, PLAY } from '../tuning.js';
import { lean } from '../mood.js';
import { personOf, rand } from '../state.js';
import { styled } from '../styles.js';
import { STAR_AT, choose, sharpness, starPull } from '../choose.js';
import { cast, playsFor, suits } from '../plays.js';
import { easeOf, focusOf, lastShot, playWeight, playbookOf, running } from '../coach.js';
import { schemeOf } from '../matchups.js';
import { needOf, situation } from '../late.js';
import { starOf } from '../ratings.js';
import { drop, lift, overall } from '../overall.js';
import { QUICK, KIND, within } from './shapes.js';
import { isThreeZone, look, playFor } from './outcomes.js';
import { foulShare } from './who.js';

const person = (state, p) => personOf(state, p);
const mates = (state, p) => state.players.filter(m => m.team === p.team && m !== p);
const guardOf = (state, p) => state.players.find(o => o.man === p.id) ?? state.players.find(o => o.team !== p.team);

// How far off a man his defender plays, as a share of the usual, as the 3D game's defenders play it (ai.js,
// planDefence): closer to a good shooter; on the ball a step further off a quick man; off it, by the scouting report,
// closer to a man who looks for his three.
// And a defence well ahead late eases off, and closes on a man having a big night (coach.js, easeOf and focusOf). Off
// the ball a defender who reads the game poorly watches the ball and drifts toward it, leaving his man more room (the
// 3D game's drift is decide.watch x (1 - IQ) of the way to the ball: about three times that in room); the style's
// defensive IQ sharpens his read as it sharpens his choices (choose.js).
function attention(state, m, onBall) {
  const { ratings, tend } = person(state, m), ease = easeOf(state, 1 - m.team) * focusOf(state, m);
  if (onBall) return drop(ratings.three, AI.shooterGap) * lift(ratings.speed, AI.quickGap) * ease;
  const read = sharpness(state, person(state, guardOf(state, m)).iq, 'defence');
  return drop(ratings.three, AI.offShooterGap) * Math.min(1.2, Math.max(0.85, 1 + styled(state, 'decide.scout') * (1 / 3 - tend.diet.three))) * ease
    * (1 + 3 * styled(state, 'decide.watch') * Math.max(0, 1 - read));
}

// Where a man likes to shoot from, drawn from his diet: 'three' (from the corner a little less often than above the
// break), or 'mid' (now and then a short one, 'close', off his own dribble). A pull-up or a catch; the rim is a drive's
// or a feed's. `catching`: where he would catch a pass, never close (a man near the rim is fed there: a roll or a cut).
function jumper(state, p, catching = false) {
  if (situation(state, p.team).three) return rand(state) < QUICK.cornerShare ? 'corner3' : 'arc3';   // down three late: only a three ties
  const { diet } = person(state, p).tend, three = Math.min(0.95, (QUICK.threeShare * diet.three) / (diet.three + diet.mid));
  if (rand(state) < three) return rand(state) < QUICK.cornerShare ? 'corner3' : 'arc3';
  return rand(state) < 0.04 && !catching ? 'close' : 'mid';
}

// What keeping the possession going is worth, as the 3D game values it (ai.js, holdValue), and how a man's leanings and
// his team's appetite for threes weigh a shot (ai.js, leaning).
const keepValue = state => styled(state, 'decide.possession') * Math.min(1, Math.max(0.2, (state.shotClock - 3) / 9));
function leaning(state, p, zone) {
  const tend = person(state, p).tend, key = zone === 'rim' || zone === 'close' ? 'rim' : isThreeZone(zone) ? 'three' : 'mid';
  return styled(state, 'decide.usage') * (tend.usage - 0.5) + styled(state, 'decide.diet') * (tend.diet[key] - 1 / 3)
    + (isThreeZone(zone) ? styled(state, 'decide.threes') * (playbookOf(state, p.team).threes - 1) + styled(state, 'decide.threeBase') : 0)
    + (zone === 'rim' || zone === 'close' ? styled(state, 'decide.rimBase') : 0) - (zone === 'mid' ? styled(state, 'decide.midCost') : 0) + needOf(state, p.team, zone);
}

// The coach's play for `team` now, as stepPlays calls it: a play the match has, weighted by how it suits the floor,
// his playbook, the mismatch it hunts and what has worked. Null with the clock too short for one.
function callPlay(state, team, handler, star) {
  if (Math.min(state.shotClock, state.gameClock) <= PLAY.minClock) return null;
  state.ball.holder = handler.id;
  const ids = cast(state, handler), list = playsFor(state.size);
  const weights = list.map(key => suits(state, team, key, ids, star) * playWeight(state, team, key, ids));
  let at = rand(state) * weights.reduce((a, b) => a + b, 0);
  const key = list.find((_, i) => (at -= weights[i]) < 0) ?? list[list.length - 1];
  running(state, team, key);
  if (state.ato === team) state.ato = null;
  return { key, kind: KIND[key] ?? 'iso', ids };
}

// The man who brings the ball up: most often the best with it on the floor (his handle, and his feel for the game),
// but not always, as in the 3D game, where the ball starts with whoever takes the inbound or the rebound and the
// outlet finds a guard. Drawn by those, much the more often the better.
function handlerOf(state, team) {
  const five = state.players.filter(p => p.team === team), weight = p => (person(state, p).ratings.handle + 30 * person(state, p).iq) ** QUICK.handlerPull;
  let at = rand(state) * five.reduce((sum, p) => sum + weight(p), 0);
  return five.find(p => (at -= weight(p)) < 0) ?? five[five.length - 1];
}

// Plays `team`'s possession from how it began: 'inbound' (after a basket or a whistle), 'side' (its own ball again after
// a whistle, in the front court), 'dreb' or 'steal' (live), or 'oreb' (its own miss back, the shot clock already set). Returns what ended it: { how, by?, look?, fouled?, ... },
// for engine.js to finish: 'shot' (with the look and how it went), 'turnover', 'foul' (a defensive foul away from a
// shot), 'period' (the clock ran out with nothing taken).
export function playPossession(state, team, begun) {
  const r = () => rand(state);   // the match's dice, once for the possession
  const sit = situation(state, team), book = playbookOf(state, team), scheme = schemeOf(state, 1 - team);
  let h = begun === 'oreb' && state.ball.holder !== null ? state.players[state.ball.holder] : handlerOf(state, team);
  // The defence fouls on purpose, late and behind: the ball is grabbed at once, as it comes in or is picked up, before
  // it is brought up (a team chasing the game needs every second; an offensive rebound may still go straight back up).
  // The foul is given by the defender on the floor with the most fouls to give (his man's guard, if no one has fewer).
  const fresh = () => state.players.filter(p => p.team !== team).reduce((best, p) => (personOf(state, p).fouls < personOf(state, best).fouls ? p : best), guardOf(state, h));
  const grab = () => { playFor(state, 1 + rand(state) * 2); return { how: 'foul', on: h, by: fresh(), on_purpose: true }; };
  if (begun !== 'oreb' && situation(state, 1 - team).foul) return grab();
  // Bringing it up: an inbound is walked up and set; a live ball may be pushed.
  if (begun === 'inbound') playFor(state, (within(r, QUICK.bringUp) / book.pace) * (sit.hurry ? 0.5 : 1));   // behind late: pushed up at once
  // An offensive rebound near the rim goes straight back up, as a man at the rim does in the 3D game; now and then he
  // brings it out instead.
  if (begun === 'oreb' && state.missedNear && rand(state) < QUICK.putback) {
    playFor(state, 0.6);
    return { how: 'shot', from: 'putback', look: look(state, h, 'rim', within(r, QUICK.gap.rim), guardOf(state, h)), drive: true, fed: null };
  }
  if (begun === 'dreb' || begun === 'steal') {
    const push = Math.min(0.9, QUICK.push[begun] * book.run * (sit.hurry ? 1.5 : 1));
    if (rand(state) < push && state.gameClock > 3) {
      playFor(state, within(r, QUICK.pushTime), true);
      // On a push the ball goes to whoever is ahead: the rim, or a three for a man who shoots them.
      const runner = mates(state, h).concat(h)[Math.floor(rand(state) * state.size)];
      const jump = jumper(state, runner), zone = isThreeZone(jump) ? 'arc3' : rand(state) < 0.6 ? 'rim' : 'mid';   // a layup, or a pull-up on the way
      return { how: 'shot', from: 'push', look: look(state, runner, zone, within(r, QUICK.gap.push), guardOf(state, runner)), drive: zone === 'rim', fed: runner !== h ? { by: h, how: zone === 'rim' ? 'feed' : 'catch' } : null };
    }
    playFor(state, within(r, QUICK.bringUp) * 0.6 / book.pace);
  }
  if (situation(state, 1 - team).foul) return grab();   // (after an offensive rebound brought out)

  const wait = (styled(state, 'ai.patience')[0] + rand(state) * (styled(state, 'ai.patience')[1] - styled(state, 'ai.patience')[0])) / book.pace;
  let play = null, ran = false, fed = null, beat = 0;
  const star = starOf(state, team);   // once a possession: it is asked for at every pass
  const clutch = sit.clutch && star !== h.person ? state.players.find(p => p.team === team && p.person === star) : null;
  if (clutch) { fed = { by: h, how: 'catch' }; h = clutch; }
  const end = lastShot(state);
  for (;;) {
    beat++;
    const elapsed = CLOCK.shot - state.shotClock, iq = person(state, h).iq;
    // The coach calls a play once the offence is set.
    if (!play && !sit.hurry && elapsed >= styled(state, 'play.startAt') * 0.8) play = callPlay(state, team, h, star);
    const t = Math.min(within(r, QUICK.beat), Math.max(0.5, state.shotClock - 0.5), state.gameClock);
    playFor(state, t);
    if (state.gameClock <= 0 && state.shotClock > 0) {
      // The period is out: a last shot if there is a moment, else nothing.
      return { how: 'shot', look: look(state, h, jumper(state, h), within(r, QUICK.gap.forced), guardOf(state, h)), fed, last: true };
    }
    const early = !sit.hurry && CLOCK.shot - state.shotClock < wait && !ran && end !== '2for1';
    const milking = !sit.hurry && sit.milk && state.shotClock > LATE.milkClock;
    const holding = end === 'hold' && state.gameClock > 5;
    const forced = state.shotClock < AI.panicClock || (sit.hurry && state.shotClock < LATE.hurryClock);
    const d = guardOf(state, h);
    // The looks on offer this beat.
    const pick = play && (play.kind === 'pick' || play.kind === 'pop') && play.ids.handler === h.id && beat <= 3;
    const options = [];
    const keep = keepValue(state) - styled(state, 'decide.stale') * Math.max(0, beat - 2) * 0.5;
    // His own jump shot: a pull-up (a dropping big gives him room), or open on a catch.
    const zone = jumper(state, h);
    const gapRange = fed?.fresh ? QUICK.gap.catch : QUICK.gap.pullUp;
    const pullGap = within(r, gapRange) * attention(state, h, !fed?.fresh) + (pick ? QUICK.scheme[scheme.screen]?.pullUp ?? 0 : 0);
    const own = look(state, h, zone, pullGap, d);
    const open = pullGap >= QUICK.open && person(state, h).ratings[isThreeZone(zone) ? 'three' : 'mid'] >= AI.callAt;
    // A star has the green light (where the style gives it), as in the 3D game.
    const green = styled(state, 'decide.starLight') && overall(person(state, h)) >= STAR_AT && elapsed >= styled(state, 'decide.starFrom');
    const mayNow = !early || open || green || (isThreeZone(zone) && person(state, h).ratings.three >= styled(state, 'decide.earlyThree') && pullGap > styled(state, 'decide.earlyRoom'));
    if ((mayNow || forced) && !milking && !holding && person(state, h).ratings[isThreeZone(zone) ? 'three' : 'mid'] >= styled(state, 'decide.floor'))
      options.push({ key: 'shoot', value: own.ep + leaning(state, h, zone) + (fed?.fresh ? styled(state, 'decide.rhythm') : 0), look: own });
    // A drive, if a lane opens: his speed and handle against his man's defence and speed, and the help behind.
    const edge = ((person(state, h).ratings.speed + person(state, h).ratings.handle) - (person(state, d).ratings.speed + person(state, d).ratings.defence)) / 80;
    const lane = Math.min(QUICK.lane[1], Math.max(QUICK.lane[0], QUICK.laneBase + 2 * styled(state, 'decide.rimBase') + edge - 0.25 * (scheme.help - 0.5) + (pick && scheme.screen === 'switch' ? 0.15 : 0)));
    if ((!early || ran || green) && !milking && !holding && rand(state) < lane) {
      const rim = look(state, h, 'rim', within(r, QUICK.gap.rim), d);
      options.push({ key: 'drive', value: rim.ep + styled(state, 'decide.foulDraw') - 0.1 + styled(state, 'decide.rimBase') + styled(state, 'decide.drive') * (person(state, h).tend.drive - 0.5) + needOf(state, team, 'rim'), look: rim });
    }
    // A post move, for a man who posts up, with his man on his back.
    if ((!early || green) && person(state, h).tend.post >= 0.5 && !milking && !holding) {
      const post = look(state, h, 'mid', within(r, QUICK.gap.post), d, { fading: true, far: QUICK.postFar });
      options.push({ key: 'post', value: post.ep + leaning(state, h, 'close') + 0.08, look: post });   // (leaning: a post move is a two)
    }
    // A pass to each team-mate: what he would make of it on the catch. The play says where the looks are: the roller
    // or the popper on a pick, the big on a post-up, the shooters coming off screens.
    // Not straight back to the man who has just passed it to him (the 3D game's rule: ai.js, planWithBall).
    // And only to a man a pass can reach this beat: a lane clear of defenders, within range (QUICK.passLane).
    if (!forced) for (const m of mates(state, h)) {
      if ((fed?.fresh && fed.by === m) || rand(state) >= QUICK.passLane) continue;
      let mz = jumper(state, m, true), mg = within(r, QUICK.gap.catch) * attention(state, m, false);
      // The roller: at the rim when the roll gets there, otherwise a short pull-up as the help comes.
      if (play && play.ids.big === m.id && play.kind === 'pick') { mz = rand(state) < QUICK.rollsIn ? 'rim' : 'mid'; mg = within(r, QUICK.gap.rim) + (QUICK.scheme[scheme.screen]?.roll ?? 0); }
      if (play && play.ids.big === m.id && play.kind === 'pop') { mz = 'arc3'; mg += 0.4; }
      let mfar = null;
      if (play && play.ids.big === m.id && play.kind === 'post') { mz = 'mid'; mfar = QUICK.postFar; mg = within(r, QUICK.gap.post); }
      if (play && play.kind === 'catch' && m.id !== play.ids.big) mg += 0.35;
      const theirs = look(state, m, mz, Math.max(0.3, mg), guardOf(state, m), { far: mfar });
      const want = play && play.kind === 'post' && play.ids.big === m.id && beat <= 2;
      const value = Math.max(theirs.ep + leaning(state, m, mz), keep) - 0.04 - 0.08 * Math.max(0, 8 - state.shotClock)
        + styled(state, 'decide.pass') * (person(state, h).tend.passFirst - 0.5) + (want ? 0.5 : 0) + (m.person === star ? 0.1 : 0) + starPull(state, person(state, m), m.team);
      options.push({ key: 'pass', value, to: m, look: theirs, feed: mz === 'rim' || mz === 'close' });
    }
    if (!forced) options.push({ key: 'hold', value: keep + (milking || holding ? 0.6 : 0) });
    if (forced && !options.some(o => o.key === 'shoot' || o.key === 'drive' || o.key === 'post')) options.push({ key: 'shoot', value: 0.5, look: look(state, h, jumper(state, h), within(r, QUICK.gap.forced), d) });

    const pickOne = choose(state, lean(state, h, options), iq, 'offence');
    // Losing the ball on the way: a pass picked off or thrown away, a strip on a drive, a fumble, a charge, an
    // illegal screen in the play.
    const tov = turnoverChance(state, pickOne.key, h, d, pick && play);
    if (rand(state) < tov.chance) return { how: 'turnover', by: h, stolenBy: rand(state) < QUICK.turnover.stolen ? d : null, kind: tov.kind };
    // A foul away from the shot: a reach or a block on the ball.
    if (rand(state) < (QUICK.reach / 3) * (styled(state, 'foul.reachFront') / 0.12) * foulShare(state, d)) return { how: 'foul', on: h, by: d };
    if (pick || (play && beat >= 2)) ran = true;   // the offence has been run: its action has come
    switch (pickOne.key) {
      case 'shoot': return { how: 'shot', from: begun === 'oreb' && beat === 1 ? 'oreb' : 'jumper', look: pickOne.look, fed: fed && fed.fresh ? { by: fed.by, how: 'catch' } : fed ? { by: fed.by, how: 'drive' } : null, pick, forced };
      case 'drive': return { how: 'shot', from: begun === 'oreb' && beat === 1 ? 'oreb' : 'drive', look: pickOne.look, drive: true, fed: fed ? { by: fed.by, how: 'drive' } : null };
      case 'post': return { how: 'shot', from: 'post', look: pickOne.look, fed: fed ? { by: fed.by, how: 'post' } : null };
      case 'pass': {
        fed = { by: h, how: pickOne.feed ? 'feed' : 'catch', fresh: true };
        h = pickOne.to;
        // A pass that finds a man at the rim, or a shooter open on the catch, is often shot at once.
        if (pickOne.feed || pickOne.look.gap >= 2.2) {
          const now = choose(state, [{ key: 'shoot', value: pickOne.look.ep + (pickOne.feed ? 0.2 : styled(state, 'decide.rhythm')) }, { key: 'hold', value: keepValue(state) }], person(state, h).iq, 'offence');
          if (now.key === 'shoot') { playFor(state, 0.8); return { how: 'shot', from: pickOne.feed ? 'feed' : 'catch', look: pickOne.look, drive: pickOne.feed, fed: { by: fed.by, how: pickOne.feed ? 'feed' : 'catch' } }; }
        }
        break;
      }
      default: if (fed) fed.fresh = false;
    }
    if (pickOne.key !== 'pass' && fed) fed.fresh = false;
    if (state.shotClock <= 0) return { how: 'turnover', by: null, kind: 'shotClock' };
  }
}

// A beat's chance of losing the ball, by what he chose: a pass (more for a poor decision-maker, against a defence that
// gambles, the style's interceptions), a drive (his handle against the man on him, the style's steals and charges),
// keeping it, a fumbled catch, an illegal screen in a pick. And what kind of loss it would be.
function turnoverChance(state, key, h, d, pick) {
  const me = person(state, h), him = person(state, d);
  const security = (styled(state, 'steal.front') / 0.25 + styled(state, 'pass.intercept') / 0.4) / 2;
  const hands = (1.3 - sharpness(state, me.iq, 'offence')) * (1 + ((him.ratings.defence - me.ratings.handle) / 100)) * (0.5 + him.tend.gamble);
  let chance = (key === 'pass' ? QUICK.turnover.pass : key === 'drive' ? QUICK.turnover.drive : QUICK.turnover.hold) * hands * security;
  let kind = key === 'pass' ? 'pass' : 'lost';
  if (key === 'drive') chance += 0.02 * styled(state, 'foul.charge') / 0.6;
  if (key === 'pass') chance += styled(state, 'fumble.rate') * 0.5;
  if (pick) chance += styled(state, 'foul.illegalScreen') * 0.15;
  if (key === 'drive' && rand(state) < 0.25) kind = 'charge';
  return { chance, kind };
}

