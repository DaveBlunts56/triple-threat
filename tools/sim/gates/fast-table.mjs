// The fast engine (Simulate) on Simulation per team per 48 minutes, over `n` games: the same table as
// tests/simplay.test.js's fastTable, to set beside sim-table.mjs.
//   node tools/sim/gates/fast-table.mjs [n]
import { from, args } from './common.mjs';

const [n] = args(400);
const { quickMatch } = await from('src/sim/quick/engine.js');
const { teamLine } = await from('src/sim/stats.js');
const rows = [];
for (let seed = 1; seed <= n; seed++) {
  const s = quickMatch({ seed }), scale = 2880 / ((48 + Math.max(0, s.quarter - 4) * 5) * 60);
  for (const t of [0, 1]) {
    const l = teamLine(s, t), zones = s.shotZones[t], shots = Object.values(zones).reduce((a, b) => a + b, 0);
    rows.push({ poss: s.possessions[t] * scale, pts: l.pts * scale, fga: l.fga * scale, tpa: l.tpa * scale, fta: l.fta * scale, tov: l.tov * scale,
      oreb: l.orb * scale, secs: s.lengths[t][0] / s.lengths[t][1], threeRate: l.tpa / l.fga, rim: (zones.rim ?? 0) / shots, assisted: l.ast / l.fgm });
  }
}
console.log(Object.keys(rows[0]).map(k => `${k} ${(rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(['threeRate', 'rim', 'assisted'].includes(k) ? 3 : 1)}`).join(', '));
