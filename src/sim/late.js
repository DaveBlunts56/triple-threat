// What the score and the clock ask of a team: the end of a period, the end of a close game, a team on a run.
import { CLOCK, LATE, TIMEOUT } from './tuning.js';
import { attackSign, onFloor, personOf } from './state.js';

// How things stand for `team`. lead: its points ahead (behind if negative). clock: the seconds it has to shoot in,
// by the shot clock or the period's, whichever is less. hustle: the last minute of a close game: everyone sprints.
// hurry: behind late: shoot early, and wait for no play. milk: ahead late: use the clock. press: behind late and
// within reach: pick up all over the court, and tight. foul: behind, within reach, and the other team could run the
// clock out: foul the ball to stop it. clutch: the game is on the line: the ball goes to the star.
export function situation(state, team) {
  const lead = state.score[team] - state.score[1 - team], left = state.gameClock;
  const last = state.quarter >= CLOCK.quarters, near = Math.abs(lead) <= LATE.close;
  const late = last && left <= LATE.hurry;
  return {
    lead, clock: Math.min(state.shotClock, left),
    hustle: last && left <= LATE.closing && near,
    hurry: late && lead < 0,
    milk: late && lead > 0,
    press: late && lead < 0 && near,
    foul: last && lead < 0 && near && left <= LATE.foulUnder && left > LATE.foulOver,
    clutch: last && left <= LATE.clutch && Math.abs(lead) <= LATE.clutchLead,
  };
}

// Whether `team`'s coach wants a timeout now: the other team is on a run, or his five are tired, and he has the ball
// (in his own half, so that nothing good is stopped) or play is stopped with the ball his.
export function wantsTimeout(state, team) {
  if (state.timeouts[team] <= 0 || state.time - state.lastTimeout < TIMEOUT.apart) return false;
  const holder = state.players[state.ball.holder];
  const mine = state.phase === 'dead' ? state.possession === team && !state.freeThrow
    : state.phase === 'live' && holder?.team === team && !holder.shooting && onFloor(holder) && attackSign(team) * holder.x < 0;
  if (!mine) return false;
  const five = state.players.filter(p => p.team === team);
  const energy = five.reduce((sum, p) => sum + personOf(state, p).energy, 0) / five.length;
  return state.run[1 - team] >= LATE.run || energy < LATE.tired;
}
