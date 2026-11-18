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
  const recent = season.fixtures.slice(0, season.cursor).reverse();
  const teamGames = recent.filter(f => involved(f, team));
  const rows = standings(season).filter(r => clubs[r.key].conference === club.conference);
  const views = { Overview: 'Home', Roster: 'Roster', Calendar: 'Schedule', Standings: 'League', Social: 'Social', Settings: 'Settings' };
  const link = (key, label) => `<button data-tab="${key}">${label}</button>`;
  const card = (title, content, type = '') => `<section class="hub-card ${type}"><h2>${title}</h2>${content}</section>`;
  const player = club.players.reduce((best, p) => (season.stats[rosterName(team,p)]?.pts ?? 0) > (season.stats[rosterName(team,best)]?.pts ?? 0) ? p : best);
  const line = season.stats[rosterName(team, player)];
  const score = f => `${f.away} ${f.score[1]} · ${f.home} ${f.score[0]}`;
  const news = recent.length ? recent.slice(0,3).map(f => `<p><small>DAY ${f.day} · FINAL</small>${score(f)}</p>`).join('') : `<p>Season ${season.year} opens with ${league.games} games per club.</p>`;
  const social = teamGames.length ? teamGames.slice(0,3).map(f => `<p><small>@${club.nickname}Fans · Day ${f.day}</small>${(f.home === team) === (f.score[0] > f.score[1]) ? 'Another one in the win column.' : 'Time to regroup.'} ${score(f)}</p>`).join('') : `<p><small>@${club.nickname}Fans</small>Season ${season.year}. Who leads us in scoring this year?</p>`;
  const games = next ? '<div class="versus">' + badge(next.home) + '<strong>VS</strong>' + badge(next.away) + '</div><b>' + next.home + ' vs ' + next.away + '</b><small>Day ' + next.day + ' · ' + clubs[next.home].venue.name + '</small><div class="hub-buttons">' + button('play','Play') + button('watch','Watch') + button('simGame','Simulate') + '</div>' : season.champion ? clubs[season.champion].name + ' win the championship.' : button('nextMatchup','Advance to next matchup');
  const date = season.champion ? button('nextSeason','Start next season') : `<form id="ml-date"><label>Simulate through day<input name="day" type="number" required min="${season.fixtures[season.cursor].day}" value="${season.fixtures[season.cursor].day}"></label><button>Advance</button></form>${button('simSeason','Simulate season')}`;
  let body;
  if (tab === 'Overview') {
    const stats = ['pts','reb','ast','fgm'].map((k,i) => `<div><small>${['PPG','RPG','APG','FG%'][i]}</small><b>${line?.gp ? (k === 'fgm' ? (line.fga ? 100*line.fgm/line.fga : 0) : line[k]/line.gp).toFixed(1) : '—'}</b></div>`).join('');
    const stories = [
      ['Featured player', player.name, player.archetype, club.nickname + ' · ' + player.position],
      ['Team story', club.nickname, mine.w + ' wins · ' + mine.l + ' losses', club.conference + ' conference'],
      ['League news', season.champion ? clubs[season.champion].nickname : recent.length ? score(recent[0]) : 'Opening day',
        season.champion ? 'League champions' : recent.length ? 'Final from ' + clubs[recent[0].home].venue.name : league.games + ' games per club', 'Season ' + season.year]
    ];
    const carousel = stories.map(([label,title,summary,kicker],i) => `<input class="story-choice" type="radio" name="feature-story" id="story-${i}" aria-label="${label}" ${i ? '' : 'checked'}><div class="story"><small>${kicker}</small><h3>${title}</h3><p>${summary}</p></div>`).join('');
    body = `<div class="hub-grid">
      ${card('Quick actions', (!season.champion ? button('week','Advance week') : button('nextSeason','Next season')) + link('Roster','View roster') + link('Playoffs','Playoff bracket') + link('History','Season archive') + button('saveExit','Save & exit'),'quick')}
      ${card('Spotlight', `<div class="jersey" aria-hidden="true">${badge(team)}<b>${player.number}</b></div><div class="spotlight">${carousel}</div><div class="statstrip">${stats}</div><div class="story-picks">${stories.map(([label],i)=>`<label title="${label}" for="story-${i}"><span>${label}</span></label>`).join('')}</div>`, 'feature')}
      ${card('Upcoming game', games,'upcoming')}
      ${card(club.conference + ' standings', table(['#','Team','W','L'], rows.map((r,i)=>[i+1,r.key,r.w,r.l])), 'rank')}
      </div><div class="hub-bottom">${card('Recent results',teamGames.length ? teamGames.slice(0,3).map(f => '<p>'+score(f)+'</p>').join('') : '<p>Your first final will appear here.</p>')}${card('League news',news)}${card('Social feed',social)}</div>`;
  } else if (tab === 'Roster') body = card(club.name, leaders(season,team) + lastBox(season));
  else if (tab === 'Social') body = card('CourtSide', social) + card('League news',news);
  else if (tab === 'Settings') body = card('Franchise settings', `<p>${league.games} games · ${league.minutes}-minute quarters · ${league.size} on ${league.size} · Best of ${league.bestOf}</p>` + button('save','Save franchise') + button('export','Export save') + button('library','Franchises') + button('close','Main menu'));
  else if (tab === 'Calendar') body = card('Team schedule', date + calendarView(season, team));
  else if (tab === 'Standings') body = standingsView(season);
  else if (tab === 'Leaders') body = '<h2>Scoring leaders · regular season</h2>' + leaders(season) + (season.round ? '<h2>Playoff leaders</h2>' + leaders(season, null, true) : '');
  else if (tab === 'Playoffs') body = '<h2>Playoff bracket</h2>' + playoffs(season);
  else {
    body = '<h2>Season archive</h2>' + (past ? select('Season', 'archive', league.history.map((s, i) =>
      `<option value="${i}" ${i === archived ? 'selected' : ''}>Season ${s.year}</option>`).join('')) +
      '<h3>Champion · ' + clubs[past.champion].name + '</h3>' + playoffs(past) + standingsView(past) + leaders(past) : '<p>Completed seasons appear here when the next season begins.</p>');
  }
  const leagueViews = ['Standings','Leaders','Playoffs','History'];
  return `<div class="hub"><header><strong class="tt-brand">TRIPLE<br>THREAT</strong><div><h1>MyLeague</h1><small>${escapeText(league.name)} · Season ${season.year}</small></div><div class="club-id">${badge(team)}<b>${club.nickname} · ${mine.w}–${mine.l}</b></div></header>
    <nav aria-label="Franchise views">${Object.entries(views).map(([key,label]) => `<button data-tab="${key}" aria-pressed="${key === tab || key === 'Standings' && leagueViews.includes(tab)}">${label}</button>`).join('')}</nav>
    ${leagueViews.includes(tab) ? '<div class="hub-buttons">'+leagueViews.map(k=>link(k,k)).join('')+'</div>' : ''}${body}</div>`;
}
