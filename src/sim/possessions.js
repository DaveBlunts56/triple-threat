// Counting possessions where they end, the same way in every engine. A team's possession ends when the ball passes to
// the other team (after a basket and any free throw it earns, a defensive rebound, a turnover of any kind) or when a
// period ends with it still theirs. An offensive rebound does not start a new one, and neither does a foul on the
// defence that leaves the ball where it was. Nothing here changes the match: it only counts.
//
// state.owner: the team whose possession is open, or null (before the tip, between periods). state.lastEnded: the
// possession that ended last, in case the ball goes straight back. state.possessions:
// each team's count. state.lengths: each team's [seconds of game clock its possessions used, how many].

// `team` now has the ball. Ends the other team's possession if it was theirs, and opens this one.
// A ball that goes straight back, in the step it was taken (a missed shot that was fouled, picked up by the defence as
// the whistle goes): the possession just ended carries on, and the one just begun never was.
export function handOver(state, team) {
  if (state.owner === team) return;
  const back = state.lastEnded;
  if (state.owner !== null && back?.team === team && back.at === state.gameClock && back.quarter === state.quarter
    && state.ownerClock === state.gameClock && state.ownerQuarter === state.quarter) {
    if (back.counted) { state.possessions[team]--; state.lengths[team][0] -= back.used; state.lengths[team][1]--; }
    state.owner = team; state.ownerClock = back.startClock; state.ownerQuarter = back.quarter; state.ownerScore = back.score;
    const c = state.coach?.[team];
    if (back.remembered) { const m = c.memory[back.kind]; m[0] -= back.points; m[1]--; c.pppAll = undefined; }
    if (c && back.kind !== 'none' && back.kind !== 'transition') c.kind = back.kind;
    state.lastEnded = null;
    return;
  }
  if (state.owner !== null) endPossession(state);
  beginPossession(state, team);
}

export function beginPossession(state, team) {
  state.owner = team; state.ownerClock = state.gameClock; state.ownerQuarter = state.quarter; state.ownerScore = state.score[team];
}

// Ends the open possession, if any. One begun with no time left on the clock (a basket at the buzzer hands the ball
// over as the period ends) is not a possession: nobody could do anything with it.
export function endPossession(state) {
  const team = state.owner;
  if (team === null) return;
  state.owner = null;
  const used = state.ownerQuarter === state.quarter ? state.ownerClock - state.gameClock : state.ownerClock;
  const counted = state.ownerClock > 0, points = state.score[team] - (state.ownerScore ?? state.score[team]);
  // What the possession was, for the coach's memory: the play it ran, or a quick one with none, or neither.
  const c = state.coach?.[team], kind = c?.kind ?? (used < 8 ? 'transition' : 'none');
  state.lastEnded = { team, at: state.gameClock, quarter: state.quarter, startClock: state.ownerClock, used, counted, score: state.ownerScore, points, kind,
    remembered: counted && !!c };
  if (c) c.kind = null;
  if (!counted) return;
  state.possessions[team]++;
  state.lengths[team][0] += used; state.lengths[team][1]++;
  if (c) { const m = (c.memory[kind] ??= [0, 0]); m[0] += points; m[1]++; c.pppAll = undefined; }
}
