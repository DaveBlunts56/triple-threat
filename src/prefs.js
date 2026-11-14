// The settings the game keeps from one visit to the next, in the browser's own storage. Nothing about a match is kept.
// Everything here is safe to call with no storage at all, or with one that throws: the game then starts from the
// defaults every time.
import { QUALITY } from './render/quality.js';
import { DIFFICULTY, MATCH } from './sim/tuning.js';

export const PREFS_KEY = 'tripleThreat.settings.v1';

// quality: null means the game chooses its own level. keys: { action: key }, what differs from the default keys.
export const DEFAULT_PREFS = Object.freeze({ quality: null, camera: '2k', difficulty: 'allstar', minutes: 3, size: 3,
  autoSubs: true, commentary: 'voice', replays: true, sound: 'full', keys: Object.freeze({}) });

const oneOf = list => value => list.includes(value);
const flag = value => typeof value === 'boolean';
// What each setting may be. A saved value that fails its check is dropped on its own; the others still apply.
const VALID = {
  quality: value => value === null || QUALITY.order.includes(value),
  camera: oneOf(['2k', 'broadcast']),
  difficulty: oneOf(DIFFICULTY.order),
  minutes: oneOf(MATCH.minutes),
  size: oneOf([3, 5]),
  autoSubs: flag, replays: flag,
  commentary: oneOf(['voice', 'captions', 'off']),
  sound: oneOf(['full', 'quiet', 'off']),
  keys: value => typeof value === 'object' && value !== null && !Array.isArray(value),
};

// The browser's storage, or null where there is none or even asking for it throws (some browsers, for a file opened
// from disk or in a private window).
export const storageOf = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

// The saved settings, with the default for whatever is missing or not understood. Never throws.
export function readPrefs(storage) {
  const prefs = { ...DEFAULT_PREFS, keys: {} };
  let saved = null;
  try { saved = JSON.parse(storage?.getItem(PREFS_KEY) ?? 'null'); } catch { /* not there, not readable, or not JSON */ }
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return prefs;
  for (const key of Object.keys(VALID)) if (key in saved && VALID[key](saved[key])) prefs[key] = key === 'keys' ? { ...saved.keys } : saved[key];
  return prefs;
}

// Saves `prefs`. Returns whether it was kept: false with no storage, or one that refuses.
export function writePrefs(storage, prefs) {
  try { storage.setItem(PREFS_KEY, JSON.stringify(prefs)); return true; } catch { return false; }
}
