// The usage (USG%) of each star (83 or better) in Simulation's 3D game over `n` seeds from `first`: each must be over
// 20% (tests/simplay.test.js, seeds 1-16). A star rim protector sits close to that line.
//   node tools/sim/gates/star-usage.mjs [n] [first]
import { from, args } from './common.mjs';

const [n, first] = args(16, 1);
const { watchMatches } = await from('tests/watch.js');
const { usg } = await from('src/sim/advanced.js');
const { overall } = await from('src/sim/overall.js');
const { STAR_AT } = await from('src/sim/choose.js');
const records = await watchMatches(Array.from({ length: n }, (_, i) => i + first), { glide: false });
for (const t of [0, 1]) {
  const rows = records[0].people[t].map(p => ({ name: p.name, star: overall({ ratings: p.ratings }) >= STAR_AT, line: {}, secs: 0 })), team = {};
  let teamSecs = 0;
  for (const r of records) {
    r.people[t].forEach((p, i) => { for (const k of Object.keys(p.line)) { rows[i].line[k] = (rows[i].line[k] ?? 0) + p.line[k]; team[k] = (team[k] ?? 0) + p.line[k]; } rows[i].secs += p.secs; teamSecs += p.secs; });
    team.tov += r.teamTov[t];
  }
  for (const row of rows.filter(x => x.star)) console.log(`${row.name}: ${usg(row.line, row.secs, team, teamSecs).toFixed(1)}% (${(row.secs / 60 / n).toFixed(1)} min a game)`);
}
process.exit(0);
