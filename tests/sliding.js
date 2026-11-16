// For the slider tests (plan Task 5.6): fast games in Simulation with one slider moved, and what they come to, per
// team per game. Seeds fixed, so that each comparison is between the same games but for the slider.
import { quickMatch } from '../src/sim/quick/engine.js';
import { defaultSliders } from '../src/sim/styles.js';
import { teamLine } from '../src/sim/stats.js';

const sumLines = lines => lines.reduce((a, l) => { for (const k of Object.keys(l)) a[k] = (a[k] ?? 0) + l[k]; return a; }, {});

// `games` games with slider `key` at `value`. Returns per team per game: possessions, turnovers, free throws, offensive
// rebounds, substitutions; and the rates: three-point rate, rim share, eFG%, fourth-quarter eFG%, expected points a
// shot, and in the fourth quarter (as the shot model has it, without the luck of makes and misses).
export function slid(key, value, games = 150, size = 5) {
  const sliders = { ...defaultSliders(), [key]: value };
  let poss = 0, subs = 0, rim = 0, shots = 0, ep = 0, looks = 0, ep4 = 0, looks4 = 0;
  const lines = [], fourth = [];
  for (let seed = 1; seed <= games; seed++) {
    let on = null, third = null;
    const watch = (s, what, info) => {
      if (what === 'period') { if (s.quarter === 3) third = [0, 1].map(t => ({ ...teamLine(s, t) })); if (s.quarter === 4) fourth.push(...[0, 1].map(t => diff(teamLine(s, t), third[t]))); return; }
      if (what === 'start') {
        const now = s.players.map(p => p.person);
        if (on) subs += now.filter((p, i) => p !== on[i]).length;
        on = now;
      } else if (info.ended.how === 'shot') { ep += info.ended.look.ep; looks++; if (s.quarter === 4) { ep4 += info.ended.look.ep; looks4++; } }
    };
    const s = quickMatch({ seed, size, sliders, watch });
    for (const t of [0, 1]) {
      lines.push(teamLine(s, t)); poss += s.possessions[t];
      rim += s.shotZones[t].rim ?? 0; shots += Object.values(s.shotZones[t]).reduce((a, b) => a + b, 0);
    }
  }
  const all = sumLines(lines), late = sumLines(fourth), n = 2 * games;
  return {
    poss: poss / n, tov: all.tov / n, fta: all.fta / n, orb: all.orb / n, subs: subs / n, pts: all.pts / n,
    threeRate: all.tpa / all.fga, rim: rim / shots, efg: (all.fgm + 0.5 * all.tpm) / all.fga, efg4: (late.fgm + 0.5 * late.tpm) / late.fga, ep: ep / looks, ep4: ep4 / looks4,
  };
}
const diff = (a, b) => Object.fromEntries(Object.keys(a).map(k => [k, a[k] - b[k]]));
