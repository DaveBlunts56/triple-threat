// Who each player is and how he feels (Overhaul Stage 1, src/sim/mood.js): his traits, his mood moving with what
// happens and drifting back, rivalries, a timeout settling everyone, and what it all does to his choices, his shots
// and his fouls, in both engines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOOD, TRAITS, traitsOf, restOf, moodOf, feel, feelShot, feelSteal, settle, lean, moodSkill, foulLean, heatBetween, playedOf, clutchFor } from '../src/sim/mood.js';
import { situation } from '../src/sim/late.js';
import { createMatch, setLength, personOf } from '../src/sim/state.js';
import { setStyle, STYLES } from '../src/sim/styles.js';
import { noteRow } from '../src/sim/stats.js';
import { quickMatch } from '../src/sim/quick/engine.js';
import { createWatch, watchStep, KINDS } from '../src/broadcast/moments.js';
import { createBooth, lineFor } from '../src/broadcast/commentary.js';
import { BANNER_WORDS } from '../src/broadcast/director.js';
import { faceWants } from '../src/render/face.js';
import { TEAMS } from '../src/sim/teams.js';

// A five-a-side match in Simulation, the clock `played` seconds into the first quarter.
function match(played = 0) {
  const s = createMatch(4, 5, [2, 3]);
  setLength(s, 12); setStyle(s, 'sim');
  s.gameClock = s.quarterLength - played;
  return s;
}
const advance = (s, seconds) => { s.gameClock -= seconds; };
const personAt = (s, id) => personOf(s, s.players[id]);

test('every player has his own traits, from his role and his name, the same every match, each 0 to 1', () => {
  const people = TEAMS.flatMap(t => t.players);
  const all = people.map(p => traitsOf(p));
  for (const t of all) for (const trait of TRAITS) assert.ok(t[trait] >= 0 && t[trait] <= 1, `${trait} ${t[trait]}`);
  assert.deepEqual(traitsOf(people[5]), traitsOf({ ...people[5] }), 'the same for the same player');
  // Players of one role differ from each other, and roles lean as they should.
  const byRole = role => all.filter((t, i) => people[i].role === role);
  const mean = (list, trait) => list.reduce((s, t) => s + t[trait], 0) / list.length;
  assert.ok(new Set(byRole('Playmaker').map(t => t.leader)).size > 3, 'playmakers are not all alike');
  assert.ok(mean(byRole('Playmaker'), 'leader') > mean(byRole('Rebounder'), 'leader'));
  assert.ok(mean(byRole('Lockdown wing'), 'fire') > mean(byRole('Sharpshooter'), 'fire'));
  assert.equal(traitsOf(people[0], { fire: 0.9 }).fire, 0.9, 'his own, where he has it');
  const s = match();
  assert.ok(s.rosters.flat().every(p => p.traits && p.mood && p.mood.confidence === restOf(p.traits) && p.mood.frustration === 0), 'fresh for the match, at rest');
});

test('a happening moves his mood, his composure softening it, and it drifts back to his usual over a minute or two', () => {
  const s = match(60), calm = personAt(s, 0), hot = personAt(s, 1);
  calm.traits = { ...calm.traits, composure: 0.9, swagger: 0.5, fire: 0.5 }; hot.traits = { ...hot.traits, composure: 0.1, swagger: 0.5, fire: 0.5 };
  for (const p of [calm, hot]) p.mood = { confidence: 0, frustration: 0, at: playedOf(s) };
  feel(s, calm, 'tov'); feel(s, hot, 'tov');
  assert.ok(hot.mood.confidence < calm.mood.confidence && hot.mood.frustration > calm.mood.frustration, 'the composed man is moved less');
  const was = moodOf(s, hot);
  advance(s, MOOD.half);
  const now = moodOf(s, hot);
  assert.ok(Math.abs(now.confidence - was.confidence / 2) < 1e-9 && Math.abs(now.frustration - was.frustration / 2) < 1e-9, 'half of it gone in MOOD.half seconds');
  // The box score's happenings reach it: an assist lifts him.
  const before = moodOf(s, calm).confidence;
  noteRow(s, s.players[0].team, s.players[0].person, 'ast');
  assert.ok(calm.mood.confidence > before);
});

test('a basket lifts the scorer and stings his man; two who trade big plays become rivals, and the heat cools', () => {
  const s = match(30), a = s.players[0], b = s.players.find(p => p.man === a.id);
  const [pa, pb] = [personOf(s, a), personOf(s, b)];
  const [ca, fb] = [moodOf(s, pa).confidence, moodOf(s, pb).frustration];
  feelShot(s, a, true, { value: 3 });
  assert.ok(moodOf(s, pa).confidence > ca && moodOf(s, pb).frustration > fb);
  assert.ok(heatBetween(s, a, b) > 0 && heatBetween(s, a, b) < MOOD.rival.at, 'one three is not a rivalry');
  // b answers: a block on a, and a three over him; then a again. Trading big plays makes rivals.
  feelShot(s, a, false, { blocker: b });
  const answered = heatBetween(s, a, b);
  feelShot(s, b, true, { value: 3 });   // (a guards b in turn only if he is b's man; the heat is between the pair either way)
  feelSteal(s, a, b);
  for (let i = 0; i < 4 && !s.last.rivals; i++) { feelShot(s, b, false, { blocker: a }); feelShot(s, a, false, { blocker: b }); }
  assert.ok(s.last.rivals, 'they are rivals');
  assert.deepEqual([s.last.rivals.a, s.last.rivals.b].map(x => x.join(':')).sort(), [`${a.team}:${a.person}`, `${b.team}:${b.person}`].sort());
  assert.ok(answered > 0);
  const hot = heatBetween(s, a, b);
  advance(s, MOOD.rival.half);
  assert.ok(Math.abs(heatBetween(s, a, b) - hot / 2) < 1e-9, 'it cools by half in MOOD.rival.half seconds');
  assert.equal(heatBetween(s, a, s.players.find(p => p.team === a.team && p !== a)), 0, 'never between team-mates');
});

test('a timeout settles everyone halfway back to his usual', () => {
  const s = match(100), p = personAt(s, 2);
  p.mood = { confidence: restOf(p.traits) - 0.8, frustration: 0.8, at: playedOf(s) };
  settle(s);
  assert.ok(Math.abs(p.mood.frustration - 0.8 * (1 - MOOD.settle)) < 1e-9);
  assert.ok(Math.abs(p.mood.confidence - (restOf(p.traits) - 0.8 * (1 - MOOD.settle))) < 1e-9);
});

test('his mood leans his choices: sure of himself, he looks for his own shot; doubting, he passes; with the style\'s strength at 0, nothing', () => {
  const s = match(10), p = s.players[0], person = personOf(s, p);
  const options = () => [{ key: 'shoot', value: 1 }, { key: 'drive', value: 1 }, { key: 'pass', value: 1 }, { key: 'hold', value: 0.5 }, { key: 'post', value: -Infinity }];
  person.mood = { confidence: 0.9, frustration: 0, at: playedOf(s) };
  const sure = lean(s, p, options());
  assert.ok(sure[0].value > 1 && sure[1].value > 1 && sure[2].value === 1 && sure[3].value === 0.5 && sure[4].value === -Infinity);
  person.mood = { confidence: -0.9, frustration: 0, at: playedOf(s) };
  const doubting = lean(s, p, options());
  assert.ok(doubting[0].value < 1 && doubting[2].value > 1);
  person.mood = { confidence: 0, frustration: 1, at: playedOf(s) };
  const angry = lean(s, p, options());
  assert.ok(angry[0].value > 1 && angry[2].value < 1, 'an angry man forces his own and passes less');
  setStyle(s, 'sim', undefined, { ...STYLES, sim: { ...STYLES.sim, 'mood.strength': 0 } });
  assert.deepEqual(lean(s, p, options()).map(o => o.value), options().map(o => o.value));
});

test('a shot is a little better on a roll and worse off it, against his own usual; the clutch trait counts only with the game on the line; anger fouls', () => {
  const s = match(10), p = s.players[0], person = personOf(s, p);
  person.traits = { ...person.traits, swagger: 0.9, clutch: 1 };
  person.mood = { confidence: restOf(person.traits), frustration: 0, at: playedOf(s) };
  assert.equal(moodSkill(s, p), 0, 'a sure man at his usual is no better a shooter for it');
  person.mood = { confidence: 1, frustration: 0, at: playedOf(s) };
  assert.ok(moodSkill(s, p) > 0 && moodSkill(s, p) <= MOOD.skill);
  // The last minute of the fourth, one point in it: the clutch trait counts.
  Object.assign(s, { quarter: 4, gameClock: 8, shotClock: 8, score: [90, 91] });
  person.mood = { confidence: restOf(person.traits), frustration: 0, at: playedOf(s) };
  assert.ok(Math.abs(moodSkill(s, p) - MOOD.clutch) < 1e-9);
  // mood.js's own reading of the game on the line is late.js's.
  for (const [quarter, clock, score] of [[4, 8, [90, 91]], [4, 30, [90, 91]], [3, 8, [90, 91]], [4, 8, [90, 95]], [5, 3, [100, 100]]]) {
    Object.assign(s, { quarter, gameClock: clock, score });
    for (const team of [0, 1]) assert.equal(clutchFor(s, team), situation(s, team).clutch, `${quarter} ${clock} ${score}`);
  }
  Object.assign(s, { quarter: 4, gameClock: 8, shotClock: 8, score: [90, 91] });
  assert.equal(foulLean(s, p), 1);
  person.mood = { confidence: 0, frustration: 1, at: playedOf(s) };
  assert.equal(foulLean(s, p), 1 + MOOD.foul);
});

test('a simulated game moves every mood and keeps its rivalries, the same for the same seed', () => {
  const a = quickMatch({ seed: 21 }), b = quickMatch({ seed: 21 });
  const moods = s => s.rosters.flat().map(p => [p.mood.confidence, p.mood.frustration]);
  assert.deepEqual(moods(a), moods(b));
  assert.ok(a.rosters.flat().filter(p => p.mood.at > 0).length >= 10, 'most of the players were moved');
  assert.ok(Object.keys(a.rivals).length > 0 && Object.values(a.rivals).every(e => e.heat > 0 && e.by));
  assert.deepEqual(JSON.parse(JSON.stringify(a.rivals)), a.rivals, 'plain numbers, for a franchise mode to keep');
});

test('the broadcast hears a rivalry and a rattled player, and says them; a face shows the mood', () => {
  const s = match(30), watch = createWatch();
  watchStep(watch, s);
  s.last.rivals = { a: [0, 0], b: [1, 0], at: s.time };
  const p = s.players.find(q => q.team === 1);
  personOf(s, p).mood = { confidence: 0, frustration: 0.9, at: playedOf(s) };
  const heard = watchStep(watch, s);
  const rivalry = heard.find(h => h.kind === 'rivalry'), rattled = heard.find(h => h.kind === 'rattled');
  assert.ok(rivalry?.moment && KINDS.includes('rivalry') && BANNER_WORDS.rivalry === 'RIVALRY');
  assert.match(rivalry.name, / vs /);
  assert.ok(rattled && !rattled.moment && rattled.team === 1, 'a rattled player is said, with no banner');
  assert.equal(watchStep(watch, s).filter(h => h.kind === 'rattled').length, 0, 'once, until he calms down');
  const booth = createBooth();
  assert.match(lineFor(booth, rivalry, s), new RegExp(rivalry.name));
  assert.match(lineFor(booth, rattled, s), new RegExp(rattled.name));
  const player = { shooting: false, finish: null, fading: false, move: null, stealCooldown: 0, id: 3 };
  assert.equal(faceWants(player, {}, { mood: { confidence: 0, frustration: 0.7 }, defending: true }).effort, true, 'a frustrated defender grimaces');
  assert.equal(faceWants(player, {}, { mood: { confidence: -0.7, frustration: 0 }, dead: true }).dejected, true, 'a man whose confidence is gone hangs his head');
  assert.deepEqual(faceWants(player, {}), { effort: false, shout: false, dejected: false });
});
