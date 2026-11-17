// The fast engine: a whole match, possession by possession, on a match state from createMatch, by the same rules,
// coach, decision maker, shot model and box score as the 3D game. Nothing is moved on a court: each possession is
// played as beats (possession.js), and what happens comes from the shared models (outcomes.js). A seed gives the same
// game every time. See the spec, section 10.
import { CLOCK, TIP } from '../tuning.js';
import { feelSteal, settle } from '../mood.js';
import { createMatch, personOf, rand, setLength } from '../state.js';
import { setStyle, styled } from '../styles.js';
import { recordFoul } from '../fouls.js';
import { note } from '../stats.js';
import { applySubs } from '../roster.js';
import { ownMen } from '../matchups.js';
import { adjust, coachKindOf } from '../coach.js';
import { wantsTimeout } from '../late.js';
import { beginPossession, endPossession, handOver } from '../possessions.js';
import { formOf } from '../shooting.js';
import { QUICK } from './shapes.js';
import { freeThrows, rebound, shoot } from './outcomes.js';
import { assistShare, stealer } from './who.js';
import { playPossession } from './possession.js';

// A finished match: `seed`, `size` a side, quarters of `minutes`, in `style` with its `sliders`, between `teams`.
// `watch`: as simulate's.
export function quickMatch({ seed = 1, size = 5, minutes = 12, style = 'sim', sliders, teams = [0, 1], watch = null } = {}) {
  const state = createMatch(seed, size, teams);
  setLength(state, minutes);
  setStyle(state, style, sliders);
  state.humans = [];
  return simulate(state, watch);
}

// Plays a match that has not started (its style already set) to the end, and returns it. `watch`, for whoever wants
// to look on (the tests): called (state, 'start', { team, begun }) as each possession begins, (state, 'end', { team,
// begun, ended, next }) once it is finished and any stoppage made, and (state, 'period') as each period ends.
export function simulate(state, watch = null) {
  const sd = styled(state, 'form.sd');
  for (const person of state.rosters.flat()) person.form = formOf(() => rand(state), sd);
  Object.assign(state, { quarter: 1, score: [0, 0], byQuarter: [[], []], phase: 'live', time: 0 });
  state.timeouts = [styled(state, 'timeout.each'), styled(state, 'timeout.each')];
  // The tip: each side's jumper, the better rebounder winning a little more often.
  const jumper = team => personOf(state, state.players.find(p => p.team === team && p.slot === TIP.slot[state.size]));
  state.tipWinner = rand(state) < 0.5 + (jumper(0).ratings.rebound - jumper(1).ratings.rebound) / 200 ? 0 : 1;
  for (;;) {
    period(state, watch);
    if (state.quarter >= CLOCK.quarters && state.score[0] !== state.score[1]) break;
    state.quarter++;
  }
  state.phase = 'final';
  return state;
}

// One period, from its start to its last possession.
function period(state, watch) {
  const share = styled(state, 'rules.overtimeShare');
  state.gameClock = state.quarter <= CLOCK.quarters ? state.quarterLength : share > 0 ? state.quarterLength * share : CLOCK.overtime;
  state.shotClock = CLOCK.shot;
  if (state.quarter <= CLOCK.quarters) state.teamFouls = [0, 0];
  state.lateFouls = [0, 0];
  const winner = state.tipWinner;
  let team = state.quarter === 1 ? winner : state.quarter % 2 === 1 ? winner : 1 - winner;
  ownMen(state);
  beginPossession(state, team);
  let begun = 'inbound';
  while (state.gameClock > 0) {
    if (begun !== 'oreb' && begun !== 'side') { handOver(state, team); state.shotClock = CLOCK.shot; }
    if (begun !== 'oreb') state.ball.holder = null;
    state.possession = team;
    watch?.(state, 'start', { team, begun });
    const ended = playPossession(state, team, begun);
    const next = finish(state, team, ended);
    if (next.stoppage) stoppage(state, next.team);
    watch?.(state, 'end', { team, begun, ended, next });
    team = next.team; begun = next.begun;
    if (next.shotClock !== undefined) state.shotClock = next.shotClock;
  }
  endPossession(state);
  watch?.(state, 'period');
  state.stoppages++;
  state.phase = 'quarterEnd';
  applySubs(state);
  state.phase = 'live';
}

// Play stops: each coach looks at his defence, may call a timeout, and makes his substitutions; everyone is matched
// up again. `team` will have the ball.
function stoppage(state, team) {
  state.stoppages++;
  state.phase = 'dead'; state.possession = team; state.freeThrow = null;
  adjust(state, 0); adjust(state, 1);
  for (const side of [0, 1]) {
    if (state.timeouts[side] > 0 && wantsTimeout(state, side, coachKindOf(state, side).timeouts)) {
      state.timeouts[side]--; state.lastTimeout = state.time; state.ato = team; settle(state);
      for (const person of state.rosters.flat()) person.energy = Math.min(1, person.energy + styled(state, 'timeout.rest'));
    }
  }
  applySubs(state);
  ownMen(state);
  state.phase = 'live';
}

// What a possession's end leads to: { team, begun, stoppage, shotClock? } for the next. begun 'side': the same team
// keeps the ball after a whistle, inbounding where play stopped, with the shot clock it is given (or as it was).
function finish(state, team, ended) {
  const other = 1 - team;
  if (ended.how === 'turnover') {
    if (ended.kind === 'shotClock' || !ended.by) { state.teamStats[team].tov++; return { team: other, begun: 'inbound', stoppage: true }; }
    note(state, ended.by, 'tov');
    if (ended.kind === 'charge') { recordFoul(state, { kind: 'charge', by: ended.by.id, on: (state.players.find(o => o.man === ended.by.id) ?? state.players.find(o => o.team !== team)).id }); return { team: other, begun: 'inbound', stoppage: true }; }
    if (ended.stolenBy) { const thief = stealer(state, ended.stolenBy); note(state, thief, 'stl'); feelSteal(state, thief, ended.by); return { team: other, begun: 'steal', stoppage: false }; }
    return { team: other, begun: 'inbound', stoppage: true };
  }
  if (ended.how === 'foul') {
    const given = recordFoul(state, { kind: 'reach', by: ended.by.id, on: ended.on.id });
    if (given.shots) return afterFreeThrows(state, team, ended.on, given.shots, 'mid');
    return { team, begun: 'side', stoppage: true, shotClock: Math.max(state.shotClock, CLOCK.shotAfterFoul) };
  }
  // A shot. (Where it came from and where it was taken, for whoever watches.)
  const from = ((state.shotFrom ??= [{}, {}])[team][`${ended.from ?? 'other'} ${ended.look.zone}`] ??= 0);
  state.shotFrom[team][`${ended.from ?? 'other'} ${ended.look.zone}`] = from + 1;
  const { look } = ended, shooter = look.shooter, result = shoot(state, look, { drive: !!ended.drive, post: ended.from === 'post' });
  if (result.result === 'made' && ended.fed && rand(state) < QUICK.assist[ended.fed.how] * assistShare(state, ended.fed.by)) note(state, ended.fed.by, 'ast');
  if (result.fouled) {
    // A fouled shot that missed is not a field-goal attempt (the rules' count): the attempt shoot() noted is taken back.
    if (result.result !== 'made') { note(state, shooter, 'fga', -1); if (look.value === 3) note(state, shooter, 'tpa', -1); }
    recordFoul(state, { kind: 'shooting', by: result.by.id, on: shooter.id });
    return afterFreeThrows(state, team, shooter, result.result === 'made' ? 1 : look.value, look.zone);
  }
  if (result.result === 'made') return { team: other, begun: 'inbound', stoppage: true };
  return afterMiss(state, team, look.zone, result.result === 'blocked');
}

// A miss: who rebounds it, and a loose-ball foul in the scramble now and then.
function afterMiss(state, team, zone, blocked, after = 'shot') {
  // Out of bounds untouched: nobody's rebound. Off the rim it is the defence's ball; knocked out by a block, the
  // offence keeps it, with the shot clock as it was.
  if (rand(state) < QUICK.out * (blocked ? 2 : 1)) {
    state.missedNear = false;
    return blocked ? { team, begun: 'side', stoppage: true } : { team: 1 - team, begun: 'inbound', stoppage: true };
  }
  const board = rebound(state, team, blocked ? 'mid' : zone, after);
  state.missedNear = !blocked && after === 'shot' && (zone === 'rim' || zone === 'close');
  if (rand(state) < QUICK.looseBall * styled(state, 'foul.looseBall') / 0.02) {
    // On the side that did not come down with it.
    const fouler = state.players.filter(p => p.team !== board.who.team)[Math.floor(rand(state) * state.size)];
    const given = recordFoul(state, { kind: 'looseBall', by: fouler.id, on: board.who.id });
    if (given.shots) return afterFreeThrows(state, board.who.team, board.who, given.shots, 'mid');
    return board.who.team === team ? { team, begun: 'side', stoppage: true, shotClock: Math.max(styled(state, 'rules.orebClock'), CLOCK.shotAfterFoul) }
      : { team: board.who.team, begun: 'inbound', stoppage: true };
  }
  if (board.offensive) { state.ball.holder = board.who.id; return { team, begun: 'oreb', stoppage: false, shotClock: styled(state, 'rules.orebClock') }; }
  return { team: 1 - team, begun: 'dreb', stoppage: false };
}

// Free throws for `shooter` of `team`: the next possession after them.
function afterFreeThrows(state, team, shooter, shots, zone) {
  stoppage(state, team);   // the whistle: substitutions and timeouts before the shots
  const ft = freeThrows(state, shooter, shots);
  if (!ft.lastMissed) return { team: 1 - team, begun: 'inbound', stoppage: false };   // the whistle was before the shots
  return afterMiss(state, team, zone, false, 'ft');
}

