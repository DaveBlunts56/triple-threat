import { CLOCK, DIFFICULTY, FOUL, ROSTER, TIMEOUT } from '../sim/tuning.js';
import { personOf, surname } from '../sim/state.js';
import { onCourt } from '../sim/roster.js';
import { menuRows } from '../menu.js';
import { pauseRows } from '../pause.js';
import { playListRows } from '../playlist.js';
import { playOn } from '../sim/plays.js';
import { QUALITY } from './quality.js';

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
  const where = onCourt(state, 0).includes(row) ? `on court · ${fouls}` : person.fouls >= FOUL.limit ? 'fouled out' : `bench · ${fouls}`;
  return `${row + 1} · ${person.position} · ${person.name} · No. ${person.number} · ${where}${picked ? ' · selected' : ''}`;
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
const MENU_WORDS = { play: 'Play', teams: 'Teams', controls: 'Controls', settings: 'Settings' };
const MODE_WORDS = { 3: 'Mode: 3 on 3', 5: 'Mode: 5 on 5' };
const MENU_HINTS = { main: '↑ ↓ choose · Enter select', settings: '↑ ↓ choose · Enter change · Esc back', teams: 'Esc back', controls: 'Esc back' };
const MENU_SLOTS = 5;   // menuRow0 to menuRow4 on the page
const TEAM_LINES = ROSTER.teams.map((_, team) => ROSTER.positions.map((position, row) =>
  `${position} · ${ROSTER.numbers[team][row]} · ${ROSTER.names[team][row]}`));

const CAMERA_WORDS = { '2k': 'Camera: 2K', broadcast: 'Camera: Broadcast' };

// The words of row `row` of the panel shown; the settings say their value. quality: one of QUALITY.order. camera:
// '2k' or 'broadcast'.
export function menuText(menu, row, quality, camera = '2k') {
  const choice = menuRows(menu)[row];
  if (choice === 'camera') return CAMERA_WORDS[camera];
  if (choice === 'difficulty') return `Difficulty: ${DIFFICULTY.label[menu.difficulty]}`;
  if (choice === 'quality') return `Quality: ${QUALITY[quality].label}`;
  if (choice === 'autoSubs') return `Automatic substitutions: ${menu.autoSubs ? 'On' : 'Off'}`;
  if (choice === 'mode') return MODE_WORDS[menu.size];
  return MENU_WORDS[choice];
}

// The pause menu: the words of each button, and what the hint line says in each panel.
const PAUSE_WORDS = { resume: 'Resume', subs: 'Substitutions', controls: 'Controls', settings: 'Settings', quit: 'Quit to main menu',
  stay: 'No, keep playing', leave: 'Yes, quit' };
const PAUSE_HINTS = { main: '↑ ↓ choose · Enter select · Esc resume', settings: '↑ ↓ choose · Enter change · Esc back',
  subs: '1 to 8 swap two players · A automatic substitutions · Esc back', controls: 'Esc back', quit: '↑ ↓ choose · Enter select · Esc back' };
const PLAY_SLOTS = 10;    // playRow0 to playRow9 on the page
const PAUSE_SLOTS = 5;   // pauseRow0 to pauseRow4 on the page

// The words of row `row` of the pause menu's panel shown; the settings say their value.
export function pauseText(state, menu, row, quality, camera = '2k') {
  const choice = pauseRows(menu)[row];
  if (choice === 'camera') return CAMERA_WORDS[camera];
  if (choice === 'difficulty') return `Difficulty: ${DIFFICULTY.label[state.difficulty]}`;
  if (choice === 'quality') return `Quality: ${QUALITY[quality].label}`;
  if (choice === 'autoSubs') return `Automatic substitutions: ${state.autoSubs[0] ? 'On' : 'Off'}`;
  return PAUSE_WORDS[choice];
}

// The period as a scoreboard names it: 1ST to 4TH, then OT1, OT2.
export const periodWord = quarter => (quarter <= CLOCK.quarters ? ['1ST', '2ND', '3RD', '4TH'][quarter - 1] : `OT${quarter - CLOCK.quarters}`);

const SHOT_LOW = 5;   // seconds on the shot clock from which it flashes
const BACKEND_NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL 2 (WebGPU not available)', webgl2chosen: 'WebGL 2' };
const SCREENS = { start: 'screenStart', pause: 'screenPause', final: 'screenFinal' };

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
  let screen, lastCall = null, lastScore, lastPanel, lastPause;
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
        classed(`fouls${team}`, state.teamFouls[team] >= FOUL.bonus ? 'fouls bonus' : 'fouls');
        set(`timeouts${team}`, '●'.repeat(state.timeouts[team]) + '○'.repeat(Math.max(0, TIMEOUT.each - state.timeouts[team])));
        classed(`bugTeam${team}`, `bugTeam ${side}${live && state.possession === team ? ' has' : ''}`);
      }
      classed('hud', bug.shines ? (bug.shines % 2 ? 'shineA' : 'shineB') : '');
      classed('shotClock', live && state.shotClock <= SHOT_LOW ? 'low' : '');
      set('who', whoText(state));
      // His surname under the player you control, at the place on the page the game says his feet are.
      hide('nameTag', !ui.feet);
      if (ui.feet) {
        set('nameTag', surname(personOf(state, state.players[state.controlled])));
        style('nameTag', 'left', pixels(ui.feet.x));
        style('nameTag', 'top', pixels(ui.feet.y));
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
        hide('menuList', !rows.length);
        classed('menuList', menu.panel);
        for (let row = 0; row < MENU_SLOTS; row++) {
          hide(`menuRow${row}`, row >= rows.length);
          if (row < rows.length) set(`menuRow${row}`, menuText(menu, row, ui.quality, ui.camera));
          selected(`menuRow${row}`, row === menu.row && row < rows.length);
        }
        hide('menuTeams', menu.panel !== 'teams');
        hide('menuControls', menu.panel !== 'controls');
        set('menuHint', MENU_HINTS[menu.panel]);
        TEAM_LINES.forEach((lines, team) => {
          set(`teamName${team}`, ROSTER.teams[team]);
          lines.forEach((line, row) => set(`teamPlayer${team}${row}`, line));
        });
      }

      // The pause menu (`ui.pauseMenu`), while paused: its buttons with the highlight on one, or the panel one of them
      // opened, the hint line, and the scoreboard: each team by quarter, with overtime as one more column.
      const pause = ui.paused ? ui.pauseMenu : null;
      if (pause) {
        const rows = pauseRows(pause);
        if (pause.panel !== lastPause) delete shown.announce;   // a panel opened or closed: say so, even in the same words
        hide('pauseList', !rows.length);
        for (let row = 0; row < PAUSE_SLOTS; row++) {
          hide(`pauseRow${row}`, row >= rows.length);
          if (row < rows.length) set(`pauseRow${row}`, pauseText(state, pause, row, ui.quality, ui.camera));
          selected(`pauseRow${row}`, row === pause.row && row < rows.length);
        }
        hide('pauseSubs', pause.panel !== 'subs');
        hide('pauseControls', pause.panel !== 'controls');
        hide('pauseAsk', pause.panel !== 'quit');
        set('pauseHint', PAUSE_HINTS[pause.panel]);
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
      const banner = state.phase === 'dead' && state.call !== null;
      if (banner) set('call', callText(state.call));
      hide('call', !banner);
      const score = `You ${state.score[0]}, opponent ${state.score[1]}`;
      if (state.call && state.call !== lastCall) set('announce', callText(state.call));
      else if (menu) set('announce', menuRows(menu).length ? menuText(menu, menu.row, ui.quality, ui.camera) : MENU_WORDS[menu.panel]);
      else if (pause) set('announce', pauseRows(pause).length ? pauseText(state, pause, pause.row, ui.quality, ui.camera) : PAUSE_WORDS[pause.panel]);
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
      const m = ui.meter;
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
