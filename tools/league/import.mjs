// Turns the league's CSV files (teams, players, coaches, arenas) into src/sim/league.js, the twelve teams the game
// plays with besides its two dev teams. Only what the game uses is kept: never the files' columns naming the real
// players and teams behind the parodies. Usage:
//   node tools/league/import.mjs [folder]   (default: ~/Documents/Triple-Threat_expansion-teams)
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KEYS = ['inside', 'mid', 'three', 'handle', 'speed', 'defence', 'rebound', 'stamina'];

// A CSV file's rows as objects, by its header (RFC 4180: quoted fields may hold commas, quotes and line breaks).
export function readCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.length > 1 || r[0] !== '');
  const names = head.map(h => h.replace(/^﻿/, '').trim());
  return body.map(r => Object.fromEntries(names.map((n, i) => [n, (r[i] ?? '').trim()])));
}

// The game's role for a player, from his archetype's words (first match wins) and his position.
const ROLE_WORDS = [
  [/rim protector|shot block|paint protector|paint anchor|rim denial|defensive big|switchable defensive big|interior big/i, () => 'Rim protector'],
  [/post scor|post anchor/i, () => 'Post scorer'],
  [/glass|rebound/i, pos => (pos === 'C' ? 'Rebounder' : 'Glass cleaner')],
  [/stretch big|pick-and-pop|stretch rim|stretch defender|face-up/i, pos => (pos === 'C' || pos === 'PF' ? 'Stretch big' : 'Two-way wing')],
  [/point center|playmaking big|point forward|playmaker|floor general|pass-first|connector|handler|tempo pusher|transition playmaker/i, () => 'Playmaker'],
  [/sharpshoot|shooter|marksman|sniper|catch-and-shoot|spot-up|corner specialist|floor-spacing/i, () => 'Sharpshooter'],
  [/three-and-d/i, pos => (pos === 'PG' || pos === 'SG' ? 'Lockdown guard' : 'Two-way wing')],
  [/lockdown|stopper|point-of-attack|ball pressure|physical defender|energy defender|mobile defender|defensive|enforcer/i, pos => (pos === 'PG' || pos === 'SG' ? 'Lockdown guard' : 'Lockdown wing')],
  [/rim run|lob target|interior finisher|interior rim|screen/i, pos => (pos === 'C' || pos === 'PF' ? 'Rebounder' : 'Slasher')],
  [/creator|three-level|heliocentric|instant scorer|scoring|shot maker|pull-up|combo scorer|speedy scorer|sparkplug|bench creator|change-of-pace/i, () => 'Shot creator'],
  [/slash|rim attacker|downhill|cutter|cutting|transition|finisher|athletic|explosive|power|speedster|hustle|high-motor|energy/i, () => 'Slasher'],
  [/two-way|switchable|versatile|utility|future star|wing/i, () => 'Two-way wing'],
];
export const roleOf = (archetype, position) => {
  for (const [words, role] of ROLE_WORDS) if (words.test(archetype)) return role(position);
  return 'Role player';
};

// How much a big's rim protection counts in his defence against his perimeter defence, by position.
const RIM_SHARE = { C: 0.6, PF: 0.4, SF: 0.15, SG: 0.05, PG: 0.05 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const overallOf = ratings => { const s = [...ratings].sort((a, b) => a - b); return Math.round(s.slice(3).reduce((a, b) => a + b, 0) / 5); };

// A player's eight ratings from his row, moved together so that his overall (the mean of his best five, as the game
// counts it) is the one the file gives him. Each stays within the game's 40 to 99.
export function ratingsOf(row) {
  const n = key => Number(row[key]), share = RIM_SHARE[row.position] ?? 0.1;
  const raw = [n('inside_scoring'), n('midrange'), n('three_point'), n('ball_handling'), n('speed'),
    Math.round(n('perimeter_defense') * (1 - share) + n('rim_protection') * share), n('rebounding'), n('stamina')];
  const want = n('overall');
  let best = raw.map(v => clamp(v, 40, 99));
  for (let shift = -20; shift <= 20; shift++) {
    const moved = raw.map(v => clamp(v + shift, 40, 99));
    if (Math.abs(overallOf(moved) - want) < Math.abs(overallOf(best) - want)) best = moved;
  }
  return Object.fromEntries(KEYS.map((k, i) => [k, best[i]]));
}

// The team's playbook, defence and coach (see teams.js), from its schemes and its coach's kind.
const PLAYBOOK = { 'Five-out motion': 'paceSpace', 'Five-out drive-and-kick': 'paceSpace', 'Drive-and-kick': 'paceSpace', 'Motion and split actions': 'paceSpace',
  'Spread pick-and-roll': 'paceSpace', 'Inside-out isolation': 'insideOut', 'Point-center hub': 'insideOut', 'High-post motion': 'insideOut', 'Wing mismatch': 'insideOut' };
const DEFENCE = { 'Switch-and-recover': 'switchAll', 'Switch-everything': 'switchAll', 'Turnover-hunting switch': 'switchAll',
  'Drop and closeout': 'dropBig', 'Drop-and-help': 'dropBig', 'Length and rim denial': 'dropBig', 'Paint pressure': 'dropBig', 'Contain and rebound': 'dropBig' };
const AGGRESSIVE = /aggressive|physical/i;

// A uniform's colours, "jersey / trim", with White as #ffffff.
const uniform = text => { const [jersey, trim] = text.split('/').map(s => s.trim()).map(c => (/^white$/i.test(c) ? '#ffffff' : c.toLowerCase())); return { jersey, trim }; };

// The road uniforms the uniform sheets show differently from the teams file: theirs are used (Black as #000000).
const ROAD = { NYE: 'secondary', DET: 'secondary', SAS: 'secondary', DAL: 'secondary' };

// How far apart two colours are (0 to about 441), and how light one is (0 to 1).
const rgb = hex => hex.slice(1).match(/../g).map(h => parseInt(h, 16));
export const apart = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
const light = hex => { const [r, g, b] = rgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

// A kit as it is painted: the jersey's colour, the trim's (side panels, bindings), and the lettering's and its
// outline's, each from the team's colours. The lettering is the trim on white (the darkest colour when the trim is too
// light to read) and white on a colour (the darkest on a light one). Its outline is the first of the trim and the
// team's colours that stands out from it, and is not the jersey's.
export function kitOf(jersey, trim, palette) {
  const darkest = [...palette].sort((a, b) => light(a) - light(b))[0];
  const letters = jersey === '#ffffff' ? (light(trim) < 0.65 ? trim : darkest) : light(jersey) < 0.65 ? '#ffffff' : darkest;
  const choices = [trim, ...palette].filter(c => c !== letters && c !== jersey);
  return { jersey, trim, letters, outline: choices.find(c => apart(c, letters) >= 120) ?? choices[0] ?? trim };
}

// A team's home and road kits (see kitOf): home in white with its trim, road as the file or the sheets have it.
function uniforms(t) {
  const palette = [t.secondary_hex, t.accent_hex, t.primary_hex].map(c => c.toLowerCase());
  const home = uniform(t.home_uniform), file = uniform(t.away_uniform);
  const road = ROAD[t.team_id] ? { jersey: palette[0], trim: t.primary_hex.toLowerCase() } : file;
  return { home: kitOf('#ffffff', home.trim, palette), road: kitOf(road.jersey, road.trim, palette) };
}

// The league, from the folder of CSV files: one entry a team, in East then West order as the files list them.
export function league(folder) {
  const read = name => readCsv(readFileSync(join(folder, name), 'utf8'));
  const pack = join('triple_threat_league_csv_pack');
  const teams = read(join(pack, 'triple_threat_teams.csv')), players = read(join(pack, 'triple_threat_players.csv'));
  const coaches = read(join(pack, 'triple_threat_coaches.csv')), arenas = read('triple_threat_arenas.csv');
  return teams.map(t => {
    const coach = coaches.find(c => c.team_id === t.team_id), arena = arenas.find(a => a.team_id === t.team_id);
    const rows = players.filter(p => p.team_id === t.team_id);
    const numbers = rows.map(p => Number(p.jersey_number));
    if (rows.length !== 10 || new Set(numbers).size !== 10) throw new Error(`${t.team_id}: needs ten players with ten different numbers`);
    // Starters first, the best of them first (a three-a-side match plays the first three); then the bench, best first.
    const order = (a, b) => Number(b.overall) - Number(a.overall);
    const roster = [...rows.filter(p => p.roster_role === 'Starter').sort(order), ...rows.filter(p => p.roster_role !== 'Starter').sort(order)];
    return {
      key: t.team_id, name: t.team_name, abbr: t.abbreviation, city: t.city, nickname: t.nickname,
      conference: t.conference.startsWith('East') ? 'East' : 'West',
      playbook: PLAYBOOK[t.offensive_scheme] ?? 'balanced', defence: DEFENCE[t.defensive_scheme] ?? 'standard', coach: AGGRESSIVE.test(coach?.coach_archetype ?? '') ? 'aggressive' : 'steady',
      coachName: t.head_coach, colour: t.primary_hex.toLowerCase(), secondary: t.secondary_hex.toLowerCase(), accent: t.accent_hex.toLowerCase(),
      uniforms: uniforms(t),
      arena: t.team_id.toLowerCase(),
      venue: { name: arena?.arena_name ?? t.arena, short: arena?.arena_short_name ?? t.arena, state: arena?.state ?? '', notes: arena?.arena_design_notes ?? '' },
      logo: { image: `assets/logos/${t.team_id.toLowerCase()}.png`, disc: t.primary_hex.toLowerCase(), rim: '#ffffff' },
      players: roster.map(p => ({
        name: p.player_name, number: Number(p.jersey_number), position: p.position, role: roleOf(p.archetype, p.position),
        archetype: p.archetype, height: Math.round(Number(p.height_inches) * 2.54) / 100, starter: p.roster_role === 'Starter',
        ratings: ratingsOf(p),
      })),
    };
  });
}

// The module the game imports: the league as frozen data, written out plainly so that it reads as a list.
export function moduleText(teams) {
  const lines = ['// The league: the twelve teams besides the dev teams, made by tools/league/import.mjs from the league\'s CSV files.',
    '// Not edited by hand: change the files and import them again. Every name is a parody; the real players and teams',
    '// they parody are not kept here.', 'const f = Object.freeze;', '', 'export const LEAGUE = f(['];
  for (const t of teams) {
    const { players, ...team } = t;
    lines.push(`  f({ ${JSON.stringify(team).slice(1, -1)},`, '    players: f([');
    for (const p of players) lines.push(`      f(${JSON.stringify(p)}),`);
    lines.push('    ]) }),');
  }
  lines.push(']);', '');
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const folder = process.argv[2] ?? join(homedir(), 'Documents', 'Triple-Threat_expansion-teams');
  const teams = league(folder), out = fileURLToPath(new URL('../../src/sim/league.js', import.meta.url));
  writeFileSync(out, moduleText(teams));
  console.log(`src/sim/league.js: ${teams.length} teams, ${teams.reduce((n, t) => n + t.players.length, 0)} players`);
}
