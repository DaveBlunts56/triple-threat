// Offensive plays: where the team with the ball goes, moment by moment, while a play is on. A play is called by the
// coach (the computer, for either team) or by you from the play list; the computer's players and your team-mates
// run it. The rules never read a play: it only says where players should go.
import { AI, CLOCK, FOUL, PLAY, RIM } from './tuning.js';
import { attackSign, onFloor, personOf, rand } from './state.js';
import { guardOf } from './matchups.js';
import { styled } from './styles.js';
import { rated, starOf, heatOf } from './ratings.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// The ratings from which a play suits a player: a post scorer's inside, a sharpshooter's three, a handler's handle,
// and the three of a big who can pop.
const SUIT = Object.freeze({ post: 80, shooter: 85, handle: 80, pop: 75 });

// Each play: its name, a line for the player on what to do, the sizes of match it suits, how long it runs at most,
// `ripe` (when the handler may shoot from outside or pass: the seconds into the play, or 'used' for once the screen
// has been used; until then he keeps the ball so that the play can form), `screener` (the part that sets a screen on
// the ball, if one does), and `spots(c)`: where each part should be
// now, as { part: spot }; `ball` is where whoever holds the ball should take it when he has nothing better to do.
// The parts are handler (who held the ball when the play was called), big, big2, wing and shooter. `c` is the
// play's context: see context() below. Distances are along the court from the centre line toward the hoop
// attacked (the hoop is at 12.4, the baseline at 14) and across it toward the play's side.
export const PLAYS = Object.freeze({
  pickRoll: {
    name: 'Pick & Roll', hint: 'Use the screen, then hit the roller or score', sizes: [3, 5], long: 8, ripe: 'used', screener: 'big',
    spots: c => ({
      big: !c.used ? c.screen() : c.sinceUsed < PLAY.roll ? c.at(11, 0.5, true) : c.at(11.3, -3.2),
      big2: c.at(7.5, -5.5), wing: c.five ? c.at(11.6, -6.95) : c.at(7.5, -5.5), shooter: c.at(11.6, 6.95),
      ball: c.used ? c.at(10.8, 1) : c.set ? c.past() : c.at(5.4, -0.6),
    }),
  },
  pickPop: {
    name: 'Pick & Pop', hint: 'Use the screen, then find the big at the arc', sizes: [3, 5], long: 8, ripe: 'used', screener: 'big',
    spots: c => ({
      big: !c.used ? c.screen() : c.at(6, -2.2),
      big2: c.at(11.3, -3.2), wing: c.five ? c.at(11.6, -6.95) : c.at(7.5, -5.5), shooter: c.at(11.6, 6.95),
      ball: c.used ? c.at(10.8, 1) : c.set ? c.past() : c.at(5.4, -0.6),
    }),
  },
  iso: {
    name: 'Clear Out', hint: 'Everyone clears: take your man one on one', sizes: [3, 5], long: 7, ripe: 1,
    spots: c => ({
      big: c.five ? c.at(11.3, -3.2) : c.at(11.6, -6.95), big2: c.at(7.5, -5.5), wing: c.five ? c.at(11.6, -6.95) : c.at(7.5, -5.5),
      shooter: c.at(11.6, 6.95),
      ball: c.t < 1 ? c.at(6.5, 2) : c.at(10.8, 1.2),
    }),
  },
  horns: {
    name: 'Horns', hint: 'Bigs at the elbows: use the screen on your side', sizes: [5], long: 9, ripe: 'used', screener: 'big',
    spots: c => ({
      big: c.t < 1.6 ? c.at(8, 2.6) : !c.used ? c.screen() : c.sinceUsed < PLAY.roll ? c.at(11, 0.5, true) : c.at(11.3, 3.2),
      big2: c.used ? c.at(5.6, -1.5) : c.at(8, -2.6),
      wing: c.at(11.6, -6.95), shooter: c.at(11.6, 6.95),
      ball: c.used ? c.at(10.8, 1) : c.set ? c.past() : c.at(5.2, 0),
    }),
  },
  fiveOut: {
    name: '5-Out Motion', hint: 'All five outside: hit the cutter going to the rim', sizes: [5], long: 10, ripe: 1,
    spots(c) {
      // A turn lasts PLAY.cut seconds, on one side then the other: the wing there cuts to the rim and out to the
      // corner, and the corner man lifts to the wing. So the two have changed places by the next turn on that side.
      const turn = Math.floor(c.t / PLAY.cut), into = c.t - turn * PLAY.cut, near = turn % 2 === 0;
      const side = (pair, mine, done) => {
        const [wing, corner] = done % 2 === 0 ? pair : [pair[1], pair[0]], s = mine ? 1 : -1, live = near === mine;
        return {
          [wing]: !live || into < 0.8 ? c.at(7.2, 5.8 * s) : into < 2.3 ? c.at(11, 0.6 * s, true) : c.at(11.6, 6.95 * s),
          [corner]: !live || into < 0.8 ? c.at(11.6, 6.95 * s) : c.at(7.2, 5.8 * s),
        };
      };
      return { ...side(['shooter', 'big'], true, Math.ceil(turn / 2)), ...side(['wing', 'big2'], false, Math.floor(turn / 2)), ball: c.at(5.2, 0) };
    },
  },
  postUp: {
    name: 'Post Up', hint: 'Feed the big on the block', sizes: [3, 5], long: 9, ripe: 2,
    target: c => (c.holds('big') ? null : 'big'),
    spots: c => ({
      big: c.at(11, 3.2), big2: c.at(8.2, -2.7), wing: c.at(7.5, -5.5), shooter: c.five ? c.at(5.4, -0.5) : c.at(5.6, -1.5),
      handler: c.at(6.4, 2.4),
      ball: c.holds('big') ? c.at(11.7, 1.3) : c.at(6.4, 2.4),   // fed from the slot, where the pass goes clear of the handler's defender
    }),
  },
  floppy: {
    name: 'Floppy', hint: 'Shooters come off the screens: hit the open one', sizes: [5], long: 7, ripe: 2.4,
    spots: c => ({
      big: c.at(9.8, 3.4), big2: c.at(9.8, -3.4),
      shooter: c.t < 1.4 ? c.at(12, 0.9) : c.at(7.3, 5.6, c.t < 3),
      wing: c.t < 1.4 ? c.at(12, -0.9) : c.at(7.3, -5.6, c.t < 3),
      ball: c.at(5.2, 0),
    }),
  },
  spain: {
    name: 'Spain Pick & Roll', hint: 'Pick and roll with a back screen for the roller', sizes: [5], long: 8, ripe: 'used', screener: 'big',
    spots: c => ({
      big: !c.used ? c.screen() : c.sinceUsed < PLAY.roll ? c.at(11, 0.5, true) : c.at(11.3, -3.2),
      shooter: !c.used ? c.at(7.6, -0.4) : c.sinceUsed < 1.2 ? c.backScreen('big') : c.at(5.6, -1.2),
      big2: c.at(11.6, -6.95), wing: c.at(11.6, 6.95),
      ball: c.used ? c.at(10.8, 1) : c.set ? c.past() : c.at(5.4, -0.6),
    }),
  },
  giveGo: {
    name: 'Give & Go', hint: 'Pass to the wing, then look for the cutter', sizes: [3, 5], long: 7, ripe: 0.6,
    target: c => (!c.passed ? (c.five ? 'shooter' : 'wing') : c.sincePass > 0.5 && c.sincePass < 2 ? 'handler' : null),
    spots: c => ({
      [c.five ? 'shooter' : 'wing']: c.at(7.2, 4.8),
      big: c.five ? c.at(11.3, -3.2) : c.at(11.6, -6.95), big2: c.at(7.5, -5.5), ...(c.five ? { wing: c.at(11.6, -6.95) } : {}),
      handler: c.passed && c.sincePass < 2 ? c.at(11, 0.6, true) : c.at(11.6, 6.95),
      ball: c.at(5.6, 1.2),
    }),
  },
  ucla: {
    name: 'UCLA Cut', hint: 'Pass to the wing: the cutter rubs off the high post', sizes: [5], long: 9, ripe: 0.8,
    target: c => (!c.passed ? 'shooter' : c.sincePass > 0.6 && c.sincePass < 2.2 ? 'handler' : null),
    spots: c => ({
      big: c.passed && c.sincePass > 1.5 ? c.screen() : c.at(8, 2.7),
      shooter: c.at(7.5, 5.5), wing: c.at(7.5, -5.5), big2: c.at(11, -3.2),
      handler: c.at(11, 3.1, c.passed && c.sincePass < 1.5),
      ball: c.at(5.4, 0.8),
    }),
  },
});

// The plays a match of `size` a side can run, in the play list's order.
export const playsFor = size => Object.keys(PLAYS).filter(key => PLAYS[key].sizes.includes(size));

// What a play's spots are worked out from. t: seconds since it was called. five: a five-a-side match.
// at(along, across, sprint): a spot on the court. set: the screener stands set beside the ball handler's defender.
// used, sinceUsed: the handler has gone past the screen, and for how long. passed, sincePass: the ball has left
// the handler for a team-mate, and for how long. holds(part): that part has the ball now.
function context(state, play) {
  const sign = attackSign(play.team), S = play.side, hoop = { x: sign * RIM.x, z: 0 };
  const who = part => state.players[play.ids[part]];
  const holder = state.players[state.ball.holder] ?? who('handler');
  // Beside the defender of `on`, across his way: u points from `on` to the hoop, v across it toward the play's side.
  const beside = on => {
    const far = dist(on, hoop) || 1, u = { x: (hoop.x - on.x) / far, z: (hoop.z - on.z) / far };
    let v = { x: -u.z, z: u.x };
    if ((Math.abs(v.z) > 0.2 ? v.z * S : -v.x * sign * S) < 0) v = { x: -v.x, z: -v.z };
    return { u, v, d: guardOf(state, on) };
  };
  const c = {
    state, t: play.t, five: state.size === 5,
    at: (along, across, sprint = false) => ({ x: sign * along, z: across * S, sprint }),
    set: play.setAt !== null, used: play.usedAt !== null, sinceUsed: play.t - (play.usedAt ?? play.t),
    passed: play.passAt !== null, sincePass: play.t - (play.passAt ?? play.t),
    holds: part => holder === who(part),
    // Where the screener stands: beside the defender of whoever has the ball, on the play's side.
    screen() { const { u, v, d } = beside(holder); return { x: d.x + v.x * PLAY.screenGap - u.x * 0.1, z: d.z + v.z * PLAY.screenGap - u.z * 0.1, sprint: true }; },
    // Where the handler goes to use the screen: round the outside of the man setting it, never through him. First
    // across, until he is wide of the screener's outside shoulder; then past him; then on toward the hoop.
    past() {
      const { u, v } = beside(holder), part = PLAYS[play.key].screener, spot = c.screen();
      const man = part && who(part) && dist(who(part), spot) < PLAY.setDist ? who(part) : spot;   // the screener himself, if he is where the screen is
      const level = (holder.x - man.x) * u.x + (holder.z - man.z) * u.z;   // how far past the screener he is, toward the hoop
      const out = (holder.x - man.x) * v.x + (holder.z - man.z) * v.z;     // how far wide of him, on the play's side
      const [on, wide] = level >= PLAY.roundBy ? [1.8, 0.8] : out < PLAY.roundGap - 0.15 ? [level, PLAY.roundGap] : [PLAY.roundBy + 0.2, PLAY.roundGap];
      return { x: man.x + v.x * wide + u.x * on, z: man.z + v.z * wide + u.z * on };
    },
    // A screen set behind the defender of `part`, on his way back to the hoop.
    backScreen(part) { const { u, d } = beside(who(part)); return { x: d.x + u.x * PLAY.screenGap, z: d.z + u.z * PLAY.screenGap, sprint: true }; },
  };
  return c;
}

// Gives the play's parts to the team's players on the court, by what each is good at: the handler has the ball; of
// the rest the best inside (inside and rebound together) is the big and the next is big2; of those left the better
// three-point shooter is the shooter and the other the wing. Three a side has a big and a wing.
function cast(state, holder) {
  const r = (p, key) => rated(state, p, key), inside = p => r(p, 'inside') + r(p, 'rebound');
  const rest = state.players.filter(p => p.team === holder.team && p !== holder).sort((a, b) => inside(b) - inside(a) || a.slot - b.slot);
  const ids = { handler: holder.id, big: rest[0].id };
  if (rest.length === 2) { ids.wing = rest[1].id; return ids; }
  const [shooter, wing] = rest.slice(2).sort((a, b) => r(b, 'three') - r(a, 'three') || a.slot - b.slot);
  return { ...ids, big2: rest[1].id, wing: wing.id, shooter: shooter.id };
}

// How well a play suits who is on the floor for `team`, as a weight for the coach's pick: a post-up wants a post
// scorer, Floppy a sharpshooter, a clear-out the star or a hot hand, the pick and rolls a handler, a pick and pop a
// big who can shoot. 1 is a play like any other.
export function suits(state, team, key) {
  const holder = state.players[state.ball.holder];
  if (!holder || holder.team !== team) return 1;
  const ids = cast(state, holder), r = (id, k) => rated(state, state.players[id], k);
  const pick = r(holder.id, 'handle') >= SUIT.handle ? 2 : 1;
  switch (key) {
    case 'postUp': return r(ids.big, 'inside') >= SUIT.post ? 3 : 0.5;
    case 'floppy': return r(ids.shooter, 'three') >= SUIT.shooter ? 3 : 0.5;
    case 'iso': return starOf(state, team) === holder.person || heatOf(personOf(state, holder)) === 'hot' ? 3 : 1;
    case 'pickPop': return pick * (r(ids.big, 'three') >= SUIT.pop ? 2 : 0.3);
    case 'pickRoll': case 'spain': case 'horns': return pick;
    default: return 1;
  }
}

// Whether `team` can start a play now: it has the ball in live play in its front court, with time to run one.
function ready(state, team) {
  const holder = state.players[state.ball.holder];
  return state.phase === 'live' && holder?.team === team && !holder.inbounder && !holder.shooting && onFloor(holder)
    && attackSign(team) * holder.x > PLAY.startX && Math.min(state.shotClock, state.gameClock) > PLAY.minClock;
}

function start(state, team, key) {
  const holder = state.players[state.ball.holder];
  const side = Math.abs(holder.z) > 1 ? Math.sign(holder.z) : rand(state) < 0.5 ? 1 : -1;
  state.plays[team] = { key, team, t: 0, side, ids: cast(state, holder), setAt: null, usedAt: null, passAt: null };
}

// Asks for a play for `team`: it starts as soon as the team can run it, in place of any play then on. Returns
// whether the match has that play.
export function callPlay(state, team, key) {
  if (!playsFor(state.size).includes(key)) return false;
  state.playCall[team] = key;
  return true;
}

// Moves the plays on by dt: ends one that is over, notes when its screen is set and used and when the ball is
// passed on, and starts the next: the one asked for, or after a moment one the coach picks.
export function stepPlays(state, dt) {
  const holder = state.players[state.ball.holder];
  for (const team of [0, 1]) {
    const play = state.plays[team];
    const has = state.phase === 'live' && (holder ? holder.team === team : state.ball.mode === 'pass' && state.lastTouch === team);
    if (play) {
      play.t += dt;
      const over = !has || play.t > PLAYS[play.key].long || state.shotClock < AI.panicClock || holder?.shooting;
      if (over || (state.playCall[team] && ready(state, team))) { state.plays[team] = null; state.playWait[team] = over ? PLAY.wait : 0; }
      else {
        if (holder && holder.id !== play.ids.handler) play.passAt ??= play.t;
        const part = PLAYS[play.key].screener, screener = part && state.players[play.ids[part]];
        if (screener && holder && screener !== holder) {
          const c = context(state, play), sign = attackSign(team);
          if (play.setAt === null && dist(screener, c.screen()) < PLAY.setDist && screener.setT >= FOUL.setTime) play.setAt = play.t;
          if (play.setAt !== null && play.usedAt === null && (sign * holder.x > sign * screener.x + 0.3 || play.t - play.setAt > PLAY.useBy)) play.usedAt = play.t;
        }
        continue;
      }
    }
    state.playWait[team] = Math.max(0, state.playWait[team] - dt);
    if (!ready(state, team)) continue;
    const list = playsFor(state.size);
    let key = state.playCall[team];
    // The coach lets the ball be walked up and the offence set before he calls anything; a play you ask for starts at once.
    if (!key && state.playWait[team] <= 0 && CLOCK.shot - state.shotClock >= styled(state, 'play.startAt')) {
      // The coach's pick: any play the match has, the likelier the better it suits who is on the floor.
      const weights = list.map(play => suits(state, team, play));
      let at = rand(state) * weights.reduce((sum, w) => sum + w, 0);
      key = list.find((_, i) => (at -= weights[i]) < 0) ?? list[list.length - 1];
    }
    if (key) { start(state, team, key); state.playCall[team] = null; }
  }
}

// Where the play sends `player` now ({ x, z, sprint }), or null when his team has no play on or it gives him no spot.
export function playSpot(state, player) {
  const play = state.plays[player.team];
  if (!play) return null;
  const part = Object.keys(play.ids).find(name => play.ids[name] === player.id);
  const spots = PLAYS[play.key].spots(context(state, play));
  return (state.ball.holder === player.id ? spots.ball ?? spots[part] : spots[part]) ?? null;
}

// The play `team` is running: { key, name, hint }, or null.
export function playOn(state, team) {
  const play = state.plays[team];
  return play ? { key: play.key, name: PLAYS[play.key].name, hint: PLAYS[play.key].hint } : null;
}

// Whether `player` should keep the ball for now: he is the handler of a play that has not yet formed. He may still
// take it to the rim; he does not shoot from outside or pass until the play is ripe, or has run for PLAY.ripeBy.
export function playHolds(state, player) {
  const play = state.plays[player.team];
  if (!play || play.ids.handler !== player.id || state.ball.holder !== player.id || play.t >= PLAY.ripeBy) return false;
  const { ripe } = PLAYS[play.key];
  return ripe === 'used' ? play.usedAt === null : play.t < ripe;
}

// Whether `team`'s play has done its work: its screen on the ball has been used. The offence has then been run.
export const playRan = (state, team) => (state.plays[team]?.usedAt ?? null) !== null;

// The team-mate the play wants the ball passed to now, or null: the big on the block, the cutter going to the rim.
export function playTarget(state, player) {
  const play = state.plays[player.team], want = play && PLAYS[play.key].target?.(context(state, play));
  const mate = want ? state.players[play.ids[want]] : null;
  return mate && mate !== player ? mate : null;
}
