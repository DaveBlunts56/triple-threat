import { CLOCK, FOUL } from '../sim/tuning.js';
import { personOf } from '../sim/state.js';
import { onCourt } from '../sim/roster.js';

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
  const what = CALLS[call.kind] + (call.number === null ? '' : ` on ${call.number}`);
  return `${what}. ${call.shots ? SHOTS[call.shots] : call.ball === 0 ? 'Your ball' : "Opponent's ball"}`;
}

// One row of the pause screen: person `row` of your team.
export function rosterLine(state, row, picked) {
  const person = state.rosters[0][row];
  const fouls = `${person.fouls} foul${person.fouls === 1 ? '' : 's'}`;
  const where = onCourt(state, 0).includes(row) ? `on court · ${fouls}` : person.fouls >= FOUL.limit ? 'fouled out' : `bench · ${fouls}`;
  return `${row + 1} · No. ${person.number} · ${where}${picked ? ' · selected' : ''}`;
}

export function subNote(state) {
  const number = i => `No. ${state.rosters[0][i].number}`;
  const queued = state.subQueue.filter(q => q.team === 0).map(q => `${number(q.out)} off, ${number(q.in)} on`);
  return `Automatic substitutions ${state.autoSubs[0] ? 'on' : 'off'}. ${queued.length ? `Queued: ${queued.join('; ')}.` : 'No swap queued.'}`;
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
  let screen, lastCall = null, lastScore;

  return {
    // `ui` is what the page itself knows: whether the game is paused and which roster row is selected.
    update(state, backend, ui = { paused: false, pick: null }) {
      set('score0', String(state.score[0]));
      set('score1', String(state.score[1]));
      set('fouls0', `Fouls ${state.teamFouls[0]}`);
      set('fouls1', `Fouls ${state.teamFouls[1]}`);
      bar('energy', personOf(state, state.players[state.controlled]).energy);
      set('quarter', periodLabel(state.quarter));
      set('gameClock', clockText(state.gameClock));
      set('shotClock', String(Math.ceil(state.shotClock)));
      set('backend', BACKEND_NAMES[backend] + (typeof ui.fps === 'number' ? ` · ${Math.round(ui.fps)} fps` : ''));

      // The whistle: a banner during the stoppage. Screen readers hear a new call, or else a change of score.
      const banner = state.phase === 'dead' && state.call !== null;
      if (banner) set('call', callText(state.call));
      hide('call', !banner);
      const score = `You ${state.score[0]}, opponent ${state.score[1]}`;
      if (state.call && state.call !== lastCall) set('announce', callText(state.call));
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
