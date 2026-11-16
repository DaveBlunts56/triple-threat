// Measures computer matches with no renderer: the box score, possessions counted where they end, how long they
// last, where the shots come from, the plays called, the fouls, the minutes, how far the feet slip against the floor,
// and how long a step takes. A tool, not part of the game: it may read the renderer's leg motions, which use no
// Three.js. See tools/sim/README.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMatch, setLength } from '../../src/sim/state.js';
import { startMatch } from '../../src/sim/rules.js';
import { step } from '../../src/sim/step.js';
import { aiIntents } from '../../src/sim/ai.js';
import { DT, RIM, THREE_PT } from '../../src/sim/tuning.js';
import { teamLine } from '../../src/sim/stats.js';
import { legMotion } from '../../src/render/motion.js';

const GAITS = JSON.parse(readFileSync(new URL('../../assets/motion.json', import.meta.url))).gaits;
const FOULS = ['reach', 'shooting', 'charge', 'block', 'looseBall', 'illegalScreen'];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Where a shot from (x, z) at the hoop on side `sign` is from. A finish (layup or dunk) is at the rim.
export function zoneOfShot(x, z, sign, finish, three) {
  const far = Math.hypot(x - sign * RIM.x, z);
  if (finish || far < 1.5) return 'rim';
  if (!three) return far < 3 ? 'close' : 'mid';
  return Math.abs(z) > THREE_PT.cornerZ ? 'corner3' : 'arc3';
}

// The glide meter: for one player on one step, the slip between the ground his feet cover (the leg motion's rate
// times its gait's natural speed) and the ground he covers. Null when he is not moving on his feet at a rate.
export function slipOf(player, last) {
  const motion = legMotion(player, GAITS, last);
  const speed = Math.hypot(player.vx, player.vz);
  if (!('rate' in motion) || !GAITS[motion.clip] || speed < 0.3) return { clip: motion.clip, slip: null, speed };
  return { clip: motion.clip, slip: Math.abs(motion.rate * GAITS[motion.clip] - speed) / speed, speed };
}

// One computer match. `setup(state)` runs before the match starts. `observe(state)` runs after every step.
export function playHeadless({ seed = 1, size = 5, minutes = 3, setup, observe, limit = 60 * 60 * 120 } = {}) {
  const s = createMatch(seed, size);
  setLength(s, minutes);
  setup?.(s);
  startMatch(s);
  const rec = {
    seed, size, minutes,
    poss: [0, 0], lengths: [[], []], oreb: [0, 0],
    zones: [{ rim: 0, close: 0, mid: 0, corner3: 0, arc3: 0 }, { rim: 0, close: 0, mid: 0, corner3: 0, arc3: 0 }],
    plays: [{}, {}], fouls: {}, subs: [0, 0], seconds: [[], []], glide: { moving: 0, over20: 0, over35: 0, between: 0 },
    stepMicros: 0, steps: 0, overtime: 0,
  };
  rec.seconds = s.rosters.map(r => r.map(() => 0));
  let owner = null, startClock = 0, startQuarter = 1, lastShot = null, lastPlays = [null, null], lastCall = null;
  let lastShotTeam = null, people = s.players.map(p => p.person);
  const lastClip = s.players.map(() => null);
  const rebs = () => s.rosters.map(r => r.map(p => p.stats.reb));
  let before = rebs();
  const endPossession = () => {
    if (owner === null) return;
    rec.poss[owner]++;
    const used = startQuarter === s.quarter ? startClock - s.gameClock : startClock;
    rec.lengths[owner].push(used);
  };
  const begin = team => { owner = team; startClock = s.gameClock; startQuarter = s.quarter; };
  while (s.phase !== 'final' && rec.steps < limit) {
    const phaseBefore = s.phase, clockBefore = s.gameClock;
    const t0 = performance.now();
    step(s, aiIntents(s, DT), DT);
    rec.stepMicros += (performance.now() - t0) * 1000;
    rec.steps++;
    // Possessions: one ends when control passes to the other team, or when a period ends.
    if (owner === null && phaseBefore === 'jumpBall' && s.phase !== 'jumpBall') begin(s.possession);
    else if (owner === null && phaseBefore === 'quarterEnd' && s.phase !== 'quarterEnd') begin(s.possession);
    else if (owner !== null && s.phase === 'quarterEnd' && phaseBefore !== 'quarterEnd') { endPossession(); owner = null; }
    else if (owner !== null && s.possession !== owner && s.phase !== 'quarterEnd' && s.phase !== 'final') { endPossession(); begin(s.possession); }
    if (s.phase === 'final' && owner !== null) { endPossession(); owner = null; }
    if (s.quarter > 4) rec.overtime = 1;
    // Seconds on court while the game clock runs.
    if (s.gameClock < clockBefore) for (const p of s.players) rec.seconds[p.team][p.person] += clockBefore - s.gameClock;
    // Shots: a new release record.
    if (s.shot && s.shot !== lastShot && s.shot.shooter !== undefined) {
      const p = s.players[s.shot.shooter], sign = p.team === 0 ? 1 : -1;
      const three = Math.abs(p.z) > THREE_PT.cornerZ || Math.hypot(p.x - sign * RIM.x, p.z) > THREE_PT.radius;
      rec.zones[p.team][zoneOfShot(p.x, p.z, sign, s.shot.finish, three)]++;
      lastShotTeam = p.team;
    }
    lastShot = s.shot;
    if (s.ball.mode === 'shot' && s.ball.shooter !== null) lastShotTeam = s.players[s.ball.shooter].team;
    // Offensive rebounds: a rebound taken by the team whose shot it was.
    const now = rebs();
    for (const team of [0, 1]) now[team].forEach((n, row) => { if (n > before[team][row] && team === lastShotTeam) rec.oreb[team]++; });
    before = now;
    for (const team of [0, 1]) {
      const play = s.plays[team];
      if (play && play !== lastPlays[team]) rec.plays[team][play.key] = (rec.plays[team][play.key] ?? 0) + 1;
      lastPlays[team] = play;
    }
    if (s.call && s.call !== lastCall && FOULS.includes(s.call.kind)) rec.fouls[s.call.kind] = (rec.fouls[s.call.kind] ?? 0) + 1;
    lastCall = s.call;
    s.players.forEach((p, i) => { if (p.person !== people[i]) { rec.subs[p.team]++; people[i] = p.person; } });
    // The glide meter, in live play, for players on their feet.
    if (s.phase === 'live') s.players.forEach((p, i) => {
      if (p.y > 0) { lastClip[i] = 'jump'; return; }
      const { clip, slip, speed } = slipOf(p, lastClip[i]);
      lastClip[i] = clip;
      if (slip === null) return;
      rec.glide.moving++;
      if (slip > 0.2) rec.glide.over20++;
      if (slip > 0.35) rec.glide.over35++;
      if (speed > 2.3 && speed < 3.0) rec.glide.between++;
    });
    observe?.(s, rec);
  }
  // The game counts its own possessions once it can (src/sim/possessions.js); this tool's count stays as a check.
  rec.possTool = rec.poss;
  if (s.possessions) rec.poss = [...s.possessions];
  rec.final = s.phase === 'final';
  rec.score = [...s.score];
  rec.lines = [teamLine(s, 0), teamLine(s, 1)];
  rec.people = s.rosters.map(r => r.map(p => ({ ...p.stats })));
  rec.gameSeconds = s.rosters.length && rec.seconds[0].reduce((a, b) => a + b, 0) / s.size;
  rec.state = s;
  return rec;
}

const mean = list => list.reduce((a, b) => a + b, 0) / (list.length || 1);
const sd = list => { const m = mean(list); return Math.sqrt(mean(list.map(v => (v - m) ** 2))); };

// Per team per game: each stat's mean and standard deviation, over both teams of every record, scaled to 48 minutes
// where `per48` says (the counts, not the rates).
export function summarise(records, { per48 = false } = {}) {
  const rows = [];
  for (const r of records) for (const team of [0, 1]) {
    const line = r.lines[team], opp = r.lines[1 - team], scale = per48 ? (48 * 60) / r.gameSeconds : 1;
    const shots = Object.values(r.zones[team]).reduce((a, b) => a + b, 0) || 1;
    const lens = r.lengths[team];
    rows.push({
      pts: line.pts * scale, poss: r.poss[team] * scale, possTool: r.possTool[team] * scale, ppp: line.pts / (r.poss[team] || 1),
      pppTool: line.pts / (r.possTool[team] || 1),   // against the Stage 0 baseline, which this tool counted
      secs: mean(lens), fast: lens.filter(l => l < 8).length / (lens.length || 1),
      fga: line.fga * scale, fgPct: line.fgm / (line.fga || 1), tpa: line.tpa * scale, tpPct: line.tpm / (line.tpa || 1),
      fta: line.fta * scale, ftPct: line.ftm / (line.fta || 1), tov: line.tov * scale, oreb: r.oreb[team] * scale,
      dreb: (line.reb - r.oreb[team]) * scale, ast: line.ast * scale, stl: line.stl * scale, blk: line.blk * scale,
      estimate: (line.fga - r.oreb[team] + line.tov + 0.44 * line.fta) * scale,
      rim: r.zones[team].rim / shots, close: r.zones[team].close / shots, mid: r.zones[team].mid / shots,
      corner3: r.zones[team].corner3 / shots, arc3: r.zones[team].arc3 / shots,
      assisted: line.ast / (line.fgm || 1), subs: r.subs[team] * scale, margin: line.pts - opp.pts,
    });
  }
  const table = {};
  for (const key of Object.keys(rows[0])) table[key] = { mean: mean(rows.map(r => r[key])), sd: sd(rows.map(r => r[key])) };
  const glide = records.reduce((g, r) => ({ moving: g.moving + r.glide.moving, over20: g.over20 + r.glide.over20, over35: g.over35 + r.glide.over35, between: g.between + r.glide.between }), { moving: 0, over20: 0, over35: 0, between: 0 });
  table.glide20 = { mean: glide.over20 / glide.moving }; table.glide35 = { mean: glide.over35 / glide.moving }; table.between = { mean: glide.between / glide.moving };
  table.stepMicros = { mean: records.reduce((a, r) => a + r.stepMicros, 0) / records.reduce((a, r) => a + r.steps, 0) };
  const fouls = {};
  for (const r of records) for (const [k, n] of Object.entries(r.fouls)) fouls[k] = (fouls[k] ?? 0) + n / (2 * records.length);
  table.foulsByKind = fouls;
  const plays = {};
  for (const r of records) for (const team of [0, 1]) for (const [k, n] of Object.entries(r.plays[team])) plays[k] = (plays[k] ?? 0) + n / (2 * records.length);
  table.playsByKind = plays;
  table.overtime = { mean: mean(records.map(r => r.overtime)) };
  table.finished = { mean: mean(records.map(r => (r.final ? 1 : 0))) };
  return table;
}

export function formatTable(table) {
  const lines = [];
  for (const [key, v] of Object.entries(table)) {
    if (v && typeof v.mean === 'number') lines.push(`${key.padEnd(12)} ${v.mean.toFixed(3).padStart(10)}${v.sd !== undefined ? `  ± ${v.sd.toFixed(3)}` : ''}`);
    else lines.push(`${key.padEnd(12)} ${JSON.stringify(Object.fromEntries(Object.entries(v).map(([k, n]) => [k, Math.round(n * 100) / 100])))}`);
  }
  return lines.join('\n');
}

// "1-20" or "3" or "1,4,9" -> a list of seeds.
export const seedList = text => text.split(',').flatMap(part => {
  const [a, b] = part.split('-').map(Number);
  return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(a => { const [k, ...v] = a.trim().split(' '); return [k, v.join(' ') || true]; }));
  const size = Number(args.size ?? 5), minutes = Number(args.minutes ?? 3), seeds = seedList(String(args.seeds ?? '1-10'));
  const records = seeds.map(seed => playHeadless({ seed, size, minutes }));
  const table = summarise(records, { per48: !!args.per48 });
  console.log(`${size} a side, ${minutes}-minute quarters, seeds ${args.seeds ?? '1-10'}`);
  console.log(formatTable(table));
  if (args.out) writeFileSync(args.out, JSON.stringify(table, null, 1));
}
