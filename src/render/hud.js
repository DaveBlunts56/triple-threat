import { CLOCK, DIFFICULTY, ROSTER } from '../sim/tuning.js';
import { ACTION_WORDS, DEFAULT_KEYS, KEY_ROWS, keyLabel } from '../keys.js';
import { personOf, surname } from '../sim/state.js';
import { onCourt } from '../sim/roster.js';
import { heatOf, overall, starOf } from '../sim/ratings.js';
import { menuRows } from '../menu.js';
import { pauseRows } from '../pause.js';
import { playListRows } from '../playlist.js';
import { playOn } from '../sim/plays.js';
import { QUALITY } from './quality.js';
import { playerOfGame, teamLine as teamStats } from '../sim/stats.js';
import { DEFAULT_PREFS } from '../prefs.js';
import { SLIDERS, STYLE_LABEL, styled } from '../sim/styles.js';
import { efg, ftRate, orbPct, pace, rating, threeRate, tovPct, ts } from '../sim/advanced.js';

const FPS_EASE = 0.05;   // how fast the frame-rate readout follows the real rate: steady enough to read

// The length of a frame in milliseconds, eased so the readout is steady. Easing the time and not the rate makes uneven
// frames read as the rate they really give: 16 ms and 66 ms in turn is 24 frames a second, not 37.
export const easeFrame = (eased, ms) => eased + (ms - eased) * FPS_EASE;

export const periodLabel = quarter => (quarter <= CLOCK.quarters ? `Q${quarter}` : `OT${quarter - CLOCK.quarters}`);

// Rounds up, so the clock only reads 0:00 once time has actually run out.
export function clockText(seconds) {
  const whole = Math.ceil(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const CALLS = {
  travel: 'Travelling', doubleDribble: 'Double dribble', backcourt: 'Backcourt violation',
  eightSeconds: '8 seconds', threeSeconds: '3 seconds', fiveSeconds: '5 seconds',
  shotClock: 'Shot clock violation', out: 'Out of bounds',
  reach: 'Reach-in foul', block: 'Blocking foul', shooting: 'Shooting foul', charge: 'Charge',
  timeout: 'Timeout',
};
const SHOTS = ['', 'One shot', 'Two shots', 'Three shots'];

// The whistle as a sentence: what was called, on whom, and what follows. You are team 0.
export function callText(call) {
  if (call.kind === 'timeout') return `Timeout, ${ROSTER.teams[call.team]}. ${call.ball === 0 ? 'Your ball' : "Opponent's ball"}`;
  const who = call.name ? `${surname(call)} (${call.number})` : call.number;
  const what = CALLS[call.kind] + (call.number === null ? '' : ` on ${who}`);
  return `${what}. ${call.shots ? SHOTS[call.shots] : call.ball === 0 ? 'Your ball' : "Opponent's ball"}`;
}

// One row of the pause screen: person `row` of your team.
export function rosterLine(state, row, picked) {
  const person = state.rosters[0][row];
  const fouls = `${person.fouls} foul${person.fouls === 1 ? '' : 's'}`;
  const where = onCourt(state, 0).includes(row) ? `on court · ${fouls}` : person.fouls >= state.foulLimit ? 'fouled out' : `bench · ${fouls}`;
  return `${row + 1} · ${person.position} · ${person.name} · No. ${person.number} · ${person.role} ${overall(person)} · ${where}${picked ? ' · selected' : ''}`;
}

// The player you control: surname, position, number.
export function whoText(state) {
  const person = personOf(state, state.players[state.controlled]);
  return `${surname(person)} · ${person.position} · ${person.number}`;
}

export function subNote(state) {
  const name = i => surname(state.rosters[0][i]);
  const queued = state.subQueue.filter(q => q.team === 0).map(q => `${name(q.out)} off, ${name(q.in)} on`);
  return `Automatic substitutions ${state.autoSubs[0] ? 'on' : 'off'}. ${queued.length ? `Queued: ${queued.join('; ')}.` : 'No swap queued.'}`;
}

// What the frozen shot meter says about the release. A block is never shown as a make.
const VERDICTS = { green: '✓', early: 'Early', late: 'Late', range: 'Out of range' };
const markText = frozen => (frozen.blocked ? 'Blocked' : VERDICTS[frozen.verdict]);
const pixels = value => `${Math.round(value)}px`;
const share = value => `${Math.round(value * 1000) / 10}%`;

// The start menu: the words of each entry, what the hint line says in each panel, and the two teams' lines.
const MENU_WORDS = { play: 'Play', watch: 'Watch', simulate: 'Simulate', teams: 'Teams', controls: 'Controls', settings: 'Settings', keys: 'Keys',
  styles: 'Game styles ▸', arcadeSliders: 'Arcade sliders ▸', simSliders: 'Simulation sliders ▸', reset: 'Reset to 50' };
const MODE_WORDS = { 3: 'Mode: 3 on 3', 5: 'Mode: 5 on 5' };
const SLIDER_HINT = '↑ ↓ choose · ← → move by 5 · Enter on Reset · Esc back';
const MENU_HINTS = { main: '↑ ↓ choose · Enter select', settings: '↑ ↓ choose · Enter change · Esc back', teams: 'Esc back', controls: 'Esc back',
  keys: '↑ ↓ choose · Enter change · Esc back', styles: '↑ ↓ choose · ← → or Enter change · Esc back', arcadeSliders: SLIDER_HINT, simSliders: SLIDER_HINT };
const SLIDER_PANELS = { arcadeSliders: 'arcade', simSliders: 'sim' };
const SLIDER_LABEL = Object.fromEntries(SLIDERS.map(sl => [sl.key, sl.label]));
const LISTENING_HINT = 'Press the new key · Esc to leave it as it was';
const MENU_SLOTS = 10;   // menuRow0 to menuRow9 on the page
const CONTROL_SLOTS = 11;   // ctlK0/ctlW0 to ctlK10/ctlW10 on the start menu, pctlK0/pctlW0 and on in the pause menu

// The words of row `row` of the Keys panel: what the key does and the key, or that it is waiting for one.
// `panel` is the menu showing it: { row, listening }.
export function keysText(keys, row, panel) {
  const action = KEY_ROWS[row];
  if (action === 'reset') return 'Reset all keys';
  return `${ACTION_WORDS[action]}: ${panel.listening && panel.row === row ? 'press a key…' : keyLabel(keys[action])}`;
}

// The Controls panel: each line's keys as they are now, and what they do.
export function controlsLines(keys) {
  const k = action => keyLabel(keys[action]);
  return [
    [['up', 'left', 'down', 'right'].map(k).join(' '), 'move'], [k('sprint'), 'sprint'], [k('shoot'), 'shoot / jump'],
    [k('pass'), 'pass / switch'], [k('steal'), 'steal'], [k('hold'), 'hold ball'],
    [`${k('cross')} · ${k('legs')} · ${k('back')}`, 'crossover · between the legs · behind the back'],
    [`${k('stepBack')} · ${k('fade')}`, 'step-back · post fade'], [k('dunk'), 'dunk'], ['Esc', 'pause'],
    [`${k('quality')} · ${k('camera')}`, 'quality · camera'], [`${k('plays')} · ${k('timeout')}`, 'plays · timeout'],
  ];
}

// The line of keys under the court.
export function hintLine(keys) {
  const k = action => keyLabel(keys[action]);
  return [`${['up', 'left', 'down', 'right'].map(k).join(' ')} move`, `${k('sprint')} sprint`, `${k('shoot')} shoot / jump`, `${k('pass')} pass / switch`,
    `${k('steal')} steal`, `${k('hold')} hold ball`, `${['cross', 'legs', 'back', 'stepBack', 'fade'].map(k).join(' ')} moves`, `${k('dunk')} dunk`, 'Esc pause',
    `${k('quality')} quality`, `${k('camera')} camera`, `${k('plays')} plays`, `${k('timeout')} timeout`].join(' · ');
}
// A player's line on the Teams panel: his overall, his name (the team's star marked) and what he is for.
export const teamLine = (state, team, row) => {
  const person = state.rosters[team][row];
  return `${overall(person)} · ${person.name}${starOf(state, team) === row ? ' ★' : ''} · ${person.role}`;
};

const CAMERA_WORDS = { '2k': 'Camera: 2K', broadcast: 'Camera: Broadcast' };
// The Commentary row: what is chosen, or, where the browser has no voice, that it is captions only.
const commentaryWords = (value, hasVoice) => (value === 'off' ? 'Commentary: Off'
  : !hasVoice ? 'Commentary: Captions only (no voice in this browser)' : value === 'voice' ? 'Commentary: Voice and captions' : 'Commentary: Captions only');
// The words of a settings row that the page itself keeps (see PAGE_ROWS), or undefined for any other row.
function pageRowText(choice, quality, camera, prefs, hasVoice) {
  if (choice === 'camera') return CAMERA_WORDS[camera];
  if (choice === 'quality') return `Quality: ${QUALITY[quality].label}`;
  if (choice === 'commentary') return commentaryWords(prefs.commentary, hasVoice);
  if (choice === 'replays') return `Replays: ${prefs.replays ? 'On' : 'Off'}`;
  if (choice === 'sound') return `Sound: ${{ full: 'Full', quiet: 'Quiet', off: 'Off' }[prefs.sound]}`;
  return undefined;
}

// The words of row `row` of the panel shown; the settings say their value. quality: one of QUALITY.order. camera:
// '2k' or 'broadcast'.
export function menuText(menu, row, quality, camera = '2k', prefs = DEFAULT_PREFS, hasVoice = true) {
  const choice = menuRows(menu)[row], kept = pageRowText(choice, quality, camera, prefs, hasVoice);
  if (kept !== undefined) return kept;
  if (choice === 'difficulty') return `Difficulty: ${DIFFICULTY.label[menu.difficulty]}`;
  const slid = SLIDER_PANELS[menu.panel];
  if (slid && choice !== 'reset') return `${SLIDER_LABEL[choice]}: ${menu.sliders[slid][choice]}`;
  if (choice === 'playStyle' || choice === 'watchStyle') return `${choice === 'playStyle' ? 'Play' : 'Watch'} style: ${STYLE_LABEL[menu[choice.slice(0, -5)].style]}`;
  if (choice === 'playMinutes' || choice === 'watchMinutes' || choice === 'simulateMinutes') {
    const mode = choice.slice(0, -7);
    return `${mode[0].toUpperCase()}${mode.slice(1)} quarters: ${menu[mode].minutes} minutes`;
  }
  if (choice === 'autoSubs') return `Automatic substitutions: ${menu.autoSubs ? 'On' : 'Off'}`;
  if (choice === 'mode') return MODE_WORDS[menu.size];
  return MENU_WORDS[choice];
}

// The pause menu: the words of each button, and what the hint line says in each panel.
const PAUSE_WORDS = { resume: 'Resume', subs: 'Substitutions', box: 'Box score', controls: 'Controls', settings: 'Settings', quit: 'Quit to main menu', keys: 'Keys',
  stay: 'No, keep playing', leave: 'Yes, quit' };
const PAUSE_HINTS = { main: '↑ ↓ choose · Enter select · Esc resume', settings: '↑ ↓ choose · Enter change · Esc back',
  subs: '1 to 8 swap two players · A automatic substitutions · Esc back', controls: 'Esc back', box: 'Esc back', quit: '↑ ↓ choose · Enter select · Esc back',
  keys: '↑ ↓ choose · Enter change · Esc back' };
const TAG_SLOTS = 10;     // tag0 to tag9 on the page: one under each player
const PLAY_SLOTS = 10;    // playRow0 to playRow9 on the page
const PAUSE_SLOTS = 9;   // pauseRow0 to pauseRow8 on the page

// The words of row `row` of the pause menu's panel shown; the settings say their value.
export function pauseText(state, menu, row, quality, camera = '2k', prefs = DEFAULT_PREFS, hasVoice = true) {
  const choice = pauseRows(menu)[row], kept = pageRowText(choice, quality, camera, prefs, hasVoice);
  if (kept !== undefined) return kept;
  if (choice === 'difficulty') return `Difficulty: ${DIFFICULTY.label[state.difficulty]}`;
  if (choice === 'autoSubs') return `Automatic substitutions: ${state.autoSubs[0] ? 'On' : 'Off'}`;
  return PAUSE_WORDS[choice];
}

// ---------- the box score and the panels between play ----------

export const BOX_HEAD = Object.freeze(['', 'MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', '+/-']);
// Seconds on the court as minutes and seconds: '9:05'.
const clockOf = secs => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
const signed = n => (n > 0 ? `+${n}` : String(n));
const boxCells = (name, secs, s, fouls, pm) => [name, clockOf(secs), String(s.pts), `${s.fgm}/${s.fga}`, `${s.tpm}/${s.tpa}`, `${s.ftm}/${s.fta}`, String(s.reb), String(s.ast),
  String(s.stl), String(s.blk), String(s.tov), String(fouls), pm];
// One player's row of the box score, as BOX_HEAD has the columns.
export const boxRow = (state, team, row) => { const person = state.rosters[team][row]; return boxCells(surname(person), person.secs, person.stats, person.fouls, signed(person.pm)); };
// His team's totals. A team's plus-minus is its margin, which the score already says: left empty.
export const boxTotal = (state, team) => boxCells('TEAM', state.rosters[team].reduce((sum, person) => sum + person.secs, 0), teamStats(state, team),
  state.rosters[team].reduce((sum, person) => sum + person.fouls, 0), '');

// ---------- the result of a simulated game ----------

export const RESULT_HEAD = Object.freeze(['', 'MIN', 'PTS', 'FG', '3P', 'FT', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TOV', 'PF', '+/-']);
const resultCells = (name, secs, s, fouls, pm) => [name, clockOf(secs), String(s.pts), `${s.fgm}/${s.fga}`, `${s.tpm}/${s.tpa}`, `${s.ftm}/${s.fta}`,
  String(s.orb), String(s.reb - s.orb), String(s.reb), String(s.ast), String(s.stl), String(s.blk), String(s.tov), String(fouls), pm];
// One player's row, as RESULT_HEAD has the columns, and his team's totals (its plus-minus left empty: the score says it).
export const resultRow = (state, team, row) => { const p = state.rosters[team][row]; return resultCells(surname(p), p.secs, p.stats, p.fouls, signed(p.pm)); };
export const resultTotal = (state, team) => resultCells('TEAM', state.rosters[team].reduce((sum, p) => sum + p.secs, 0), teamStats(state, team),
  state.rosters[team].reduce((sum, p) => sum + p.fouls, 0), '');
// What was simulated: the style, the quarter length and the mode.
export const resultTitle = state => `${STYLE_LABEL[state.style]} · ${state.quarterLength / 60}-minute quarters · ${state.size} on ${state.size}`;
// Each team's points by period and its total.
export const resultScore = (state, team) => `${ROSTER.teams[team]}  ${state.byQuarter[team].join(' · ')}  —  ${state.score[team]}`;
const pct = value => `${(100 * value).toFixed(1)}%`;
// The team advanced stats, each [what, the home team's, the visitors'].
export function advancedLines(state) {
  const a = teamStats(state, 0), b = teamStats(state, 1), secs = state.rosters[0].reduce((sum, p) => sum + p.secs, 0) / state.size;
  const both = (what, f) => [what, f(a, b, 0), f(b, a, 1)];
  return [
    both('Pace', (x, y, t) => pace(state.possessions[t], secs).toFixed(1)),
    both('Offensive rating', (x, y, t) => rating(x.pts, state.possessions[t]).toFixed(1)),
    both('eFG%', x => pct(efg(x))), both('TS%', x => pct(ts(x))), both('Turnover %', x => `${tovPct(x).toFixed(1)}%`),
    both('Offensive rebound %', (x, y) => pct(orbPct(x, y))), both('Free-throw rate', x => ftRate(x).toFixed(3)), both('Three-point rate', x => threeRate(x).toFixed(3)),
  ];
}
const RESULT_ROWS = 9;   // simBox{t}r0 to r8 on the page: eight players and the team

// A starter's line on the line-ups panel: position, name (the team's star marked), what he is for, and his overall.
export function lineupRow(state, team, slot) {
  const player = state.players.find(p => p.team === team && p.slot === slot);
  if (!player) return '';
  const person = personOf(state, player);
  return `${person.position} · ${person.name}${starOf(state, team) === player.person ? ' ★' : ''} · ${person.role} · ${overall(person)}`;
}

// A team's leading scorer: 'Cross 11 PTS'.
const leader = (state, team) => { const best = state.rosters[team].reduce((a, b) => (b.stats.pts > a.stats.pts ? b : a)); return `${surname(best)} ${best.stats.pts} PTS`; };

// Between periods: each team's points by period and its total, then each team's leading scorer.
export function periodLines(state) {
  const byPeriod = team => `${ROSTER.abbr[team]}  ${state.byQuarter[team].map(points => String(points)).join(' · ')}  —  ${state.score[team]}`;
  return [byPeriod(0), byPeriod(1), leader(state, 0), leader(state, 1)];
}

const ratio = (made, tried) => `${made}/${tried} (${tried ? Math.round((100 * made) / tried) : 0}%)`;
// At half-time, the two teams side by side: [what, the home team's, the visitors'].
export function halfLines(state) {
  const a = teamStats(state, 0), b = teamStats(state, 1);
  return [['Field goals', ratio(a.fgm, a.fga), ratio(b.fgm, b.fga)], ['Threes', ratio(a.tpm, a.tpa), ratio(b.tpm, b.tpa)],
    ['Rebounds', String(a.reb), String(b.reb)], ['Turnovers', String(a.tov), String(b.tov)]];
}

// The player of the game, with his line.
export function potgLine(state) {
  const { team, row } = playerOfGame(state), person = state.rosters[team][row], s = person.stats;
  return `PLAYER OF THE GAME · ${person.name} · ${s.pts} PTS · ${s.reb} REB · ${s.ast} AST`;
}

const BETWEEN_SLOTS = 8;   // betweenLine0 to betweenLine7 on the page
const LINEUP_SLOTS = 5;    // lineup00 to lineup04 and lineup10 to lineup14

// The period as a scoreboard names it: 1ST to 4TH, then OT1, OT2.
export const periodWord = quarter => (quarter <= CLOCK.quarters ? ['1ST', '2ND', '3RD', '4TH'][quarter - 1] : `OT${quarter - CLOCK.quarters}`);

const SHOT_LOW = 5;   // seconds on the shot clock from which it flashes
const BACKEND_NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL 2 (WebGPU not available)', webgl2chosen: 'WebGL 2' };
const SCREENS = { start: 'screenStart', pause: 'screenPause', final: 'screenFinal', result: 'simResult' };

// The scoreboard and the start / pause / final screens. Plain HTML over the canvas.
export function createHud(doc) {
  const el = id => doc.getElementById(id);
  const shown = {};
  // Only touch the page when a value changes, so screen readers are not spammed every frame. `changed` notes what
  // `key` now shows and says whether that is new. (No function is made per call: this runs many times a frame.)
  const changed = (key, value) => (shown[key] === value ? false : ((shown[key] = value), true));
  const set = (id, text) => { if (changed(id, text)) el(id).textContent = text; };
  const hide = (id, hidden) => { if (changed(`${id}.hidden`, hidden)) el(id).hidden = hidden; };
  const bar = (id, energy) => { const value = Math.round(energy * 100) / 100; if (changed(id, value)) el(id).value = value; };
  const style = (id, key, value) => { if (changed(`${id}.${key}`, value)) el(id).style[key] = value; };
  const classed = (id, name) => { if (changed(`${id}.class`, name)) el(id).className = name; };
  const selected = (id, on) => { if (changed(`${id}.selected`, on)) el(id).ariaSelected = String(on); };
  let screen, lastCall = null, lastScore, lastPanel, lastPause, lastResult = null;
  const bug = { score: [null, null], pops: [0, 0], shines: 0 };   // what the scorebug last showed, for its animations

  return {
    // `ui` is what the page itself knows: whether the game is paused, which roster row is selected, and for the
    // corner label the frame rate and the quality level (one of QUALITY.order), and the shot meter with the page position
    // of its top (`head`), or null for none.
    update(state, backend, ui = { paused: false, pick: null }) {
      // The scorebug. A score that goes up pops and a shine sweeps the strip; the team with the ball has a lit edge;
      // a team in the bonus has its fouls lit; the shot clock flashes in its last seconds.
      const live = state.phase !== 'start' && state.phase !== 'final';
      for (const team of [0, 1]) {
        if (bug.score[team] !== null && state.score[team] > bug.score[team]) { bug.pops[team]++; bug.shines++; }
        bug.score[team] = state.score[team];
        const side = team === 0 ? 'home' : 'away';
        set(`score${team}`, String(state.score[team]));
        classed(`score${team}`, `score ${side}${bug.pops[team] ? (bug.pops[team] % 2 ? ' popA' : ' popB') : ''}`);
        set(`abbr${team}`, ROSTER.abbr[team]);
        set(`fouls${team}`, `Fouls ${state.teamFouls[team]}`);
        classed(`fouls${team}`, state.teamFouls[team] >= state.bonus ? 'fouls bonus' : 'fouls');
        set(`timeouts${team}`, '●'.repeat(state.timeouts[team]) + '○'.repeat(Math.max(0, styled(state, 'timeout.each') - state.timeouts[team])));
        classed(`bugTeam${team}`, `bugTeam ${side}${live && state.possession === team ? ' has' : ''}`);
      }
      classed('hud', bug.shines ? (bug.shines % 2 ? 'shineA' : 'shineB') : '');
      classed('shotClock', live && state.shotClock <= SHOT_LOW ? 'low' : '');
      set('who', whoText(state));
      // His surname under the player you control, at the place on the page the game says his feet are.
      const human = (state.humans ?? [0]).includes(0);   // with nobody playing there is nobody's name, and no meter
      hide('nameTag', !ui.feet || !human);
      if (ui.feet && human) {
        set('nameTag', surname(personOf(state, state.players[state.controlled])));
        style('nameTag', 'left', pixels(ui.feet.x));
        style('nameTag', 'top', pixels(ui.feet.y));
      }
      // Under each player, at the place on the page the game says his feet are: a star for his team's star, a flame
      // if he is hot, an ice cube if he is cold. Nothing for anyone else.
      for (let i = 0; i < TAG_SLOTS; i++) {
        const player = state.players[i], at = player && ui.spots?.[i], person = player && personOf(state, player);
        const star = person && starOf(state, player.team) === player.person, heat = person && heatOf(person);
        hide(`tag${i}`, !(at && (star || heat)));
        if (!at || !(star || heat)) continue;
        classed(`tag${i}`, `tag${star ? ' star' : ''}${heat ? ` ${heat}` : ''}`);
        style(`tag${i}`, 'left', pixels(at.x));
        style(`tag${i}`, 'top', pixels(at.y));
      }
      bar('energy', personOf(state, state.players[state.controlled]).energy);
      set('quarter', periodLabel(state.quarter));
      set('gameClock', clockText(state.gameClock));
      set('shotClock', String(Math.ceil(state.shotClock)));
      const level = ui.quality ? ` · ${QUALITY[ui.quality].label}` : '';
      const without = (ui.missing ?? []).map(words => ` · no ${words}`).join('');   // effects this browser could not run
      const slowest = typeof ui.worst === 'number' ? ` · slowest frame ${Math.round(ui.worst)} ms` : '';   // of the last second: a stutter shows here
      set('backend', BACKEND_NAMES[backend] + level + without + (typeof ui.fps === 'number' ? ` · ${Math.round(ui.fps)} fps` : '') + slowest);

      // The start menu (`ui.menu`), before the match: the rows of the panel shown with the bar on one, or a panel with
      // no rows (Teams, Controls), and the hint line. Screen readers hear the selected row, or the panel's name.
      const menu = state.phase === 'start' ? ui.menu : null;
      if (menu) {
        const rows = menuRows(menu);
        if (menu.panel !== lastPanel) delete shown.announce;   // a panel opened or closed: say so, even in the same words
        lastPanel = menu.panel;
        hide('menuList', !rows.length || menu.panel === 'keys');
        classed('menuList', menu.panel);
        for (let row = 0; row < MENU_SLOTS; row++) {
          hide(`menuRow${row}`, row >= rows.length);
          if (row < rows.length && menu.panel !== 'keys') set(`menuRow${row}`, menuText(menu, row, ui.quality, ui.camera, ui.prefs, ui.hasVoice));
          // On a slider panel each slider's row is filled as far as its value goes.
          const slid = SLIDER_PANELS[menu.panel], value = slid && row < rows.length && rows[row] !== 'reset' ? menu.sliders[slid][rows[row]] : 0;
          style(`menuRow${row}`, 'backgroundSize', `${value}% 100%`);
          selected(`menuRow${row}`, row === menu.row && row < rows.length);
        }
        hide('menuTeams', menu.panel !== 'teams');
        hide('menuControls', menu.panel !== 'controls');
        set('menuHint', menu.listening ? LISTENING_HINT : MENU_HINTS[menu.panel]);
        state.rosters.forEach((roster, team) => {
          set(`teamName${team}`, ROSTER.teams[team]);
          roster.forEach((_, row) => set(`teamPlayer${team}${row}`, teamLine(state, team, row)));
        });
      }

      // The pause menu (`ui.pauseMenu`), while paused: its buttons with the highlight on one, or the panel one of them
      // opened, the hint line, and the scoreboard: each team by quarter, with overtime as one more column.
      const pause = ui.paused ? ui.pauseMenu : null;
      if (pause) {
        const rows = pauseRows(pause);
        if (pause.panel !== lastPause) delete shown.announce;   // a panel opened or closed: say so, even in the same words
        hide('pauseList', !rows.length || pause.panel === 'keys');
        classed('pauseList', pause.panel);
        for (let row = 0; row < PAUSE_SLOTS; row++) {
          hide(`pauseRow${row}`, row >= rows.length);
          if (row < rows.length && pause.panel !== 'keys') set(`pauseRow${row}`, pauseText(state, pause, row, ui.quality, ui.camera, ui.prefs, ui.hasVoice));
          selected(`pauseRow${row}`, row === pause.row && row < rows.length);
        }
        hide('pauseSubs', pause.panel !== 'subs');
        hide('pauseControls', pause.panel !== 'controls');
        hide('pauseAsk', pause.panel !== 'quit');
        set('pauseHint', pause.listening ? LISTENING_HINT : PAUSE_HINTS[pause.panel]);
        const extra = state.quarter > CLOCK.quarters;
        hide('pbOtHead', !extra);
        for (const team of [0, 1]) {
          const periods = state.byQuarter[team];
          set(`pbAbbr${team}`, ROSTER.abbr[team]);
          for (let q = 0; q < CLOCK.quarters; q++) {
            set(`pbQ${team}${q}`, q < state.quarter ? String(periods[q] ?? 0) : '–');
            classed(`pbQ${team}${q}`, q === state.quarter - 1 ? 'live' : '');
          }
          hide(`pbOt${team}`, !extra);
          if (extra) set(`pbOt${team}`, String(periods.slice(CLOCK.quarters).reduce((sum, points) => sum + points, 0)));
          set(`pbTotal${team}`, String(state.score[team]));
          set(`pbFouls${team}`, String(state.teamFouls[team]));
          set(`pbTimeouts${team}`, String(state.timeouts[team]));
        }
        set('pbPeriod', periodWord(state.quarter));
        set('pbClock', clockText(state.gameClock));
        set('pbShot', `SHOT ${Math.ceil(state.shotClock)}`);
      }
      lastPause = pause?.panel;

      // The Keys panel, over whichever menu opened it, and the keys as they are now on both Controls panels and on
      // the line under the court.
      const keys = ui.keys ?? DEFAULT_KEYS, keysPanel = menu?.panel === 'keys' ? menu : pause?.panel === 'keys' ? pause : null;
      hide('keyRows', !keysPanel);
      if (keysPanel) for (let row = 0; row < KEY_ROWS.length; row++) {
        set(`keyRow${row}`, keysText(keys, row, keysPanel));
        selected(`keyRow${row}`, row === keysPanel.row);
        classed(`keyRow${row}`, keysPanel.listening && row === keysPanel.row ? 'listening' : '');
      }
      controlsLines(keys).forEach(([label, words], i) => {
        if (i >= CONTROL_SLOTS) return;
        set(`ctlK${i}`, label); set(`ctlW${i}`, words); set(`pctlK${i}`, label); set(`pctlW${i}`, words);
      });
      set('controls', hintLine(keys));

      // The broadcast (`ui.show`, see broadcast/director.js): a banner for a big moment, a small card and the
      // commentator's caption above the scorebug, and the panels before the tip and between periods.
      const show = ui.show ?? {};
      hide('banner', !show.banner);
      if (show.banner) {
        set('bannerWords', show.banner.words); set('bannerName', show.banner.name);
        classed('banner', show.banner.team === 0 ? 'home' : 'away');
      }
      hide('lower', !show.lower);
      if (show.lower) { set('lowerTitle', show.lower.title); set('lowerLine', show.lower.lines.join(' · ')); }
      hide('replayMark', !show.replay);
      hide('caption', !show.caption);
      if (show.caption) set('caption', show.caption);
      hide('lineups', show.panel !== 'lineups');
      if (show.panel === 'lineups') for (const team of [0, 1]) {
        set(`lineupTeam${team}`, ROSTER.teams[team]);
        for (let slot = 0; slot < LINEUP_SLOTS; slot++) { hide(`lineup${team}${slot}`, slot >= state.size); if (slot < state.size) set(`lineup${team}${slot}`, lineupRow(state, team, slot)); }
      }
      const between = show.panel === 'period' || show.panel === 'half';
      hide('between', !between);
      if (between) {
        const lines = [...periodLines(state), ...(show.panel === 'half' ? halfLines(state).map(([what, a, b]) => `${a}  ·  ${what}  ·  ${b}`) : [])];
        set('betweenTitle', show.panel === 'half' ? 'HALF-TIME' : `END OF ${periodWord(state.quarter)}`);
        for (let i = 0; i < BETWEEN_SLOTS; i++) { hide(`betweenLine${i}`, i >= lines.length); if (i < lines.length) set(`betweenLine${i}`, lines[i]); }
      }
      // A simulated game's result (`ui.result`, a finished match), written out once for each new one.
      const result = ui.result ?? null;
      if (result && result !== lastResult) {
        set('simTitle', resultTitle(result));
        for (const team of [0, 1]) {
          set(`simScore${team}`, resultScore(result, team));
          set(`simTeam${team}`, ROSTER.teams[team]);
          set(`simAdvHead${team}`, ROSTER.abbr[team]);
          for (let row = 0; row < RESULT_ROWS; row++) {
            const n = result.rosters[team].length;
            const cells = row < n ? resultRow(result, team, row) : row === n ? resultTotal(result, team) : RESULT_HEAD.map(() => '');
            cells.forEach((cell, col) => set(`simBox${team}r${row}c${col}`, cell));
          }
        }
        advancedLines(result).forEach((line, row) => line.forEach((cell, col) => set(`simAdv${row}c${col}`, cell)));
      }
      lastResult = result;

      // The box score: in the pause menu, and when the match is over.
      const box = (state.phase === 'final' && !show.replay) || pause?.panel === 'box';   // a last replay plays before the final screen
      hide('boxScore', !box);
      if (box) for (const team of [0, 1]) {
        set(`boxTeam${team}`, ROSTER.teams[team]);
        for (let row = 0; row <= state.rosters[team].length; row++) {
          const cells = row < state.rosters[team].length ? boxRow(state, team, row) : boxTotal(state, team);
          cells.forEach((cell, col) => set(`box${team}r${row}c${col}`, cell));
        }
      }

      // The play your team is running, and the play list while it is open.
      const play = playOn(state, 0);
      hide('playName', !play);
      if (play) set('playName', `${play.name} · ${play.hint}`);
      const plays = ui.playList?.open ? playListRows(state) : null;
      hide('playList', !plays);
      if (plays) for (let row = 0; row < PLAY_SLOTS; row++) {
        hide(`playRow${row}`, row >= plays.length);
        if (row < plays.length) set(`playRow${row}`, plays[row]);
      }

      // The whistle: a banner during the stoppage. Screen readers hear a new call, or else a change of score.
      const banner = state.phase === 'dead' && state.call !== null && !show.replay;   // not over a replay
      if (banner) set('call', callText(state.call));
      hide('call', !banner);
      const score = `You ${state.score[0]}, opponent ${state.score[1]}`;
      if (state.call && state.call !== lastCall) set('announce', callText(state.call));
      else if (keysPanel) set('announce', keysText(keys, keysPanel.row, keysPanel));
      else if (menu) set('announce', menuRows(menu).length ? menuText(menu, menu.row, ui.quality, ui.camera, ui.prefs, ui.hasVoice) : MENU_WORDS[menu.panel]);
      else if (pause) set('announce', pauseRows(pause).length ? pauseText(state, pause, pause.row, ui.quality, ui.camera, ui.prefs, ui.hasVoice) : PAUSE_WORDS[pause.panel]);
      else if (score !== lastScore) set('announce', score);
      lastCall = state.call; lastScore = score;

      // Free throws: which attempt it is, and the meter while you are aiming.
      const ft = state.phase === 'freeThrow' ? state.freeThrow : null;
      hide('ftBox', !ft);
      if (ft) {
        const aiming = ft.stage === 'aim' && state.players[ft.shooter].team === 0;
        set('ftText', `Free throw ${Math.min(ft.total, ft.total - ft.left + 1)} of ${ft.total}`);
        hide('ftBar', !aiming);
        if (aiming) style('ftMarker', 'left', `${Math.round(ft.meter * 100)}%`);
      }

      // The shot meter: an upright bar beside the shooter, its top at `head`; the page sizes it. The fill climbs to the
      // band; once frozen, a tick or a word says how the release went.
      const m = human ? ui.meter : null;
      hide('shotMeter', !m);
      if (m) {
        style('shotMeter', 'left', pixels(m.head.x));
        style('shotMeter', 'top', pixels(m.head.y));
        style('shotFill', 'height', share(m.fill));
        hide('shotBand', !m.band);
        if (m.band) style('shotBand', 'height', share(m.band.to - m.band.from));
        set('shotLabel', m.level);
        hide('shotMark', !m.frozen);
        if (m.frozen) set('shotMark', markText(m.frozen));
        const made = m.frozen?.verdict === 'green' && !m.frozen.blocked;
        classed('shotMeter', made ? 'green' : '');
      }

      state.rosters[0].forEach((person, row) => {
        set(`roster${row}`, rosterLine(state, row, ui.pick === row));
        bar(`rosterEnergy${row}`, person.energy);
      });
      set('subNote', subNote(state));

      if (state.phase === 'final') {
        set('finalTitle', state.score[0] > state.score[1] ? 'You win' : 'You lose');
        set('finalScore', `${state.score[0]} – ${state.score[1]}`);
        set('finalPotg', potgLine(state));
      }
    },
    // name: 'start', 'pause', 'final' or null for none.
    show(name) {
      if (name === screen) return;
      screen = name;
      for (const [key, id] of Object.entries(SCREENS)) el(id).hidden = key !== name;
    },
  };
}
