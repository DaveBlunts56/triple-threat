import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANNER_WORDS, PANELS, SHOW, createDirector, direct, panelFor, skipPanel } from '../src/broadcast/director.js';
import { KINDS, STARS } from '../src/broadcast/moments.js';
import { createBroadcast } from '../src/broadcast/broadcast.js';
import { createMatch } from '../src/sim/state.js';
import { startMatch } from '../src/sim/rules.js';
import { step } from '../src/sim/step.js';
import { aiIntents } from '../src/sim/ai.js';
import { DT } from '../src/sim/tuning.js';

const live = () => Object.assign(createMatch(1, 3), { phase: 'live' });
const moment = (kind, more = {}) => ({ kind, moment: true, star: STARS.has(kind), rank: KINDS.indexOf(kind), team: 0, row: 0, name: 'Cross', at: 0, ...more });
const plain = (kind, more = {}) => ({ kind, moment: false, star: false, rank: KINDS.length, team: 0, row: 0, name: 'Cross', at: 0, ...more });

test('every moment has banner words', () => {
  for (const kind of KINDS) assert.ok(BANNER_WORDS[kind], kind);
});

test('a banner shows for 2.6 seconds with the player\'s name and his team, and then goes', () => {
  const d = createDirector(), s = live();
  assert.deepEqual(direct(d, [moment('deep')], s, 10).banner, { words: 'FROM DEEP', name: 'Cross', team: 0 });
  assert.deepEqual(direct(d, [], s, 10 + SHOW.banner - 0.01).banner, { words: 'FROM DEEP', name: 'Cross', team: 0 });
  assert.equal(direct(d, [], s, 10 + SHOW.banner).banner, null);
});

test('a smaller moment does not take the banner from a bigger one still up; a bigger one does; any does once it has gone', () => {
  const d = createDirector(), s = live();
  direct(d, [moment('andOne')], s, 10);
  assert.equal(direct(d, [moment('deep')], s, 11).banner.words, 'AND ONE');
  assert.equal(direct(d, [moment('buzzer')], s, 11.5).banner.words, 'BUZZER-BEATER');
  assert.equal(direct(d, [moment('heatingUp')], s, 11.5 + SHOW.banner).banner.words, 'HEATING UP');
});

test('of two moments in one frame the bigger has the banner', () => {
  const d = createDirector(), s = live();
  assert.equal(direct(d, [moment('andOne'), moment('deep')], s, 10).banner.words, 'AND ONE');
});

test('a run says how long it is and names the team; a chase-down block says so', () => {
  const d = createDirector(), s = live();
  assert.deepEqual(direct(d, [moment('run', { n: 12, row: null, name: null, team: 1 })], s, 10).banner, { words: '12-0 RUN', name: 'Scorpions', team: 1 });
  assert.equal(direct(createDirector(), [moment('block', { chase: true })], s, 10).banner.words, 'CHASE-DOWN BLOCK');
  assert.equal(direct(createDirector(), [moment('block', { chase: false })], s, 10).banner.words, 'BLOCKED');
});

test('the small card: a free-throw shooter, a substitution, a timeout, a scorer reaching ten and one heating up', () => {
  const s = live();
  Object.assign(s.rosters[0][0].stats, { pts: 11, fgm: 4, fga: 7, tpm: 1, tpa: 3, ftm: 3, fta: 4 });
  const card = heard => direct(createDirector(), heard, s, 10).lower;
  assert.deepEqual(card([plain('freeThrow', { shots: 2 })]), { title: 'Cross', lines: ['Free throws 3/4'] });
  assert.deepEqual(card([plain('sub', { row: 5, name: 'Bell', off: 'Marsh' })]), { title: 'IN Bell', lines: ['OUT Marsh'] });
  assert.deepEqual(card([plain('timeout', { row: null, name: null, team: 1, left: [3, 2] })]), { title: 'TIMEOUT Scorpions', lines: ['WAV 3 left · SCO 2 left'] });
  assert.deepEqual(card([plain('made', { points: 2 })]), { title: 'Cross', lines: ['11 PTS · 4/7 FG · 1/3 3PT'] });   // 9 became 11
  assert.equal(card([plain('made', { points: 1 })]), null);                                                         // 10 became 11: already past ten
  s.rosters[0][0].stats.pts = 8;
  assert.equal(card([plain('made', { points: 2 })]), null);
  assert.deepEqual(card([moment('heatingUp')]), { title: 'Cross', lines: ['8 PTS · 4/7 FG · 1/3 3PT'] });
  assert.equal(card([plain('rebound')]), null);
});

test('a card stays four seconds and the newest replaces it', () => {
  const d = createDirector(), s = live();
  direct(d, [plain('sub', { row: 5, name: 'Bell', off: 'Marsh' })], s, 10);
  assert.equal(direct(d, [plain('timeout', { row: null, name: null, left: [2, 3] })], s, 11).lower.title, 'TIMEOUT Waves');
  assert.equal(direct(d, [], s, 11 + SHOW.lower - 0.01).lower.title, 'TIMEOUT Waves');
  assert.equal(direct(d, [], s, 11 + SHOW.lower).lower, null);
});

test('after a big basket the scorer celebrates and the nearest opponent is dejected, for a moment; a block has neither', () => {
  const d = createDirector(), s = live();
  s.players.forEach((p, i) => { p.x = i; p.z = 0; });
  s.last.score = { by: 1, team: 0 };
  const shown = direct(d, [moment('deep', { row: 1, name: 'Marsh' })], s, 10);
  assert.deepEqual([shown.celebrate, shown.dejected], [1, 3]);          // player 3 is the nearest of the other team
  assert.equal(direct(d, [], s, 10 + SHOW.celebrate).celebrate, null);
  const blocked = direct(createDirector(), [moment('block')], s, 10);
  assert.deepEqual([blocked.celebrate, blocked.dejected], [null, null]);
});

test('before and after a match nothing is shown, and what was up is taken down', () => {
  const d = createDirector(), s = live();
  direct(d, [moment('deep'), plain('sub', { row: 5, name: 'Bell', off: 'Marsh' })], s, 10);
  s.phase = 'final';
  assert.deepEqual(direct(d, [moment('winner')], s, 10.1), { banner: null, lower: null, celebrate: null, dejected: null });
  s.phase = 'start';
  assert.deepEqual(direct(createDirector(), [moment('deep')], s, 10), { banner: null, lower: null, celebrate: null, dejected: null });
});

// ---------- the panels ----------

test('the line-ups are up for four seconds from the start of a match, and a skip takes them down', () => {
  const d = createDirector(), s = createMatch(1, 3);
  assert.equal(panelFor(d, s, 0), null);                               // on the menu
  startMatch(s);
  assert.equal(panelFor(d, s, 1), 'lineups');
  assert.equal(panelFor(d, s, 1 + SHOW.lineups - 0.01), 'lineups');
  assert.equal(panelFor(d, s, 1 + SHOW.lineups), null);
  const e = createDirector(), t = createMatch(1, 3);
  panelFor(e, t, 0); startMatch(t);
  assert.equal(panelFor(e, t, 1), 'lineups');
  skipPanel(e);
  assert.equal(panelFor(e, t, 1.1), null);
  assert.equal(panelFor(e, t, 1.2), null);                             // and they do not come back
});

test('the line-ups show again for a match begun from the final screen, and never once play is on', () => {
  const d = createDirector(), s = createMatch(1, 3);
  panelFor(d, s, 0); startMatch(s); panelFor(d, s, 1);
  s.phase = 'live';
  assert.equal(panelFor(d, s, 2), null);
  s.phase = 'final'; panelFor(d, s, 300);
  const next = createMatch(2, 3); startMatch(next);
  assert.equal(panelFor(d, next, 301), 'lineups');
});

test('leaving a match while the line-ups are up takes them down', () => {
  const d = createDirector(), s = createMatch(1, 3);
  panelFor(d, s, 0); startMatch(s);
  assert.equal(panelFor(d, s, 1), 'lineups');
  const menu = createMatch(2, 3);                                      // quit: a new match waiting on the menu
  assert.equal(panelFor(d, menu, 1.5), null);
});

test('at the end of a period its panel is up for five seconds, or until a key; after the second period the half-time one, for nine', () => {
  const d = createDirector(), s = live();
  panelFor(d, s, 49);
  s.phase = 'quarterEnd'; s.quarter = 1;
  assert.equal(panelFor(d, s, 50), 'period');
  assert.equal(panelFor(d, s, 50 + SHOW.period - 0.01), 'period');
  assert.equal(panelFor(d, s, 50 + SHOW.period), null);                // its time is up: the break runs on
  s.phase = 'live'; s.quarter = 2; panelFor(d, s, 99);
  s.phase = 'quarterEnd';
  assert.equal(panelFor(d, s, 100), 'half');
  assert.equal(panelFor(d, s, 100 + SHOW.half - 0.01), 'half');
  skipPanel(d);
  assert.equal(panelFor(d, s, 101), null);
  assert.equal(panelFor(d, s, 102), null);                             // and it does not come back in the same break
  s.phase = 'live'; s.quarter = 3; panelFor(d, s, 150);
  s.phase = 'quarterEnd';
  assert.equal(panelFor(d, s, 151), 'period');                         // the next break has its own
});

test('the panels the match waits for are the line-ups, the period\'s and half-time\'s', () => {
  assert.deepEqual(PANELS, ['lineups', 'period', 'half']);
});

test('the match does not move while the line-ups are up, as the page runs it, and does after', () => {
  // The page's own rule: no step while the panel is 'lineups'.
  const air = createBroadcast({ available: false, speak() {}, stop() {} }), s = createMatch(4, 3);
  air.panel(s, 0); startMatch(s);
  let now = 0;
  const frame = () => { now += DT; if (!PANELS.includes(air.panel(s, now))) air.hear(s, step(s, aiIntents(s, DT), DT)); };
  for (let i = 0; i < 120; i++) frame();                               // two seconds
  assert.equal(s.time, 0);
  air.skip();
  for (let i = 0; i < 120; i++) frame();
  assert.ok(s.time > 1.9);
});

test('a panel waits for a replay: it is not up while the screen is busy, and has its full time afterwards', () => {
  const d = createDirector(), s = live();
  panelFor(d, s, 49);
  s.phase = 'quarterEnd'; s.quarter = 1;
  assert.equal(panelFor(d, s, 50, true), null);                        // a buzzer-beater's replay is about to play
  assert.equal(panelFor(d, s, 58, true), null);                        // eight seconds of it
  assert.equal(panelFor(d, s, 58.1), 'period');
  assert.equal(panelFor(d, s, 58 + SHOW.period - 0.1), 'period');
  assert.equal(panelFor(d, s, 58.1 + SHOW.period), null);
  const e = createDirector(), t = live();
  panelFor(e, t, 49); t.phase = 'quarterEnd'; t.quarter = 1;
  panelFor(e, t, 50); skipPanel(e);
  assert.equal(panelFor(e, t, 51, true), null);
  assert.equal(panelFor(e, t, 52), null);                              // skipped stays skipped
});
