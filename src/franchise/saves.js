// Each local slot owns its checkpoint. IndexedDB commits its data, metadata and revision together.
// Import always creates a new slot. Two tabs that open the same revision cannot overwrite one another.
import { clubs, advanceBracket, nextSeed, schedule } from './calendar.js';
import { checkBox, createLeague, involved } from './league.js';
import { careerId, directions, seedCareers } from './development.js';
import { KEYS } from '../sim/overall.js';
import { PLAYBOOKS, COACHES } from '../sim/teams.js';
import { STAT_KEYS } from '../sim/stats.js';

const valid = condition => { if (!condition) throw new Error('The franchise save contains inconsistent data.'); };
const unsigned = n => Number.isSafeInteger(n) && n >= 0;
const dictionary = obj => obj && typeof obj === 'object' && !Array.isArray(obj);
const legacyIds = new Map(Object.values(clubs).flatMap(t => t.players.map(p => [t.key + '/' + p.number, careerId(p)])));
const playerIds = new Set(legacyIds.values());

function translate(id) {
  valid(legacyIds.has(id));
  return legacyIds.get(id);
}

function migrateSeason(season) {
  for (const field of ['stats','postseason']) {
    if (season[field]) season[field] = Object.fromEntries(Object.entries(season[field]).map(([id,line]) => [translate(id), line]));
  }
}

function migrate(data) {
  for (const season of [...data.history, data.season]) migrateSeason(season);
  data.moods = Object.fromEntries(Object.entries(data.moods).map(([id,m]) => [translate(id),m]));
  data.rivals = Object.fromEntries(Object.entries(data.rivals).map(([pair,e]) =>
    [pair.split('|').map(translate).sort().join('|'), { ...e, by: translate(e.by) }]));
  seedCareers(data);
  data.version = 2;
}

function checkCareers(data) {
  valid(dictionary(data.careers) && Object.keys(data.careers).length === playerIds.size && dictionary(data.staff));
  for (const id of playerIds) {
    const p = data.careers[id];
    valid(p && unsigned(p.age) && p.age >= 19 && p.age <= 34 + data.season.year &&
      Number.isFinite(p.potential) && p.potential >= 0 && p.potential <= 1 && Number.isInteger(p.change) &&
      KEYS.every(k => Number.isInteger(p.ratings?.[k]) && p.ratings[k] >= 0 && p.ratings[k] <= 100));
  }
  for (const club of Object.values(clubs)) {
    const staff = data.staff[club.key];
    valid(staff && directions.includes(staff.direction) && Object.hasOwn(PLAYBOOKS,staff.playbook) && Object.hasOwn(COACHES,staff.coach) &&
      Array.isArray(staff.ids) && staff.ids.length === club.players.length && club.players.every((p,i) => staff.ids[i] === careerId(p)));
  }
}

function checkStats(stats) {
  valid(dictionary(stats));
  for (const [key, line] of Object.entries(stats)) {
    valid(playerIds.has(key) && [...STAT_KEYS, 'gp', 'high'].every(k => unsigned(line[k])) && Number.isFinite(line.secs) && line.secs >= 0);
  }
}

// Rebuild one calendar and bracket from its seed and scores. Historical seasons are immutable and
// live in separate records so a checkpoint only rewrites the current season.
function validateSeason(league, season, year, seed) {
  const expected = { year, seed, cursor: 0, fixtures: schedule(seed, league.games), round: 0, series: [], champion: null };
  valid(season.year === expected.year && unsigned(season.cursor) && Array.isArray(season.fixtures) && season.cursor <= season.fixtures.length);
  for (let i = 0; i < season.fixtures.length; i++) {
    const f = season.fixtures[i], e = expected.fixtures[i];
    valid(e && ['day', 'id', 'home', 'away', 'seed', 'series'].every(k => f[k] === e[k]));
    if (i >= season.cursor) { valid(f.score === undefined && f.teamOnly === undefined); continue; }
    valid(Array.isArray(f.score) && f.score.length === 2 && f.score.every(unsigned) && f.score[0] !== f.score[1]);
    if (f.teamOnly !== undefined) valid(Array.isArray(f.teamOnly) && f.teamOnly.length === 2 && f.teamOnly.every((n, side) => unsigned(n) && n <= f.score[side]));
    e.score = f.score;
    if (e.series !== undefined) {
      const s = expected.series[e.series];
      s.wins[s.teams.indexOf(f.score[0] > f.score[1] ? f.home : f.away)]++;
    }
    expected.cursor++;
    advanceBracket(expected, league.bestOf);
  }
  valid(expected.fixtures.length === season.fixtures.length && expected.champion === season.champion && expected.round === season.round &&
    expected.seed === season.seed && JSON.stringify(expected.series) === JSON.stringify(season.series));
  const last = season.fixtures.slice(0, season.cursor).findLast(f => involved(f, league.team));
  if (last) {
    valid(season.lastBox?.id === last.id && season.lastBox.score.every((n, i) => n === last.score[i]));
    checkBox(season.lastBox, last);
  } else valid(!season.lastBox);
  checkStats(season.stats);
  checkStats(season.postseason);
  for (const [stats, playoff] of [[season.stats, false], [season.postseason, true]]) {
    const points = Object.fromEntries(Object.keys(clubs).map(k => [k, 0]));
    for (const f of season.fixtures.slice(0, season.cursor)) {
      if ((f.series !== undefined) !== playoff) continue;
      points[f.home] += f.score[0] - (f.teamOnly?.[0] ?? 0);
      points[f.away] += f.score[1] - (f.teamOnly?.[1] ?? 0);
    }
    for (const [team, sum] of Object.entries(points)) {
      valid(clubs[team].players.reduce((n, p) => n + (stats[careerId(p)]?.pts ?? 0), 0) === sum);
    }
  }
}

function checkUniverse(data, allowSummaries) {
  if (data?.version === 1) migrate(data);
  if (data?.version !== 2) throw new Error('This MyLeague save version is unsupported.');
  createLeague({ ...data, seed: data.initialSeed });
  checkCareers(data);
  const check = { seed: data.initialSeed };
  valid(Array.isArray(data.history));
  for (const [i, season] of [...data.history, data.season].entries()) {
    const seed = nextSeed(check);
    if (i < data.history.length) valid(Object.hasOwn(clubs, season.champion));
    valid(season.year === i + 1);
    if (!allowSummaries || season === data.season || season.fixtures) validateSeason(data, season, i + 1, seed);
  }
  valid(check.seed === data.seed && dictionary(data.moods) && dictionary(data.rivals));
  for (const [id, m] of Object.entries(data.moods)) {
    valid(playerIds.has(id) && Number.isFinite(m.confidence) && Math.abs(m.confidence) <= 1 && Number.isFinite(m.frustration) && m.frustration >= 0 && m.frustration <= 1);
  }
  for (const [pair, e] of Object.entries(data.rivals)) {
    const ids = pair.split('|');
    valid(ids.length === 2 && ids.every(id => playerIds.has(id)) && ids.includes(e.by) && Number.isFinite(e.heat) && e.heat >= 0);
  }
  return data;
}

export const validateSave = data => checkUniverse(data, false);
export const archiveSummary = season => ({ year: season.year, champion: season.champion });

let opening;
function database() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open('triple-threat-myleague', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('slots');
      req.result.createObjectStore('metadata');
      req.result.createObjectStore('archives');
      req.result.createObjectStore('backups');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(error => { opening = null; throw error; });
  return opening;
}

async function read(store, key) {
  const db = await database();
  const table = db.transaction(store).objectStore(store);
  return new Promise((resolve, reject) => {
    const req = key === undefined ? table.getAll() : table.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const listSlots = () => read('metadata');
export async function loadSlot(id) {
  const slot = await read('slots', id);
  checkUniverse(slot?.league, true);
  return slot;
}

export async function readArchive(slot, index) {
  const season = await read('archives', [slot.id, index + 1]);
  if (Object.keys(season.stats).some(id => legacyIds.has(id))) migrateSeason(season);
  const rng = { seed: slot.league.initialSeed };
  for (let i = 0; i < index; i++) nextSeed(rng);
  validateSeason(slot.league, season, index + 1, nextSeed(rng));
  valid(slot.league.history[index].champion === season.champion);
  return season;
}

export async function exportLeague(slot) {
  const history = await Promise.all(slot.league.history.map((_, i) => readArchive(slot, i)));
  return { ...slot.league, history };
}

// A recovery is imported as a new slot so that the damaged original remains available.
export async function previousCheckpoint(id) {
  const backup = await read('backups', id);
  if (!backup) throw new Error('This slot has no earlier checkpoint. You can import an exported save.');
  checkUniverse(backup.league, true);
  return exportLeague(backup);
}

export async function writeSlot(id, revision, league) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['metadata', 'slots', 'archives', 'backups'], 'readwrite');
    const meta = tx.objectStore('metadata'), slots = tx.objectStore('slots'), lookup = slots.get(id);
    let conflict = false;
    lookup.onsuccess = () => {
      if ((lookup.result?.revision ?? 0) !== revision) { conflict = true; tx.abort(); return; }
      if (lookup.result) tx.objectStore('backups').put(lookup.result, id);
      meta.put({ id, revision: revision + 1, name: league.name, team: league.team, year: league.season.year, updated: Date.now() }, id);
      for (const season of league.history) {
        if (season.fixtures) tx.objectStore('archives').add(season, [id, season.year]);
      }
      const checkpoint = { ...league, history: league.history.map(archiveSummary) };
      slots.put({ id, revision: revision + 1, league: checkpoint }, id);
    };
    tx.oncomplete = () => resolve(revision + 1);
    tx.onabort = () => reject(conflict ? new Error('Another tab saved this slot. Reopen the slot to load that revision.') : tx.error ?? new Error('The checkpoint could not be saved.'));
  });
}
