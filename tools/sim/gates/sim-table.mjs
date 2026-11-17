// Simulation's 3D game per team per 48 minutes, over `n` seeds from `first` (tests/simplay.test.js plays 16 from 1):
// pace, points, shots, threes, turnovers, possession length, the shot mix and the share of baskets assisted.
//   node tools/sim/gates/sim-table.mjs [n] [first]
// Targets (within 15%): poss 99, pts 116, fga 89, tpa 37, fta 24, tov 14.5, secs 14.5. Compare with fast-table.mjs:
// pace, points, FGA, 3PA within 10%; the three-point rate, rim share and assisted share within 5 points.
import { from, args } from './common.mjs';

const [n, first] = args(16, 1);
const { summarise } = await from('tools/sim/measure.mjs');
const { watchMatches } = await from('tests/watch.js');
const records = await watchMatches(Array.from({ length: n }, (_, i) => i + first), { glide: false });
const t = summarise(records, { per48: true });
const threeRate = records.reduce((a, r) => a + r.lines[0].tpa + r.lines[1].tpa, 0) / records.reduce((a, r) => a + r.lines[0].fga + r.lines[1].fga, 0);
console.log(['poss', 'pts', 'fga', 'tpa', 'fta', 'tov', 'oreb', 'secs', 'rim', 'mid', 'assisted']
  .map(k => `${k} ${t[k].mean.toFixed(['rim', 'mid', 'assisted'].includes(k) ? 3 : 1)}`).join(', ') + `, threeRate ${threeRate.toFixed(3)}`);
process.exit(0);
