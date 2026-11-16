// The box score: what each player has done in the match, kept on his roster entry so that it stays with him on the
// bench. Nothing here decides anything: the rules write it and the page reads it.
// reb is every rebound; orb those of his own team's misses (the rest, reb - orb, are defensive). A person's seconds on
// the court (secs) and his plus-minus (pm) are kept beside his line, not in it.
export const STAT_KEYS = Object.freeze(['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'reb', 'ast', 'stl', 'blk', 'tov', 'orb']);

export const emptyLine = () => Object.fromEntries(STAT_KEYS.map(key => [key, 0]));

// Adds `n` of `key` to the line of the person in `row` of `team`'s roster.
export function noteRow(state, team, row, key, n = 1) {
  state.rosters[team][row].stats[key] += n;
}

// The same, for the person a court player is now.
export const note = (state, player, key, n = 1) => noteRow(state, player.team, player.person, key, n);

// A team's line: the sum of its eight, with the turnovers that are nobody's (a shot-clock violation) added.
export function teamLine(state, team) {
  const line = emptyLine();
  for (const person of state.rosters[team]) for (const key of STAT_KEYS) line[key] += person.stats[key];
  line.tov += state.teamStats[team].tov;
  return line;
}

// One number for a line, for the player of the game: points and what else he did, less what he wasted.
export const gameScore = line => line.pts + 0.4 * line.fgm - 0.7 * line.fga - 0.4 * (line.fta - line.ftm) + 0.7 * line.reb + 0.7 * line.ast
  + line.stl + 0.7 * line.blk - line.tov;

// The player of the game: { team, row } of the best line. Level lines go to the team ahead, then to the lower row.
export function playerOfGame(state) {
  const ahead = state.score[1] > state.score[0] ? 1 : 0;
  let best = null;
  for (const team of [ahead, 1 - ahead]) state.rosters[team].forEach((person, row) => {
    const score = gameScore(person.stats);
    if (!best || score > best.score) best = { team, row, score };
  });
  return { team: best.team, row: best.row };
}
