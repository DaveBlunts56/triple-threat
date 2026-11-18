import { MATCH } from '../sim/tuning.js';
import { TEAMS } from '../sim/teams.js';
import { createMatch, setLength } from '../sim/state.js';
import { setStyle } from '../sim/styles.js';
import { moodOf, playedOf, MOOD } from '../sim/mood.js';
import { emptyLine, STAT_KEYS } from '../sim/stats.js';
import { simulate } from '../sim/quick/engine.js';
import { advanceBracket, clubs, lengths, nextSeed, schedule } from './calendar.js';

import { seedCareers, develop, starters } from './development.js';

function freshSeason(league, year) {
  const seed = nextSeed(league);
  return { year, seed, cursor: 0, fixtures: schedule(seed, league.games), round: 0, series: [], champion: null, stats: {}, postseason: {} };
}

export function createLeague({ name, team, seed, games = 14, minutes = 12, size = 5, bestOf = 3, style = 'sim' }) {
  if (!Object.hasOwn(clubs, team) || !lengths.includes(games) || !MATCH.minutes.includes(minutes) ||
      ![3, 5].includes(size) || ![1, 3, 5, 7].includes(bestOf) || !['sim', 'arcade'].includes(style) ||
      !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || typeof name !== 'string' || !name.trim() || name.trim().length > 60)
    throw new Error('Choose a valid franchise name, seed and setup.');
  const league = { version: 2, name: name.trim(), team, initialSeed: seed, seed, games, minutes, size, bestOf, style, history: [], moods: {}, rivals: {} };
  seedCareers(league);
  league.season = freshSeason(league, 1);
  return league;
}

export function nextSeason(league) {
  if (!league.season.champion) throw new Error('Finish the playoffs first.');
  develop(league);
  league.history.push(league.season);
  league.season = freshSeason(league, league.season.year + 1);
}

export const nextFixture = league => league.season.fixtures[league.season.cursor];
export const involved = (f, team) => f.home === team || f.away === team;


export function fixtureMatch(league, fixture = nextFixture(league)) {
  // The existing controls give the human side zero, including when their team is on the road.
  const keys = fixture.away === league.team ? [fixture.away, fixture.home] : [fixture.home, fixture.away];
  const state = createMatch(fixture.seed, league.size, keys.map(key => {
    const club = clubs[key], staff = league.staff[key];
    return { ...club, coach: staff.coach, playbook: staff.playbook, players: club.players.map((p,i) =>
      ({ ...p, ratings: league.careers[staff.ids[i]].ratings })) };
  }));
  state.ids = keys.map(key => TEAMS.indexOf(clubs[key]));
  keys.forEach((key,side) => {
    const lineup = starters(league, key);
    for (const p of state.players) if (p.team === side) p.person = lineup[p.slot];
  });
  state.home = keys.indexOf(fixture.home);
  state.humans = [];
  setLength(state, league.minutes);
  setStyle(state, league.style);
  const local = {};
  keys.forEach((key, side) => state.rosters[side].forEach((person, row) => {
    const id = league.staff[key].ids[row];
    person.careerId = id;
    local[id] = side + ':' + row;
    if (league.moods[id]) person.mood = { ...league.moods[id], at: 0 };
  }));
  for (const [pair, entry] of Object.entries(league.rivals)) {
    const [a, b] = pair.split('|').map(id => local[id]);
    if (a && b) state.rivals[[a, b].sort().join('|')] = { heat: entry.heat, by: local[entry.by], at: 0 };
  }
  state.fixture = { year: league.season.year, id: fixture.id, seed: fixture.seed };
  return state;
}

// Only a finished box score crosses the boundary from either engine. A quit or retry keeps the fixture pending.
export function gameReport(state) {
  if (state.phase !== 'final') throw new Error('The game is still in progress.');
  const sides = [state.home, 1 - state.home];
  const keyOf = local => {
    const [side, row] = local.split(':').map(Number);
    return state.rosters[side][row].careerId;
  };
  const rivals = Object.entries(state.rivals).map(([pair, e]) => [
    pair.split('|').map(keyOf).sort().join('|'), keyOf(e.by), e.heat * 0.5 ** (Math.max(0, playedOf(state) - e.at) / MOOD.rival.half)
  ]);
  // A ball knocked into the basket without a shooter counts for the team alone in the 3D rules.
  const teamOnly = sides.map(i => state.score[i] - state.rosters[i].reduce((sum, p) => sum + p.stats.pts, 0));
  return { ...state.fixture, teamOnly, teams: sides.map(i => state.teams[i].key), score: sides.map(i => state.score[i]), rivals,
    box: sides.map(i => state.rosters[i].map(p => ({ ...p.stats, secs: p.secs, pm: p.pm, mood: moodOf(state, p) }))) };
}

export const simulateFixture = league => gameReport(simulate(fixtureMatch(league)));

// Cross-check both boxes before changing any season data. A partial or mismatched result cannot apply half a game.
export function checkBox(result, f) {
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  if (!Array.isArray(result.score) || result.score.length !== 2 || !result.score.every(integer) || result.score[0] === result.score[1] ||
      result.box?.length !== 2 || result.teamOnly?.length !== 2 || !result.teamOnly.every(integer)) throw new Error('Invalid final score.');
  [f.home, f.away].forEach((team, side) => {
    const rows = result.box[side];
    if (rows.length !== clubs[team].players.length || rows.some(p => !STAT_KEYS.every(k => integer(p[k])) ||
        !Number.isFinite(p.secs) || p.secs < 0 || !Number.isFinite(p.mood?.confidence) || Math.abs(p.mood.confidence) > 1 ||
        !Number.isFinite(p.mood.frustration) || p.mood.frustration < 0 || p.mood.frustration > 1) ||
        rows.reduce((n, p) => n + p.pts, result.teamOnly[side]) !== result.score[side]) throw new Error('The box score does not match the final.');
  });
}

export function recordGame(league, result) {
  const season = league.season, f = nextFixture(league);
  if (!f || result.year !== season.year || result.id !== f.id || result.seed !== f.seed ||
      result.teams[0] !== f.home || result.teams[1] !== f.away || result.score[0] === result.score[1])
    throw new Error('This result does not belong to the pending game.');
  checkBox(result, f);
  if (result.teamOnly.some(n => n > 0)) f.teamOnly = result.teamOnly;
  if (involved(f, league.team)) season.lastBox = { id: f.id, score: result.score, teamOnly: result.teamOnly, box: result.box };
  const stats = f.series === undefined ? season.stats : season.postseason;
  result.teams.forEach((team, side) => result.box[side].forEach((p, row) => {
    const id = league.staff[team].ids[row];
    const line = stats[id] ??= { ...emptyLine(), gp: 0, secs: 0, high: 0 };
    for (const k of STAT_KEYS) line[k] += p[k];
    line.gp += Number(p.secs > 0);
    line.secs += p.secs;
    line.high = Math.max(line.high, p.pts);
    league.moods[id] = p.mood;
  }));
  for (const [pair, by, heat] of result.rivals) league.rivals[pair] = { by, heat };
  f.score = result.score;
  if (f.series !== undefined) {
    const s = season.series[f.series];
    s.wins[s.teams.indexOf(result.score[0] > result.score[1] ? f.home : f.away)]++;
  }
  season.cursor++;
  advanceBracket(season, league.bestOf);
}
