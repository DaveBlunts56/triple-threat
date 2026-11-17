// A team ten points better from three in the fast engine, over `n` games from seed `first`: the percentage it makes
// as the shot model gives it (expectedShot, before the draw) and as drawn, and the threes it takes.
// tests/quick.test.js asks the expected one to rise by half a point or more on seeds 1-150; the drawn one swings by
// as much as two points either way over 150 games, so it says little.
//   node tools/sim/gates/three-point.mjs [n] [first]
import { from, args } from './common.mjs';

const [n, first] = args(150, 1);
const { createMatch, setLength } = await from('src/sim/state.js');
const { setStyle, styled } = await from('src/sim/styles.js');
const { simulate } = await from('src/sim/quick/engine.js');
const { expectedShot } = await from('src/sim/shooting.js');
const { teamLine } = await from('src/sim/stats.js');
const of = up => {
  let chance = 0, looks = 0, made = 0, tpa = 0;
  const watch = (s, what, { ended } = {}) => {
    const l = ended?.look;
    if (what !== 'end' || !l || ended.how === 'turnover' || ended.how === 'foul' || l.shooter.team !== 0 || l.value !== 3) return;
    looks++; chance += expectedShot({ value: 1, chance: l.chance, green: l.green, rule: styled(s, 'shot.green'), boost: styled(s, 'shot.boost') });
  };
  for (let seed = first; seed < first + n; seed++) {
    const s = createMatch(seed, 5, [0, 1]); setLength(s, 12); setStyle(s, 'sim'); s.humans = [];
    for (const p of s.rosters[0]) p.ratings.three += up;
    simulate(s, watch);
    const l = teamLine(s, 0); made += l.tpm; tpa += l.tpa;
  }
  return { expected: chance / looks, made: made / tpa, tpa };
};
const a = of(0), b = of(10), pts = v => (v * 100).toFixed(2);
console.log(`expected ${pts(a.expected)} -> ${pts(b.expected)}, made ${pts(a.made)} -> ${pts(b.made)}, threes taken ${a.tpa} -> ${b.tpa}`);
