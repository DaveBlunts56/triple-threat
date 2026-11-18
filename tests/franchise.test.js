import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { clubs, lengths, schedule, standings } from '../src/franchise/calendar.js';
import { createLeague, fixtureMatch, gameReport, nextFixture, nextSeason, recordGame, simulateFixture } from '../src/franchise/league.js';
import { validateSave } from '../src/franchise/saves.js';
import { dashboard, library } from '../src/franchise/view.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { DT } from '../src/sim/tuning.js';
import { aiIntents } from '../src/sim/ai.js';

const make = (options = {}) => createLeague({ name: 'Test club', team: 'NYE', seed: 123, minutes: 3, ...options });
const copy = data => JSON.parse(JSON.stringify(data));

test('all supported schedules give every club equal home and road games, all opponents and no double booking', () => {
  assert.equal(Object.keys(clubs).length, 12);
  for (const games of lengths) for (const seed of [0, 12, 297, 0xffffffff]) {
    const fixtures = schedule(seed, games);
    for (const key of Object.keys(clubs)) {
      const home = fixtures.filter(f => f.home === key), road = fixtures.filter(f => f.away === key), all = [...home, ...road];
      for (const opponent of Object.keys(clubs).filter(k => k !== key)) {
        const meetings = fixtures.filter(f => [f.home, f.away].includes(key) && [f.home, f.away].includes(opponent));
        assert.ok(meetings.every((f, i) => !i || f.home === meetings[i - 1].away));
      }
      assert.equal(home.length, games / 2);
      assert.equal(road.length, games / 2);
      assert.equal(new Set(all.map(f => f.day)).size, games);
      assert.equal(new Set([...home.map(f => f.away), ...road.map(f => f.home)]).size, 11);
    }
  }
});

test('a saved universe resumes the same decisions and another seed produces different games', () => {
  const a = make(), b = copy(a), c = make({ seed: 124 });
  for (let i = 0; i < 9; i++) {
    recordGame(a, simulateFixture(a)); recordGame(b, simulateFixture(b)); recordGame(c, simulateFixture(c));
  }
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.season.fixtures.map(f => f.score), c.season.fixtures.map(f => f.score));
  assert.deepEqual(validateSave(copy(a)), a);
  assert.equal(standings(a.season).reduce((n, t) => n + t.w, 0), 9);
});

test('the website worker accepts a cloned fixture and returns the same report as the local engine', async t => {
  const workerURL = new URL('../src/franchise/worker.js', import.meta.url).href;
  const worker = new Worker(`
    import { parentPort } from 'node:worker_threads';
    globalThis.self = { postMessage: value => parentPort.postMessage(value) };
    await import(${JSON.stringify(workerURL)});
    parentPort.on('message', data => self.onmessage({ data }));
  `, { eval: true, type: 'module', execArgv: [] });
  t.after(() => worker.terminate());
  const league = make();
  const answer = once(worker, 'message');
  worker.postMessage(fixtureMatch(league));
  const [message] = await answer;
  assert.deepEqual(message.result, simulateFixture(league));
});

test('unfinished, stale and inconsistent box scores leave the calendar and stats untouched', () => {
  const l = make(), result = simulateFixture(l);
  assert.throws(() => gameReport(fixtureMatch(l)), /in progress/);
  const broken = copy(result), before = copy(l);
  broken.box[1][0].pts++;
  assert.throws(() => recordGame(l, broken), /box score/);
  assert.deepEqual(l, before);
  recordGame(l, result);
  const after = copy(l);
  assert.throws(() => recordGame(l, result), /pending/);
  assert.deepEqual(l, after);
});

test('best-of series stop on the clinching win, award one title and archive regular and playoff stats separately', () => {
  for (const bestOf of [1, 3, 5, 7]) {
    const l = make({ bestOf });
    assert.throws(() => nextSeason(l));
    while (nextFixture(l)) recordGame(l, simulateFixture(l));
    assert.equal(l.season.series.length, 7);
    for (const s of l.season.series) assert.equal(Math.max(...s.wins), (bestOf + 1) / 2);
    assert.equal(l.season.champion, l.season.series.at(-1).teams[l.season.series.at(-1).wins.indexOf((bestOf + 1) / 2)]);
    assert.ok(standings(l.season).every(t => t.w + t.l === 14));
    nextSeason(l);
    assert.equal(l.season.cursor, 0);
    assert.equal(l.history[0].year, 1);
    assert.ok(Object.keys(l.history[0].postseason).length >= 80);
    validateSave(copy(l));
  }
});

test('the existing 3D step engine plays a road fixture from tip to final and maps both boxes to the right clubs', () => {
  const first = make(), away = nextFixture(first).away;
  const l = make({ team: away, size: 3, style: 'arcade' }), f = nextFixture(l);
  const s = fixtureMatch(l);
  assert.equal(s.teams[0].key, away);
  assert.equal(s.teams[s.home].key, f.home);
  assert.deepEqual(s.rosters[0].map(p => p.name), clubs[away].players.map(p => p.name));
  startMatch(s);
  for (let i = 0; s.phase !== 'final' && i < 400000; i++) step(s, aiIntents(s, DT), DT);
  // The 3D rules also award a team-only basket for a loose ball knocked in with no shot information.
  const extra = copy(l);
  recordGame(l, gameReport(s));
  assert.deepEqual(f.score, [s.score[1], s.score[0]]);
  s.score[0] += 2;
  const report = gameReport(s);
  assert.ok(report.teamOnly[1] >= 2);
  recordGame(extra, report);
  validateSave(extra);
  assert.equal(l.season.stats[s.rosters[0][0].careerId].pts, s.rosters[0][0].stats.pts);
  validateSave(copy(l));
  const rematch = fixtureMatch(l, { ...f, home: away, away: f.home });
  assert.equal(rematch.rosters[0][0].mood.confidence, l.moods[s.rosters[0][0].careerId].confidence);
  assert.ok(Object.keys(rematch.rivals).length > 0);
});

test('import rejects unsupported or inconsistent saves before touching a slot', () => {
  const l = make();
  recordGame(l, simulateFixture(l));
  for (const breakIt of [x => x.version++, x => x.season.fixtures.pop(), x => x.season.cursor++,
    x => x.season.fixtures[0].home = x.team + '?', x => x.season.fixtures[0].score[1]++,
    x => x.season.champion = x.team, x => x.seed++, x => x.moods.bad = {}]) {
    const bad = copy(l); breakIt(bad);
    assert.throws(() => validateSave(bad));
  }
});

test('franchise names are rendered as text and each view reads actual league data', () => {
  const l = make({ name: '<A & B>' });
  for (let i = 0; i < 6; i++) recordGame(l, simulateFixture(l));
  for (const tab of ['Overview', 'Calendar', 'Standings', 'Leaders', 'Playoffs', 'History']) {
    const html = dashboard(l, tab);
    assert.ok(html.includes('&lt;A &amp; B&gt;'));
    assert.ok(!html.includes('undefined') && !html.includes('<A & B>'));
  }
  assert.match(library([{ name: l.name, team: l.team, id: 'a', year: 1 }]), /&lt;A &amp; B&gt;/);
});

test('offseason development repeats on reload, ages every player and reaches the match roster', () => {
  const league = make();
  while (nextFixture(league)) recordGame(league, simulateFixture(league));
  const replay = copy(league), before = copy(league.careers);
  nextSeason(league);
  nextSeason(replay);
  assert.deepEqual(league, replay);
  const careers = Object.entries(league.careers);
  assert.equal(careers.length, 120);
  assert.ok(careers.every(([id,p]) => p.age === before[id].age + 1));
  assert.ok(careers.some(([,p]) => p.change > 0));
  assert.ok(careers.some(([,p]) => p.change < 0));
  const state = fixtureMatch(league);
  for (const p of state.rosters.flat()) assert.deepEqual(p.ratings, league.careers[p.careerId].ratings);
  validateSave(copy(league));
});

test('a founding save migrates scoring, confidence and rivalries without changing the pending fixture', () => {
  const league = make();
  recordGame(league, simulateFixture(league));
  const old = copy(league), ids = new Map();
  for (const t of Object.values(clubs)) t.players.forEach((p,i) => ids.set(league.staff[t.key].ids[i], t.key + '/' + p.number));
  const convert = obj => Object.fromEntries(Object.entries(obj).map(([id,v]) => [ids.get(id),v]));
  old.version = 1;
  delete old.staff; delete old.careers;
  old.season.stats = convert(old.season.stats);
  old.moods = convert(old.moods);
  old.rivals = Object.fromEntries(Object.entries(old.rivals).map(([pair,e]) =>
    [pair.split('|').map(id => ids.get(id)).sort().join('|'), { ...e, by: ids.get(e.by) }]));
  assert.deepEqual(validateSave(old), league);
});
