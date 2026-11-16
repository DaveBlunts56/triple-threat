// 500 shooting situations built from a fixed seed, for pinning the shot model's numbers (see tests/arcade.test.js and
// tools/sim/fixtures.mjs). Not a test file itself.
import { createMatch } from '../src/sim/state.js';
import { DIFFICULTY } from '../src/sim/tuning.js';
import { contest, makeChance, shotWindow } from '../src/sim/players.js';

// mulberry32, apart from the match's own dice.
function dice(seed) {
  let s = seed;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each situation: a three-a-side match with a shooter (team 0 or 1) somewhere in his front court, his nearest
// defender somewhere near him, the others far away; ratings, streak, energy, shot timing, a fade or a layup, and a
// difficulty level, all drawn. Returns [{ makeChance, half, best, level, inRange, contest }].
export function shotCases(count = 500, seed = 20261115) {
  const r = dice(seed), pick = list => list[Math.floor(r() * list.length)];
  const out = [];
  for (let i = 0; i < count; i++) {
    const s = createMatch(1, 3);
    s.difficulty = pick(DIFFICULTY.order);
    const team = r() < 0.5 ? 0 : 1, sign = team === 0 ? 1 : -1;
    const shooter = s.players.find(p => p.team === team && p.slot === 0);
    const defender = s.players.find(p => p.team !== team && p.slot === 0);
    const far = 0.5 + r() * 10, angle = (r() - 0.5) * Math.PI;
    Object.assign(shooter, { x: sign * (12.425 - far * Math.cos(angle)), z: far * Math.sin(angle), y: 0 });
    const gap = 0.3 + r() * 3.5, around = r() * 2 * Math.PI;
    Object.assign(defender, { x: shooter.x + gap * Math.cos(around), z: shooter.z + gap * Math.sin(around), y: r() < 0.3 ? r() * 0.6 : 0 });
    for (const p of s.players) if (p !== shooter && p !== defender) Object.assign(p, { x: -sign * 13, z: (p.slot - 1) * 5 });
    const person = s.rosters[team][shooter.person], guard = s.rosters[1 - team][defender.person];
    for (const key of Object.keys(person.ratings)) { person.ratings[key] = 40 + Math.floor(r() * 60); guard.ratings[key] = 40 + Math.floor(r() * 60); }
    person.streak = Math.floor(r() * 11) - 5;
    person.energy = r();
    shooter.shotT = r() * 0.9;
    shooter.fading = r() < 0.15;
    shooter.finish = !shooter.fading && far < 4 && r() < 0.4 ? 'layup' : null;
    const w = shotWindow(s, shooter);
    out.push({ makeChance: makeChance(s, shooter), half: w.half, best: w.best, level: w.level, inRange: w.inRange, contest: contest(s, shooter) });
  }
  return out;
}
