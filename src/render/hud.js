import { CLOCK, FOUL, ROSTER } from '../sim/tuning.js';
import { personOf, surname } from '../sim/state.js';
import { onCourt } from '../sim/roster.js';
import { menuRows } from '../menu.js';
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
};
const SHOTS = ['', 'One shot', 'Two shots', 'Three shots'];

// The whistle as a sentence: what was called, on whom, and what follows. You are team 0.
export function callText(call) {
  const what = CALLS[call.kind] + (call.number === null ? '' : ` on ${surname(call)} (${call.number})`);
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
  const number = i => surname(state.rosters[0][i]);
  const queued = state.subQueue.filter(q => q.team === 0).map(q => `${number(q.out)} off, ${number(q.in)} on`);
  return `Automatic substitutions ${state.autoSubs[0] ? 'on' : 'off'}. ${queued.length ? `Queued: ${queued.join('; ')}.` : 'No swap queued.'}`;
}

// What the frozen shot meter says about the release. A block is never shown as a make.
const VERDICTS = { green: '✓', early: 'Early', late: 'Late', range: 'Out of range' };
const markText = frozen => (frozen.blocked ? 'Blocked' : VERDICTS[frozen.verdict]);
const pixels = value => `${Math.round(value)}px`;
const share = value => `${Math.round(value * 1000) / 10}%`;

// The start menu: the words of each entry, what the hint line says in each panel, and the two teams' lines.
const MENU_WORDS = { play: 'Play', teams: 'Teams', controls: 'Controls', settings: 'Settings' };
const MENU_HINTS = { main: '↑ ↓ choose · Enter select', settings: '↑ ↓ choose · Enter change · Esc back', teams: 'Esc back', controls: 'Esc back' };
const MENU_SLOTS = 4;   // menuRow0 to menuRow3 on the page
const TEAM_LINES = ROSTER.teams.map((_, team) => ROSTER.positions.map((position, row) =>
  `${position} · ${ROSTER.numbers[team][row]} · ${ROSTER.names[team][row]}`));

// The words of row `row` of the panel shown; the settings say their value. quality: 'high' or 'low'.
export function menuText(menu, row, quality) {
  const choice = menuRows(menu)[row];
  if (choice === 'quality') return `Quality: ${QUALITY[quality].label}`;
  if (choice === 'autoSubs') return `Automatic substitutions: ${menu.autoSubs ? 'On' : 'Off'}`;
  return MENU_WORDS[choice];
}

const BACKEND_NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL 2 (WebGPU not available)' };
const SCREENS = { start: 'screenStart', pause: 'screenPause', final: 'screenFinal' };

// The scoreboard and the start / pause / final screens. Plain HTML over the canvas.
export function createHud(doc) {
  const el = id => doc.getElementById(id);
  const shown = {};
  // Only touch the page when a value changes, so screen readers are not spammed every frame.
  const put = (id, value, write) => {
    if (shown[id] === value) return;
    shown[id] = value;
    write(el(id), value);
  };
  const set = (id, text) => put(id, text, (e, v) => { e.textContent = v; });
  const hide = (id, hidden) => put(`${id}.hidden`, hidden, () => { el(id).hidden = hidden; });
  const bar = (id, energy) => put(id, Math.round(energy * 100) / 100, (e, v) => { e.value = v; });
  const style = (id, key, value) => put(`${id}.${key}`, value, () => { el(id).style[key] = value; });
  let screen, lastCall = null, lastScore;

  return {
    // `ui` is what the page itself knows: whether the game is paused, which roster row is selected, and for the
    // corner label the frame rate and the quality level ('high' or 'low'), and the shot meter with the page position
    // of its top (`head`), or null for none.
    update(state, backend, ui = { paused: false, pick: null }) {
      set('score0', String(state.score[0]));
      set('score1', String(state.score[1]));
      set('fouls0', `Fouls ${state.teamFouls[0]}`);
      set('fouls1', `Fouls ${state.teamFouls[1]}`);
      set('who', whoText(state));
      bar('energy', personOf(state, state.players[state.controlled]).energy);
      set('quarter', periodLabel(state.quarter));
      set('gameClock', clockText(state.gameClock));
      set('shotClock', String(Math.ceil(state.shotClock)));
      const level = ui.quality ? ` · ${QUALITY[ui.quality].label}` : '';
      set('backend', BACKEND_NAMES[backend] + level + (typeof ui.fps === 'number' ? ` · ${Math.round(ui.fps)} fps` : ''));

      // The start menu (`ui.menu`), before the match: the rows of the panel shown with the bar on one, or a panel with
      // no rows (Teams, Controls), and the hint line. Screen readers hear the selected row, or the panel's name.
      const menu = state.phase === 'start' ? ui.menu : null;
      if (menu) {
        const rows = menuRows(menu);
        hide('menuList', !rows.length);
        put('menuList.class', menu.panel, (_, v) => { el('menuList').className = v; });
        for (let row = 0; row < MENU_SLOTS; row++) {
          hide(`menuRow${row}`, row >= rows.length);
          if (row < rows.length) set(`menuRow${row}`, menuText(menu, row, ui.quality));
          put(`menuRow${row}.selected`, String(row === menu.row && row < rows.length), (_, v) => { el(`menuRow${row}`).ariaSelected = v; });
        }
        hide('menuTeams', menu.panel !== 'teams');
        hide('menuControls', menu.panel !== 'controls');
        set('menuHint', MENU_HINTS[menu.panel]);
        TEAM_LINES.forEach((lines, team) => {
          set(`teamName${team}`, ROSTER.teams[team]);
          lines.forEach((line, row) => set(`teamPlayer${team}${row}`, line));
        });
      }

      // The whistle: a banner during the stoppage. Screen readers hear a new call, or else a change of score.
      const banner = state.phase === 'dead' && state.call !== null;
      if (banner) set('call', callText(state.call));
      hide('call', !banner);
      const score = `You ${state.score[0]}, opponent ${state.score[1]}`;
      if (state.call && state.call !== lastCall) set('announce', callText(state.call));
      else if (menu) set('announce', menuRows(menu).length ? menuText(menu, menu.row, ui.quality) : MENU_WORDS[menu.panel]);
      else if (score !== lastScore) set('announce', score);
      lastCall = state.call; lastScore = score;

      // Free throws: which attempt it is, and the meter while you are aiming.
      const ft = state.phase === 'freeThrow' ? state.freeThrow : null;
      hide('ftBox', !ft);
      if (ft) {
        const aiming = ft.stage === 'aim' && state.players[ft.shooter].team === 0;
        set('ftText', `Free throw ${Math.min(ft.total, ft.total - ft.left + 1)} of ${ft.total}`);
        hide('ftBar', !aiming);
        if (aiming) put('ftMarker', `${Math.round(ft.meter * 100)}%`, (e, v) => { e.style.left = v; });
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
        put('shotMeter.class', made ? 'green' : '', (_, v) => { el('shotMeter').className = v; });
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
