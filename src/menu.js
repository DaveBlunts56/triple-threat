import { startMatch } from './sim/rules.js';
import { MATCH, nextDifficulty, nextMinutes } from './sim/tuning.js';
import { setLength } from './sim/state.js';
import { SLIDERS, defaultSliders, setStyle } from './sim/styles.js';
import { DEFAULT_KEYS, KEY_ROWS, keysPanelKey } from './keys.js';
import { DEFAULT_PREFS } from './prefs.js';
import { pickable } from './sim/teams.js';

const SLIDER_ROWS = Object.freeze([...SLIDERS.map(s => s.key), 'reset']);
export const MENU = Object.freeze({
  main: ['exhibition', 'tutorial', 'myleague', 'mode', 'controls', 'settings'],
  teamSelect: [],   // a screen of its own (see selectKey), with no rows
  settings: ['graphics', 'autoSubs', 'camera', 'difficulty', 'styles', 'commentary', 'replays', 'sound', 'keys'],
  graphics: ['quality', 'renderer', 'info'],
  styles: ['playStyle', 'playMinutes', 'watchStyle', 'watchMinutes', 'simulateMinutes', 'arcadeSliders', 'simSliders'],
  arcadeSliders: SLIDER_ROWS, simSliders: SLIDER_ROWS,
  keys: KEY_ROWS,
});

// size: the mode chosen: 3 for 3 on 3, 5 for 5 on 5. dev: the dev teams may be picked (the link ends #dev). select:
// the Team Select screen's choice, { away, home, side }: the two teams by id, and the side your controller is on
// ('away', 'home', or 'none' to watch). difficulty: the level chosen, one of DIFFICULTY.order. play, watch: the style and
// quarter length each starts at; simulate: Simulate's quarter length; sliders: each style's nine
// (see prefs.js). listening: on the Keys panel, the next key pressed goes on the highlighted action. trail: the panels
// a panel inside Settings was opened from, with their rows, for Esc. Every choice starts as `prefs` has it: what was
// saved the last time.
export const createMenu = (prefs = DEFAULT_PREFS, dev = false) => ({ panel: 'main', row: 0, autoSubs: prefs.autoSubs, size: prefs.size, dev, select: pickableSelect({ ...prefs.select }, dev),
  difficulty: prefs.difficulty, play: { ...prefs.play }, watch: { ...prefs.watch }, simulate: { ...prefs.simulate },
  sliders: { arcade: { ...prefs.sliders.arcade }, sim: { ...prefs.sliders.sim } }, from: 0, trail: [], listening: false });

export const menuRows = menu => MENU[menu.panel] ?? [];

// The settings the page itself changes when their row is chosen: it knows the renderer, the voice and what is saved.
export const PAGE_ROWS = Object.freeze(['quality', 'renderer', 'camera', 'commentary', 'replays', 'sound', 'info']);

const SLIDER_PANELS = Object.freeze({ arcadeSliders: 'arcade', simSliders: 'sim' });
const LEFT = new Set(['ArrowLeft', 'KeyA']), RIGHT = new Set(['ArrowRight', 'KeyD']);
// The quarter length before `minutes`, going round from the shortest to the longest.
const previousMinutes = minutes => MATCH.minutes[(MATCH.minutes.indexOf(minutes) + MATCH.minutes.length - 1) % MATCH.minutes.length];

// Steps the choice on row `choice` of the Game styles panel, forward (1) or back (-1).
function stepStyleRow(menu, choice, way) {
  const [mode, what] = { playStyle: ['play', 'style'], playMinutes: ['play', 'minutes'], watchStyle: ['watch', 'style'], watchMinutes: ['watch', 'minutes'],
    simulateMinutes: ['simulate', 'minutes'] }[choice] ?? [];
  if (!mode) return;
  if (what === 'style') menu[mode].style = menu[mode].style === 'arcade' ? 'sim' : 'arcade';
  else menu[mode].minutes = way > 0 ? nextMinutes(menu[mode].minutes) : previousMinutes(menu[mode].minutes);
}

// Opens panel `panel` from the one shown, remembering where to come back to.
function open(menu, panel) {
  menu.trail.push({ panel: menu.panel, row: menu.row });
  Object.assign(menu, { panel, row: 0 });
}

// What a Team Select choice (`select`, see createMenu) makes: the match's teams by id (`teams`, the one you play first,
// or the visitors first when you watch), the side at home in it (`home`, 0 or 1), and whether you play or watch.
export function matchTeams({ away, home, side }) {
  if (side === 'home') return { teams: [home, away], home: 0, mode: 'play' };
  return { teams: [away, home], home: 1, mode: side === 'away' ? 'play' : 'watch' };
}

// The controller's places, left to right, and the team after (`way` 1) or before (-1) team `id` among those that may
// be picked (`ids`), round the end.
const SIDES = Object.freeze(['away', 'none', 'home']);
const stepTeam = (ids, id, way) => ids[(Math.max(0, ids.indexOf(id)) + way + ids.length) % ids.length];

// A Team Select choice with the teams it may hold (`dev`: the dev teams too): one that names a team it may not is
// given the first two that it may, in the same places.
export function pickableSelect(select, dev = false) {
  const ids = pickable(dev);
  if (ids.includes(select.away) && ids.includes(select.home) && select.away !== select.home) return select;
  return { ...select, away: ids[1], home: ids[0] };
}

// One key on the Team Select screen. ← → move your controller between the away side, the middle (to watch) and the
// home side. ↑ ↓ change the team on your controller's side, or the away team's when you watch: a team the other side
// has changes places with it. R picks two teams at random (`random`: 0 to 1). Enter or Space start the match; Esc or
// Backspace go back to the main list. Returns 'exhibition' to start, 'select' when the choice changed, else null.
function selectKey(menu, code, random) {
  const select = menu.select, ids = pickable(menu.dev), way = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }[code], step = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1 }[code];
  if (way) {
    const at = Math.min(SIDES.length - 1, Math.max(0, SIDES.indexOf(select.side) + way));
    if (SIDES[at] === select.side) return null;
    select.side = SIDES[at];
    return 'select';
  }
  if (step) {
    const mine = select.side === 'home' ? 'home' : 'away', other = mine === 'home' ? 'away' : 'home', was = select[mine];
    select[mine] = stepTeam(ids, was, step);
    if (select[mine] === select[other]) select[other] = was;
    return 'select';
  }
  if (code === 'KeyR' && ids.length > 1) {
    const a = Math.floor(random() * ids.length) % ids.length;
    select.away = ids[a];
    select.home = ids[(a + 1 + Math.floor(random() * (ids.length - 1))) % ids.length];
    return 'select';
  }
  if (code === 'Enter' || code === 'Space') return 'exhibition';
  if (code === 'Escape' || code === 'Backspace') { menu.panel = 'main'; menu.row = menu.from; }
  return null;
}

// One key on the menu. Returns 'exhibition', 'select' (the Team Select choice changed), 'simulate', a row the page
// keeps (see PAGE_ROWS) or 'keys' (the keys were changed) when the page has something to do, else null. `keys` is
// the table the Keys panel changes. On the Game styles panel and a slider panel ← and → step a choice, and move a
// slider by 5. `random`: where Team Select's random teams come from.
export function menuKey(menu, code, keys = { ...DEFAULT_KEYS }, random = Math.random) {
  if (menu.panel === 'teamSelect') return selectKey(menu, code, random);
  if (menu.panel === 'keys') {
    const did = keysPanelKey(menu, code, keys);
    if (did === 'back') { menu.panel = 'settings'; menu.row = MENU.settings.indexOf('keys'); }
    return did === 'changed' ? 'keys' : null;
  }
  const rows = menuRows(menu), choice = rows[menu.row], style = SLIDER_PANELS[menu.panel];
  if (code === 'ArrowDown' || code === 'KeyS') { if (rows.length) menu.row = (menu.row + 1) % rows.length; }
  else if (code === 'ArrowUp' || code === 'KeyW') { if (rows.length) menu.row = (menu.row + rows.length - 1) % rows.length; }
  else if (LEFT.has(code) || RIGHT.has(code)) {
    const way = RIGHT.has(code) ? 1 : -1;
    if (menu.panel === 'styles') stepStyleRow(menu, choice, way);
    else if (style && choice !== 'reset') menu.sliders[style][choice] = Math.min(100, Math.max(0, menu.sliders[style][choice] + 5 * way));
  } else if (code === 'Enter' || code === 'Space') {
    if (menu.panel === 'main') {
      if (choice === 'simulate' || choice === 'tutorial' || choice === 'myleague') return choice;
      if (choice === 'mode') { menu.size = menu.size === 3 ? 5 : 3; return null; }
      if (choice === 'exhibition') { menu.from = menu.row; menu.panel = 'teamSelect'; menu.row = 0; return null; }
      menu.from = menu.row; menu.panel = choice; menu.row = 0;
    } else if (menu.panel === 'styles') {
      if (SLIDER_PANELS[choice]) open(menu, choice); else stepStyleRow(menu, choice, 1);
    } else if (style) {
      if (choice === 'reset') menu.sliders[style] = defaultSliders();
    } else if (PAGE_ROWS.includes(choice)) return choice;
    else if (choice === 'autoSubs') menu.autoSubs = !menu.autoSubs;
    else if (choice === 'difficulty') menu.difficulty = nextDifficulty(menu.difficulty);
    else if (choice === 'styles' || choice === 'graphics') open(menu, choice);
    else if (choice === 'keys') Object.assign(menu, { panel: 'keys', row: 0, listening: false });
  } else if ((code === 'Escape' || code === 'Backspace') && menu.panel !== 'main') {
    const back = menu.trail.pop();
    if (back) Object.assign(menu, back); else { menu.panel = 'main'; menu.row = menu.from; }
  }
  return null;
}

// A key on a simulated game's result: 'simulate' (Enter or Space: another game), 'back' (Esc or Backspace: to the menu),
// or null.
export const resultKey = code => (code === 'Enter' || code === 'Space' ? 'simulate' : code === 'Escape' || code === 'Backspace' ? 'back' : null);

// The mouse is over row `row` of the panel shown.
export function menuPoint(menu, row) {
  if (row >= 0 && row < menuRows(menu).length && !menu.listening) menu.row = row;
}

// Whether the mouse may act on row `row` of the panel shown: only before the match, not under a simulated game's
// result, and only on a row the panel has.
export const menuHasRow = (game, row) => game.state.phase === 'start' && !game.result && row < menuRows(game.menu).length;

// Starts a match from the menu or the final screen, between the teams Team Select has (see matchTeams): `mode` 'play'
// (yours against the computer) or 'watch' (the computer against itself, nobody's), as Team Select's side has it unless
// given, at that mode's style and quarter length, with that style's sliders. `game` is { state, menu, ... };
// `newMatch(size, teams)` makes a match. Returns the mode.
export function startFromMenu(game, keyboard, newMatch, mode = null) {
  const pick = matchTeams(game.menu.select);
  mode ??= pick.mode;
  // A new match when the last one is over, or when the one waiting is not of the size or the teams the menu now shows.
  const same = (game.state.ids ?? [0, 1]).join() === pick.teams.join();
  if (game.state.phase === 'final' || game.state.size !== game.menu.size || !same) game.state = newMatch(game.menu.size, pick.teams);
  const { style, minutes } = game.menu[mode];
  game.state.humans = mode === 'watch' ? [] : [0];
  game.state.home = pick.home;
  setLength(game.state, minutes);
  setStyle(game.state, style, game.menu.sliders[style]);
  startMatch(game.state);
  game.state.autoSubs[0] = mode === 'watch' || game.menu.autoSubs;
  game.state.difficulty = game.menu.difficulty;
  keyboard.drop();   // a key still held stays unseen in the match, through the jump ball, until it is let go
  return mode;
}
