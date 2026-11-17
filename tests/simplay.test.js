// The 3D game in Simulation against the 2025-26 averages (plan Task 4.7), and against the fast engine (Task 5.4):
// sixteen computer matches of five a side and 12-minute quarters, per team per 48 minutes, played at once in worker
// threads. Nothing here sets a number: these come from the decisions and chances of Simulation's style.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarise } from '../tools/sim/measure.mjs';
import { quickMatch } from '../src/sim/quick/engine.js';
import { teamLine } from '../src/sim/stats.js';
import { watchMatches } from './watch.js';

const TARGET = { poss: 99, pts: 116, fga: 89, tpa: 37, fta: 24, tov: 14.5, secs: 14.5 };
const records = await watchMatches(Array.from({ length: 16 }, (_, i) => i + 1), { glide: false });
const table = summarise(records, { per48: true });

test('Simulation\'s 3D game is within 15% of the 2025-26 averages in pace, points, shots, threes, free throws, turnovers and possession length', () => {
  const misses = Object.entries(TARGET).filter(([k, v]) => Math.abs(table[k].mean / v - 1) > 0.15).map(([k, v]) => `${k} ${table[k].mean.toFixed(1)} (target ${v})`);
  assert.deepEqual(misses, []);
});

test('Simulation\'s starters play 26-40 minutes', () => {
  const starters = records.flatMap(r => r.minutes.flatMap(roster => roster.slice(0, 5)));
  const mean = starters.reduce((a, b) => a + b, 0) / starters.length;
  assert.ok(mean >= 26 && mean <= 40, `${mean.toFixed(1)}`);
});

test('over whole Simulation matches the rotation plays starters 30-38 minutes, the eighth man 8-24, and changes about as often as a real coach', () => {
  const rows = Array(8).fill(0);
  let subs = 0;
  for (const r of records) {
    subs += r.subs[0] + r.subs[1];
    for (const t of [0, 1]) {
      r.minutes[t].forEach((m, row) => { rows[row] += m / (2 * records.length); });
      const total = r.minutes[t].reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(total - (5 * r.gameSeconds) / 60) < 0.05, `team ${t}: ${total} minutes against ${(5 * r.gameSeconds) / 60}`);
    }
  }
  const starters = rows.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  assert.ok(starters >= 30 && starters <= 38, `starters average ${starters.toFixed(1)}: ${rows.map(m => m.toFixed(1)).join(' ')}`);
  assert.ok(rows[7] >= 8 && rows[7] <= 24, `the eighth man ${rows[7].toFixed(1)}`);
  const perTeam = subs / (2 * records.length);
  assert.ok(perTeam >= 15 && perTeam <= 40, `${perTeam.toFixed(1)} substitutions a team`);
});

test('corner threes are a real part of Simulation\'s shot mix: 6-20% of shots (shooters fill the corners, square up there when open, and drift to them on drives)', () => {
  assert.ok(table.corner3.mean >= 0.06 && table.corner3.mean <= 0.2, `${(100 * table.corner3.mean).toFixed(1)}% of shots`);
});

test('in the 3D game, stars (83 or better) use more than 20% of their team\'s plays while on court (USG%, over the sixteen matches)', async () => {
  const { usg } = await import('../src/sim/advanced.js');
  const { overall } = await import('../src/sim/overall.js');
  const { STAR_AT } = await import('../src/sim/choose.js');
  const short = [];
  for (const t of [0, 1]) {
    const rows = records[0].people[t].map(p => ({ name: p.name, star: overall({ ratings: p.ratings }) >= STAR_AT, line: {}, secs: 0 })), team = {};
    let teamSecs = 0;
    for (const r of records) {
      r.people[t].forEach((p, i) => { for (const k of Object.keys(p.line)) { rows[i].line[k] = (rows[i].line[k] ?? 0) + p.line[k]; team[k] = (team[k] ?? 0) + p.line[k]; } rows[i].secs += p.secs; teamSecs += p.secs; });
      team.tov += r.teamTov[t];
    }
    for (const row of rows.filter(x => x.star)) { const rate = usg(row.line, row.secs, team, teamSecs); if (rate <= 20) short.push(`${row.name} ${rate.toFixed(1)}%`); }
  }
  assert.deepEqual(short, []);
});

// The fast engine's 400 games, per team per 48 minutes, as summarise has the 3D game's.
function fastTable(games) {
  const rows = [];
  for (let seed = 1; seed <= games; seed++) {
    const s = quickMatch({ seed }), scale = 2880 / ((48 + Math.max(0, s.quarter - 4) * 5) * 60);
    for (const t of [0, 1]) {
      const l = teamLine(s, t), zones = s.shotZones[t], shots = Object.values(zones).reduce((a, b) => a + b, 0);
      rows.push({ poss: s.possessions[t] * scale, pts: l.pts * scale, fga: l.fga * scale, tpa: l.tpa * scale, fta: l.fta * scale, tov: l.tov * scale,
        oreb: l.orb * scale, secs: s.lengths[t][0] / s.lengths[t][1], threeRate: l.tpa / l.fga, rim: (zones.rim ?? 0) / shots, assisted: l.ast / l.fgm });
    }
  }
  return Object.fromEntries(Object.keys(rows[0]).map(k => [k, rows.reduce((a, r) => a + r[k], 0) / rows.length]));
}

test('the fast engine and the 3D game agree on Simulation: pace, points, FGA, 3PA within 10%; FTA, turnovers, offensive rebounds within 15%; the shot mix within 5 points; possessions within 1.5 s', () => {
  const fast = fastTable(400);
  const three = { ...Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.mean])),
    threeRate: records.reduce((a, r) => a + r.lines[0].tpa + r.lines[1].tpa, 0) / records.reduce((a, r) => a + r.lines[0].fga + r.lines[1].fga, 0) };
  const misses = [];
  for (const [keys, within] of [[['poss', 'pts', 'fga', 'tpa'], 0.1], [['fta', 'tov', 'oreb'], 0.15]])
    for (const k of keys) if (Math.abs(fast[k] / three[k] - 1) > within) misses.push(`${k}: fast ${fast[k].toFixed(1)}, 3D ${three[k].toFixed(1)}`);
  for (const k of ['threeRate', 'rim', 'assisted']) if (Math.abs(fast[k] - three[k]) > 0.05) misses.push(`${k}: fast ${fast[k].toFixed(3)}, 3D ${three[k].toFixed(3)}`);
  if (Math.abs(fast.secs - three.secs) > 1.5) misses.push(`secs: fast ${fast.secs.toFixed(1)}, 3D ${three.secs.toFixed(1)}`);
  assert.deepEqual(misses, []);
});
