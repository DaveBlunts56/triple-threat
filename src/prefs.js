// The settings the game keeps from one visit to the next, in the browser's own storage. Nothing about a match is kept.
// Everything here is safe to call with no storage at all, or with one that throws: the game then starts from the
// defaults every time.
import { QUALITY } from './render/quality.js';
import { DIFFICULTY, MATCH } from './sim/tuning.js';
import { SLIDERS, STYLE_NAMES, defaultSliders } from './sim/styles.js';

export const PREFS_KEY = 'tripleThreat.settings.v1';

// quality: null means the game chooses its own level. home: the team at home, whose arena a match is in. keys: { action: key }, what differs from the default keys.
// play, watch: the style and quarter length each starts at (Play on Arcade's 3 minutes, as before; Watch on
// Simulation's 12). simulate: Simulate's quarter length (it is always Simulation). sliders: each style's nine.
const f = Object.freeze;
export const DEFAULT_PREFS = f({ quality: null, camera: '2k', difficulty: 'allstar', size: 3, home: 0,
  autoSubs: true, commentary: 'voice', replays: true, sound: 'full', keys: f({}),
  play: f({ style: 'arcade', minutes: 3 }), watch: f({ style: 'sim', minutes: 12 }), simulate: f({ minutes: 12 }),
  sliders: f({ arcade: f(defaultSliders()), sim: f(defaultSliders()) }) });

const oneOf = list => value => list.includes(value);
const flag = value => typeof value === 'boolean';
const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);
// What each setting may be. A saved value that fails its check is dropped on its own; the others still apply.
const VALID = {
  quality: value => value === null || QUALITY.order.includes(value),
  camera: oneOf(['2k', 'broadcast']),
  difficulty: oneOf(DIFFICULTY.order),
  size: oneOf([3, 5]),
  home: oneOf([0, 1]),
  autoSubs: flag, replays: flag,
  commentary: oneOf(['voice', 'captions', 'off']),
  sound: oneOf(['full', 'quiet', 'off']),
  keys: isObject,
};
// And the settings kept in groups, each value checked on its own.
const GROUPS = {
  play: { style: oneOf(STYLE_NAMES), minutes: oneOf(MATCH.minutes) },
  watch: { style: oneOf(STYLE_NAMES), minutes: oneOf(MATCH.minutes) },
  simulate: { minutes: oneOf(MATCH.minutes) },
};
const sliderValue = value => Number.isInteger(value) && value >= 0 && value <= 100;

// The defaults, as a fresh set the caller may change.
const fresh = () => ({ ...DEFAULT_PREFS, keys: {}, play: { ...DEFAULT_PREFS.play }, watch: { ...DEFAULT_PREFS.watch }, simulate: { ...DEFAULT_PREFS.simulate },
  sliders: { arcade: { ...DEFAULT_PREFS.sliders.arcade }, sim: { ...DEFAULT_PREFS.sliders.sim } } });

// The browser's storage, or null where there is none or even asking for it throws (some browsers, for a file opened
// from disk or in a private window).
export const storageOf = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

// The saved settings, with the default for whatever is missing or not understood. Never throws. A quarter length saved
// before there were styles (a `minutes` of its own) is Play's.
export function readPrefs(storage) {
  const prefs = fresh();
  let saved = null;
  try { saved = JSON.parse(storage?.getItem(PREFS_KEY) ?? 'null'); } catch { /* not there, not readable, or not JSON */ }
  if (!isObject(saved)) return prefs;
  for (const key of Object.keys(VALID)) if (key in saved && VALID[key](saved[key])) prefs[key] = key === 'keys' ? { ...saved.keys } : saved[key];
  if (GROUPS.play.minutes(saved.minutes)) prefs.play.minutes = saved.minutes;
  for (const [group, checks] of Object.entries(GROUPS)) if (isObject(saved[group]))
    for (const [key, ok] of Object.entries(checks)) if (key in saved[group] && ok(saved[group][key])) prefs[group][key] = saved[group][key];
  if (isObject(saved.sliders)) for (const style of STYLE_NAMES) if (isObject(saved.sliders[style]))
    for (const { key } of SLIDERS) if (sliderValue(saved.sliders[style][key])) prefs.sliders[style][key] = saved.sliders[style][key];
  return prefs;
}

// Saves `prefs`. Returns whether it was kept: false with no storage, or one that refuses.
export function writePrefs(storage, prefs) {
  try { storage.setItem(PREFS_KEY, JSON.stringify(prefs)); return true; } catch { return false; }
}
