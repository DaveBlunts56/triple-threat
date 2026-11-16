// The fans (src/render/crowd.js): who they are, what they wear and carry, how they cheer, and the crowd's mood as they
// show it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, STYLE, PROP, HAIR, CROWD, SIGNS, REACH, MOOD, dressCrowd, createMood, stepMood } from '../src/render/crowd.js';
import { ARENA, seats, upperSeats, shown, blocks } from '../src/render/layout.js';
import { courtsideSeats } from '../src/render/sideline.js';
import { COURT, ROSTER } from '../src/sim/tuning.js';
import { KIT } from '../src/render/kit.js';

const stands = shown([...seats(), ...upperSeats()], 1), courtside = courtsideSeats();
const crowd = dressCrowd(stands, courtside, ARENA.upper.height - 0.1);
const share = (list, keep) => list.filter(keep).length / list.length;

test('the same crowd every time: the courtside fans first, then the stands in their shown order', () => {
  assert.deepEqual(dressCrowd(stands, courtside, ARENA.upper.height - 0.1), crowd);
  assert.equal(crowd.length, courtside.length + stands.length);
  crowd.slice(0, courtside.length).forEach((fan, i) => assert.deepEqual([fan.x, fan.z], [courtside[i].x, courtside[i].z]));
  crowd.slice(courtside.length).forEach((fan, i) => assert.deepEqual([fan.x, fan.y, fan.z], [stands[i].x, stands[i].y, stands[i].z]));
});

test('courtside fans clap from their seats: never standing, nothing in their hands, nobody behind an end to wave', () => {
  const floor = crowd.slice(0, courtside.length);
  assert.ok(floor.length > 40);
  for (const fan of floor) {
    assert.deepEqual([fan.style, fan.prop, fan.end, fan.dim, fan.rise], [STYLE.courtside, PROP.none, 0, 1, CROWD.rise.floor]);
    assert.ok(fan.side !== 1 && fan.hairStyle !== HAIR.cap);
    assert.ok(Math.abs(fan.x) > COURT.halfLength || Math.abs(fan.z) > COURT.halfWidth, 'off the court');
  }
});

test('the stands are mostly home fans, some away and some neither, in their colours, with fingers, towels and signs', () => {
  const fans = crowd.slice(courtside.length);
  const home = share(fans, f => f.side === 0), away = share(fans, f => f.side === 1);
  assert.ok(Math.abs(home - CROWD.side[0]) < 0.03 && Math.abs(away - CROWD.side[1]) < 0.03, `${home} ${away}`);
  const team = KIT.team.map(colour => PALETTE.indexOf(colour));
  for (const side of [0, 1]) {
    const theirs = fans.filter(f => f.side === side), other = team[1 - side];
    assert.ok(share(theirs, f => f.shirt === team[side]) > 0.6, 'a team\'s fans mostly wear its colour');
    assert.ok(share(theirs, f => f.shirt === other) === 0, 'and never the other team\'s');
    assert.ok(share(theirs, f => f.prop !== PROP.none) > 0.15);
  }
  assert.ok(fans.filter(f => f.side === 2).every(f => f.prop === PROP.none), 'only a team\'s fans bring things to wave');
  for (const kind of [PROP.finger, PROP.towel, PROP.sign]) assert.ok(fans.some(f => f.prop === kind));
  for (const fan of fans) {
    for (const k of ['skin', 'shirt', 'pants', 'hair', 'upper', 'fore', 'propColour']) assert.ok(fan[k] >= 0 && fan[k] < PALETTE.length, k);
    assert.equal(fan.style === STYLE.sign, fan.prop === PROP.sign);
    assert.equal(SIGNS[fan.sign].team, fan.side === 1 ? 1 : 0, 'each side holds its own team\'s signs');
    assert.equal(fan.rise, fan.y >= ARENA.upper.height - 0.1 ? CROWD.rise.upper : CROWD.rise.lower);
    assert.equal(fan.end, Math.abs(Math.sin(fan.facing)) > 0.5 ? Math.sign(fan.x) : 0);
  }
  assert.ok(new Set(fans.map(f => `${f.skin} ${f.shirt} ${f.hair} ${f.hairStyle}`)).size > 300, 'many different people');
  assert.ok(fans.some(f => f.height < 0.8) && fans.some(f => f.width > 1.1), 'children, and bigger builds');
});

test('the signs cheer the two teams by name', () => {
  for (const name of ROSTER.teams) assert.ok(SIGNS.some(s => s.words.includes(name.split(' ').pop().toUpperCase())), name);
});

test('a standing fan, arms and sign raised, never comes between the camera and the court', () => {
  const cameras = [-ARENA.camera.maxX, 0, ARENA.camera.maxX].map(x => ({ x, y: ARENA.camera.height, z: ARENA.camera.back }));
  const sights = [];
  for (const x of [-COURT.halfLength, -7, 0, 7, COURT.halfLength]) for (const z of [-COURT.halfWidth, 0, COURT.halfWidth]) sights.push({ x, y: 0, z }, { x, y: 2, z });
  for (const fan of crowd.filter(f => f.style !== STYLE.courtside)) {
    const x = fan.x + Math.sin(fan.facing) * REACH.ahead, z = fan.z + Math.cos(fan.facing) * REACH.ahead;
    const box = { min: { x: x - 0.5, y: fan.y, z: z - 0.5 }, max: { x: x + 0.5, y: fan.y + REACH.up, z: z + 0.5 } };
    for (const from of cameras) for (const to of sights) assert.ok(!blocks(box, from, to), JSON.stringify({ fan: [fan.x, fan.y, fan.z], from, to }));
  }
});

test('the crowd rises together over a moment and sits back down, rather than in one frame', () => {
  const life = { cheer: [0, 0], boo: 0, groan: 0, distract: 0 }, mood = createMood(), dt = 1 / 60;
  stepMood(mood, life, dt);
  assert.deepEqual(mood, createMood());
  life.cheer[0] = 3.2;
  stepMood(mood, life, dt);
  assert.ok(Math.abs(mood.home - MOOD.rise * dt) < 1e-9 && mood.away === 0, 'up a little at a time');
  for (let t = 0; t < 1 / MOOD.rise; t += dt) stepMood(mood, life, dt);
  assert.equal(mood.home, 1);
  life.cheer[0] = 0;
  for (let t = 0; t < 1 / MOOD.fall + 2 * dt; t += dt) stepMood(mood, life, dt);
  assert.equal(mood.home, 0);
  // The waving behind an end keeps its end as it dies away.
  life.distract = -1; stepMood(mood, life, dt);
  life.distract = 0; stepMood(mood, life, dt);
  assert.ok(mood.wave === 0 && mood.end === -1);
  life.distract = 1; for (let i = 0; i < 30; i++) stepMood(mood, life, dt);
  life.distract = 0; stepMood(mood, life, dt);
  assert.ok(mood.wave > 0 && mood.end === 1);
  life.boo = 2.6; life.groan = 1.5; for (let i = 0; i < 120; i++) stepMood(mood, life, dt);
  assert.ok(mood.boo === 1 && mood.groan === 1);
});
