import { clubs, lengths, standings } from './calendar.js';
import { involved } from './league.js';
import { assetUrl } from '../render/assets.js';
import { MATCH } from '../sim/tuning.js';

export const escapeText = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const button = (action, label) => `<button type="button" data-action="${action}">${label}</button>`;
const option = (value, label = value) => `<option value="${value}">${label}</option>`;
const select = (label, name, options) => `<label>${label}<select name="${name}">${options}</select></label>`;
const clubOptions = Object.values(clubs).map(t => option(t.key, t.name)).join('');
const table = (headers, rows) => `<div class="ml-scroll"><table><thead><tr>${headers.map(h => '<th scope="col">' + h + '</th>').join('')}</tr></thead><tbody>${rows.map(cells => '<tr>' + cells.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('')}</tbody></table></div>`;
const badge = key => `<img class="ml-logo" alt="" src="${assetUrl(clubs[key].logo.image)}">`;
const rosterName = (team, p) => team + '/' + p.number;

export function library(slots) {
  return `<h1>MyLeague</h1><section><h2>Your franchises</h2>${slots.length ? slots.sort((a, b) => b.updated - a.updated).map(s =>
    `<button class="ml-slot" data-slot="${escapeText(s.id)}">${badge(s.team)}<span>${escapeText(s.name)}<small>${clubs[s.team].name} · Season ${s.year}</small></span></button>`).join('') : '<p>No saved franchises on this device.</p>'}</section>
    <section><h2>New franchise</h2><form id="ml-create"><div class="ml-grid"><label>Franchise name<input required maxlength="60" name="name" value="My franchise"></label>
    ${select('Your team', 'team', clubOptions)}${select('Games per team', 'games', lengths.map(n => option(n)).join(''))}
    ${select('Quarter length', 'minutes', [...MATCH.minutes].reverse().map(n => option(n, n + ' minutes')).join(''))}
    ${select('Players per side', 'size', option(5) + option(3))}${select('Game style', 'style', option('sim', 'Simulation') + option('arcade', 'Arcade'))}
    ${select('Playoff series', 'bestOf', [3, 1, 5, 7].map(n => option(n, 'Best of ' + n)).join(''))}
    <label>Universe seed<input name="seed" type="number" min="0" max="4294967295" step="1" placeholder="Random"></label></div>
    <button class="ml-primary">Create franchise</button></form></section><footer><label>Import a save<input type="file" id="ml-import" accept=".json,application/json"></label>${button('close', 'Main menu')}</footer>`;
}

function standingsView(season) {
  const rows = standings(season);
  return ['East', 'West'].map(conf => `<section><h2>${conf} standings</h2>${table(['Seed', 'Team', 'W', 'L', '+/−', 'Streak'],
    rows.filter(t => clubs[t.key].conference === conf).map((t, i) => [i + 1, clubs[t.key].name, t.w, t.l, t.diff, t.streak ? (t.streak > 0 ? 'W' : 'L') + Math.abs(t.streak) : '—']))}</section>`).join('');
}

function leaders(season, team, postseason = false) {
  const lines = postseason ? season.postseason : season.stats;
  const players = (team ? [clubs[team]] : Object.values(clubs)).flatMap(t => t.players.map(p => ({ ...p, team: t.key, line: lines[rosterName(t.key, p)] })));
  const avg = (p, stat) => (p.line?.gp ? p.line[stat] / p.line.gp : 0);
  players.sort((a, b) => avg(b, 'pts') - avg(a, 'pts'));
  return table(['Player', 'Team', 'Pos', 'GP', 'PPG', 'RPG', 'APG', 'High'], players.slice(0, team ? 10 : 20).map(p =>
    [p.name, p.team, p.position, p.line?.gp ?? 0, ...['pts', 'reb', 'ast'].map(k => avg(p, k).toFixed(1)), p.line?.high ?? 0]));
}

function lastBox(season) {
  const result = season.lastBox;
  if (!result) return '';
  const f = season.fixtures[result.id];
  return '<details><summary>Last game box score</summary>' + [f.home, f.away].map((key, side) =>
    '<h3>' + clubs[key].name + ' · ' + result.score[side] + '</h3>' + table(['Player', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG', '3PT', 'FT'],
      result.box[side].map((p, i) => [clubs[key].players[i].name, (p.secs / 60).toFixed(1), p.pts, p.reb, p.ast, p.stl, p.blk, p.tov,
        p.fgm + '/' + p.fga, p.tpm + '/' + p.tpa, p.ftm + '/' + p.fta]))).join('') + '</details>';
}

function calendarView(season, team) {
  return table(['Day', 'Away', 'Home', 'Result'], season.fixtures.filter(f => involved(f, team)).map(f =>
    [f.day, clubs[f.away].nickname, clubs[f.home].nickname, f.score ? f.score[1] + ' – ' + f.score[0] : 'Scheduled']));
}

function playoffs(season) {
  return season.series.length ? table(['Round', 'Higher seed', 'Opponent', 'Series'], season.series.map(s =>
    [['First round', 'Conference finals', 'Finals'][s.round - 1], clubs[s.teams[0]].name, clubs[s.teams[1]].name, s.wins.join(' – ')])) : '<p>The top four teams in each conference qualify.</p>';
}

export function dashboard(league, tab, archived = 0, past = null) {
  const { season, team } = league, club = clubs[team], mine = standings(season).find(s => s.key === team);
  const next = season.fixtures.slice(season.cursor).find(f => involved(f, team));
  const last = season.fixtures.slice(0, season.cursor).filter(f => involved(f, team)).at(-1);
  const tabs = ['Overview', 'Calendar', 'Standings', 'Leaders', 'Playoffs', 'History'];
  let body;
  if (tab === 'Overview') {
    const opponent = next && clubs[next.home === team ? next.away : next.home];
    body = `<section class="ml-match"><div>${season.champion ? '<small>Season champion</small><h2>' + clubs[season.champion].name + '</h2>' :
      next ? '<small>Day ' + next.day + ' · ' + (next.series === undefined ? 'Regular season' : 'Playoffs') + '</small><h2>' + club.nickname + (next.home === team ? ' vs ' : ' at ') + opponent.nickname + '</h2><p>' + clubs[next.home].venue.name + '</p>' :
      '<h2>League playoffs</h2><p>Advance the bracket to see who plays next.</p>'}</div>${opponent ? badge(opponent.key) : ''}</section>
      <div class="ml-actions">${next ? '<button class="ml-primary" data-action="play">Play game</button>' + button('watch', 'Watch game') + button('simGame', 'Simulate game') : ''}
      ${season.champion ? button('nextSeason', 'Start next season') : (next ? '' : button('nextMatchup', 'Advance to next matchup')) + button('simSeason', 'Simulate season')}</div>
      ${!season.champion ? '<form id="ml-date"><label>Simulate through day <input type="number" required name="day" min="' + season.fixtures[season.cursor].day + '" value="' + season.fixtures[season.cursor].day + '"></label><button>Advance</button></form>' : ''}
      ${last ? '<p>Last result · ' + last.away + ' ' + last.score[1] + ' at ' + last.home + ' ' + last.score[0] + '</p>' : ''}
      ${lastBox(season)}<h2>Roster · regular season</h2>${leaders(season, team)}`;
  } else if (tab === 'Calendar') body = '<h2>Team schedule</h2>' + calendarView(season, team);
  else if (tab === 'Standings') body = standingsView(season);
  else if (tab === 'Leaders') body = '<h2>Scoring leaders · regular season</h2>' + leaders(season) + (season.round ? '<h2>Playoff leaders</h2>' + leaders(season, null, true) : '');
  else if (tab === 'Playoffs') body = '<h2>Playoff bracket</h2>' + playoffs(season);
  else {
    body = '<h2>Season archive</h2>' + (past ? select('Season', 'archive', league.history.map((s, i) =>
      `<option value="${i}" ${i === archived ? 'selected' : ''}>Season ${s.year}</option>`).join('')) +
      '<h3>Champion · ' + clubs[past.champion].name + '</h3>' + playoffs(past) + standingsView(past) + leaders(past) : '<p>Completed seasons appear here when the next season begins.</p>');
  }
  return `<header>${badge(team)}<div><small>MyLeague · Season ${season.year}</small><h1>${escapeText(league.name)}</h1><p>${club.name} · ${mine.w}–${mine.l} · ${club.conference}</p></div></header>
    <nav aria-label="Franchise views">${tabs.map(t => `<button data-tab="${t}" aria-pressed="${t === tab}">${t}</button>`).join('')}</nav>
    ${body}<footer>${button('save', 'Save')}${button('export', 'Export save')}${button('library', 'Franchises')}${button('close', 'Main menu')}</footer>`;
}
