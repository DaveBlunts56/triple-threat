// The advanced stats, worked out from box-score lines alone (see stats.js), so that both engines' games read the same.
// Nothing here changes a match. `line` is a player's or a team's line (a team's from teamLine, which includes its own
// turnovers); minutes are in seconds where a name says `secs`.

const per = (a, b) => (b ? a / b : 0);

// A player's or a team's plays: shots tried, trips to the line (0.44 of a free throw each), and turnovers.
export const playsOf = line => line.fga + 0.44 * line.fta + line.tov;

// The box-score estimate of a team's possessions, from its own line.
export const possessionEstimate = line => line.fga - line.orb + line.tov + 0.44 * line.fta;

// Possessions per 48 minutes, from possessions in `secs` seconds of game clock.
export const pace = (possessions, secs) => per(possessions * 48 * 60, secs);

// Points per 100 possessions.
export const rating = (points, possessions) => per(100 * points, possessions);

// Effective field-goal share: a three counts half again.
export const efg = line => per(line.fgm + 0.5 * line.tpm, line.fga);

// True shooting share: points over twice the shots, free-throw trips counted at 0.44.
export const ts = line => per(line.pts, 2 * (line.fga + 0.44 * line.fta));

// USG%, the standard usage rate: the share of his team's plays he ended while he was on the court. A rate while on the
// court: a team's players' rates do not add up to 100, and their mean weighted by minutes is 20 (less the team's own
// turnovers, which no player ends). `secs`: his seconds on court; `teamSecs`: the team's player-seconds (five times
// the game).
export const usg = (line, secs, team, teamSecs) => per(100 * playsOf(line) * (teamSecs / 5), secs * playsOf(team));

// Play share: his share of all his team's plays, the team's own turnovers among them. A team's players' shares and its
// own turnovers' share add up to 1.
export const playShare = (line, team) => per(playsOf(line), playsOf(team));

// The share of his team's baskets, while he was on, that he assisted (an estimate from the lines, as usual).
export const astPct = (line, secs, team, teamSecs) => per(line.ast, (secs / (teamSecs / 5)) * team.fgm - line.fgm);

// Turnovers per 100 plays.
export const tovPct = line => per(100 * line.tov, playsOf(line));

// The share of the rebounds of his team's misses that his team took, and of the other team's misses.
export const orbPct = (team, opp) => per(team.orb, team.orb + (opp.reb - opp.orb));
export const drbPct = (team, opp) => per(team.reb - team.orb, (team.reb - team.orb) + opp.orb);

// Free throws tried per shot from the floor, and threes tried per shot from the floor.
export const ftRate = line => per(line.fta, line.fga);
export const threeRate = line => per(line.tpa, line.fga);
