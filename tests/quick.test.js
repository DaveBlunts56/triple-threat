// The fast engine (plan Tasks 5.1-5.3): whole games by the rules, possessions from plays decided by the shared
// decision maker, and outcomes from the shared models. Five a side, 12-minute quarters, Simulation, unless a test says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickMatch, simulate } from '../src/sim/quick/engine.js';
import { look, shoot, freeThrows, rebound } from '../src/sim/quick/outcomes.js';
import { createMatch, personOf, setLength } from '../src/sim/state.js';
import { setStyle, styled } from '../src/sim/styles.js';
import { teamLine } from '../src/sim/stats.js';
import { situation } from '../src/sim/late.js';
import { starOf } from '../src/sim/ratings.js';
import { CLOCK } from '../src/sim/tuning.js';
import { contestShare, shotChance } from '../src/sim/shooting.js';
import { TEAMS } from '../src/sim/teams.js';

// A match ready to play: its style set, nobody playing it. `change(state)` may alter it before the tip.
function ready(seed, { teams = [0, 1], change = null } = {}) {
  const s = createMatch(seed, 5, teams); setLength(s, 12); setStyle(s, 'sim'); s.humans = [];
  change?.(s);
  return s;
}
const lengthOf = s => (4 * 12 + Math.max(0, s.quarter - 4) * 12 * styled(s, 'rules.overtimeShare')) * 60;   // seconds the game lasted

// Sixty games watched possession by possession, for the rules every possession must keep.
const broken = { clock: [], fouls: [], bonus: [], fouledOut: [], oreb: [], periods: [] };
const watched = [];
for (let seed = 1; seed <= 60; seed++) {
  let before = null, quarter = 1, periodStart = [0, 0], fouls = [0, 0], clock = Infinity;
  const fta = s => [0, 1].map(t => teamLine(s, t).fta);
  const watch = (s, what, info) => {
    if (what === 'period') {
      const counts = [0, 1].map(t => s.possessions[t] - periodStart[t]);
      if (Math.abs(counts[0] - counts[1]) > 1) broken.periods.push(`seed ${seed} q${s.quarter}: ${counts}`);
      periodStart = [...s.possessions];
      return;
    }
    if (s.quarter !== quarter) { quarter = s.quarter; if (quarter <= CLOCK.quarters) fouls = [0, 0]; clock = Infinity; }   // overtime carries on the 4th quarter's count
    if (!(s.shotClock >= 0 && s.shotClock <= CLOCK.shot && s.gameClock >= 0 && s.gameClock <= clock + 1e-9)) broken.clock.push(`seed ${seed}: shot ${s.shotClock}, game ${s.gameClock} after ${clock}`);
    clock = s.gameClock;
    if (what === 'start') {
      if (info.begun === 'oreb' && (s.shotClock !== styled(s, 'rules.orebClock') || before?.possessions[info.team] !== s.possessions[info.team]))
        broken.oreb.push(`seed ${seed}: shot clock ${s.shotClock}, possessions ${before?.possessions} -> ${s.possessions}`);
      return;
    }
    // A possession's end: every foul in it is a team foul, counted afresh each quarter; a reach is shot in the bonus
    // (or late in a period, the second there), and not before.
    const now = [0, 1].map(t => s.rosters[t].reduce((a, p) => a + p.fouls, 0));
    for (const t of [0, 1]) if (s.teamFouls[t] - fouls[t] !== now[t] - (before?.fouls[t] ?? 0) || s.teamFouls[t] > now[t]) broken.fouls.push(`seed ${seed} q${s.quarter} team ${t}: ${s.teamFouls[t]}`);
    fouls = [...s.teamFouls];
    if (info.ended.how === 'foul' && before) {
      const d = 1 - info.team, shot = s.teamFouls[d] >= s.bonus || (s.gameClock <= 120 && s.lateFouls[d] >= 2);
      const got = fta(s)[info.team] - before.fta[info.team];
      if (shot ? got < 2 : got !== 0) broken.bonus.push(`seed ${seed}: team fouls ${s.teamFouls[d]}, late ${s.lateFouls[d]}, ${got} shots`);
    }
    for (const p of s.players) if (personOf(s, p).fouls >= s.foulLimit && s.rosters[p.team].some((q, row) => q.fouls < s.foulLimit && !s.players.some(o => o.team === p.team && o.person === row)))
      broken.fouledOut.push(`seed ${seed}: ${personOf(s, p).name} on with ${personOf(s, p).fouls}`);
    before = { possessions: [...s.possessions], fta: fta(s), fouls: now };
  };
  watched.push(quickMatch({ seed, watch }));
}

test('a game ends with a winner, in overtime if it must', () => {
  for (const s of watched) { assert.equal(s.phase, 'final'); assert.notEqual(s.score[0], s.score[1]); assert.ok(s.quarter >= 4); }
  const games = Array.from({ length: 100 }, (_, i) => quickMatch({ seed: 100 + i }));
  const over = games.filter(s => s.quarter > 4);
  assert.ok(over.length >= 1, 'no overtime in 100 games');
  for (const s of over) assert.ok(Math.abs(s.rosters[0].reduce((a, p) => a + p.secs, 0) - 5 * lengthOf(s)) < 0.01);
});

test('clocks, team fouls and the bonus follow the rules', () => {
  assert.deepEqual(broken.clock, []);
  assert.deepEqual(broken.fouls, []);
  assert.deepEqual(broken.bonus, []);
});

test('nobody plays after fouling out while someone is left to come in', () => assert.deepEqual(broken.fouledOut, []));

test('minutes add up: every team\'s to five times the game\'s length, nobody\'s past it', () => {
  for (const s of watched) for (const t of [0, 1]) {
    const secs = s.rosters[t].map(p => p.secs);
    assert.ok(Math.abs(secs.reduce((a, b) => a + b, 0) - 5 * lengthOf(s)) < 0.01, `team ${t}`);
    assert.ok(Math.max(...secs) <= lengthOf(s) + 1e-6);
  }
});

test('the same seed gives the same game', () => {
  const a = quickMatch({ seed: 7 }), b = quickMatch({ seed: 7 });
  assert.deepEqual([a.score, a.rosters.map(r => r.map(p => p.stats))], [b.score, b.rosters.map(r => r.map(p => p.stats))]);
});

// A fixed piece of work of the kind a game does (the shared shot model, many times), to tell whether the machine is
// quiet: about 7 ms on the machine the ledger's times were taken on, when nothing else is running.
const QUIET_REFERENCE = 7;
function reference() {
  let x = 0;
  for (let i = 0; i < 600000; i++) { const o = { gap: (i % 37) / 20, defence: 60 + (i % 30), fading: i % 7 === 0 }; x += shotChance({ base: 0.5, timing: 0.8, contest: contestShare(o), energy: 0.9, levelMake: 1, skill: 1, fading: o.fading, make: 1, form: 1 }); }
  return x;
}

test('a game takes at most 10 ms (the guard; the target of 5 ms is in the ledger)', t => {
  // By the wall clock, judged only on a quiet machine: with the other test files running every core is shared, a
  // game's garbage collection competes for them, and no clock can say what the game would take alone.
  const time = f => { const at = performance.now(); f(); return performance.now() - at; };
  for (let i = 0; i < 10; i++) { quickMatch({ seed: 900 + i }); reference(); }
  const games = [], refs = [];
  for (let i = 0; i < 40; i++) { refs.push(time(reference)); games.push(time(() => quickMatch({ seed: 1000 + i }))); }
  const median = list => list.sort((a, b) => a - b)[list.length >> 1], game = median(games), ref = median(refs);
  if (ref > QUIET_REFERENCE * 1.3) { t.skip(`the machine is busy (reference ${ref.toFixed(1)} ms, quiet ${QUIET_REFERENCE}): a game took ${game.toFixed(1)} ms; not judged`); return; }
  assert.ok(game <= 10, `median ${game.toFixed(2)} ms`);
});

test('the two teams\' possessions in a period never differ by more than one, and the count agrees with the box-score estimate within 4%', () => {
  assert.deepEqual(broken.periods, []);
  let counted = 0, estimate = 0;
  for (const s of watched) for (const t of [0, 1]) { const l = teamLine(s, t); counted += s.possessions[t]; estimate += l.fga - l.orb + l.tov + 0.44 * l.fta; }
  assert.ok(Math.abs(estimate / counted - 1) <= 0.04, `${counted} counted, ${estimate.toFixed(0)} estimated`);
});

test('an offensive rebound keeps the possession and resets the shot clock as the style says', () => assert.deepEqual(broken.oreb, []));

test('the box score adds up: points = 2 x FGM + 3PM + FTM, to the score', () => {
  for (const s of watched) for (const t of [0, 1]) {
    const l = teamLine(s, t);
    assert.equal(l.pts, 2 * l.fgm + l.tpm + l.ftm);
    assert.equal(l.pts, s.score[t]);
    assert.ok(l.fgm <= l.fga && l.tpm <= l.tpa && l.ftm <= l.fta && l.tpa <= l.fga && l.orb <= l.reb && l.ast <= l.fgm);
  }
});

// ---- Possessions from plays (Task 5.2) ----

// Mean of `pick(state, info)` over `team`'s possession ends in `games` games, where it gives a number.
function meanOver(games, from, pick, options) {
  let sum = 0, n = 0;
  for (let seed = from; seed < from + games; seed++) {
    const watch = (s, what, info) => { if (what !== 'end') return; const v = pick(s, info); if (v !== null) { sum += v; n++; } };
    simulate(ready(seed, options), watch);
  }
  return { mean: sum / n, n };
}

test('against a drop the handler\'s pull-up off a pick is more open than against a switch', () => {
  const pullUp = (s, i) => (i.team === 0 && i.ended.how === 'shot' && i.ended.pick && i.ended.from === 'jumper' ? i.ended.look.gap : null);
  const against = defence => meanOver(150, 1, pullUp, { teams: [0, { ...TEAMS[1], defence }] });
  const drop = against('dropBig'), sw = against('switchAll');
  assert.ok(drop.n >= 30 && sw.n >= 30, `${drop.n} and ${sw.n} pull-ups`);
  assert.ok(drop.mean > sw.mean + 0.1, `drop ${drop.mean.toFixed(2)} m, switch ${sw.mean.toFixed(2)} m`);
});

test('against slow defenders the coach calls more isolations: he hunts the mismatch', () => {
  const isoShare = slow => {
    let iso = 0, all = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = simulate(ready(seed, { change: st => { if (slow) for (const p of st.rosters[1]) { p.ratings.speed -= 25; p.ratings.defence -= 15; } } }));
      for (const [kind, [, n]] of Object.entries(s.coach[0].memory)) if (kind !== 'transition' && kind !== 'none') { all += n; if (kind === 'iso') iso += n; }
    }
    return iso / all;
  };
  const usual = isoShare(false), slow = isoShare(true);
  assert.ok(slow > usual * 1.2, `iso ${(100 * usual).toFixed(1)}% of plays, against slow defenders ${(100 * slow).toFixed(1)}%`);
});

test('a team that reads the game poorly takes worse shots and loses the ball more', () => {
  const play = iq => {
    let ep = 0, shots = 0, tov = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = simulate(ready(seed, { change: st => { for (const p of st.rosters[0]) p.iq = iq; } }),
        (st, what, i) => { if (what === 'end' && i.team === 0 && i.ended.how === 'shot') { ep += i.ended.look.ep; shots++; } });
      tov += teamLine(s, 0).tov;
    }
    return { ep: ep / shots, tov: tov / 60 };
  };
  const dull = play(0.35), sharp = play(0.95);
  assert.ok(dull.ep < sharp.ep, `expected points a shot: ${dull.ep.toFixed(3)} against ${sharp.ep.toFixed(3)}`);
  assert.ok(dull.tov > sharp.tov, `turnovers ${dull.tov.toFixed(1)} against ${sharp.tov.toFixed(1)}`);
});

test('with the game on the line the ball goes to the star', () => {
  let clutch = 0, clutchStar = 0, other = 0, otherStar = 0, on = false;
  for (let seed = 1; seed <= 250; seed++) {
    quickMatch({ seed, watch: (s, what, i) => {
      if (what === 'start') { on = situation(s, i.team).clutch; return; }
      if (what !== 'end' || i.ended.how !== 'shot') return;
      const star = i.ended.look.shooter.person === starOf(s, i.team);
      if (on) { clutch++; clutchStar += star; } else { other++; otherStar += star; }
    } });
  }
  assert.ok(clutch >= 25, `${clutch} clutch shots`);
  assert.ok(clutchStar / clutch > otherStar / other + 0.15, `the star takes ${(100 * clutchStar / clutch).toFixed(0)}% of clutch shots, ${(100 * otherStar / other).toFixed(0)}% of the rest`);
});

// ---- Outcomes (Task 5.3), each against its ratings ----

const court = () => { const s = ready(1); s.players.forEach(p => { personOf(s, p).energy = 1; }); return s; };
const shooterAndMan = s => [s.players.find(p => p.team === 0), s.players.find(p => p.team === 1)];

test('a better shooter\'s look has a better chance, and a closer defender a worse one', () => {
  const s = court(), [me, him] = shooterAndMan(s), person = personOf(s, me);
  const chance = (rating, gap) => { person.ratings.three = rating; let c = 0; for (let i = 0; i < 200; i++) c += look(s, me, 'arc3', gap, him).chance; return c / 200; };
  assert.ok(chance(90, 1.5) > chance(65, 1.5) + 0.03);
  assert.ok(chance(80, 2.0) > chance(80, 0.5) + 0.05);
});

test('a better defender blocks more shots at the rim', () => {
  const blocks = defence => {
    const s = court(), [me, him] = shooterAndMan(s); personOf(s, him).ratings.defence = defence;
    let n = 0;
    for (let i = 0; i < 3000; i++) { personOf(s, me).energy = 1; n += shoot(s, look(s, me, 'rim', 0.8, him)).result === 'blocked'; }
    return n / 3000;
  };
  const good = blocks(95), poor = blocks(55);
  assert.ok(good > poor * 1.3, `${good} against ${poor}`);
});

test('a defender on top of the shooter fouls him more often', () => {
  const fouled = gap => {
    const s = court(), [me, him] = shooterAndMan(s);
    let n = 0;
    for (let i = 0; i < 3000; i++) { personOf(s, me).energy = 1; n += shoot(s, look(s, me, 'rim', gap, him)).fouled; }
    return n / 3000;
  };
  const close = fouled(0.5), off = fouled(1.5);
  assert.ok(close > off * 1.5, `${close} against ${off}`);
});

test('better ball handlers lose the ball less', () => {
  const tov = change => { let n = 0; for (let seed = 1; seed <= 60; seed++) n += teamLine(simulate(ready(seed, { change: s => { for (const p of s.rosters[0]) p.ratings.handle += change; } })), 0).tov; return n / 60; };
  const sure = tov(15), loose = tov(-15);
  assert.ok(sure < loose, `${sure.toFixed(1)} against ${loose.toFixed(1)}`);
});

test('better rebounders take more of their own misses', () => {
  const share = rating => {
    const s = court(); for (const p of s.rosters[0]) p.ratings.rebound = rating;
    let n = 0; for (let i = 0; i < 3000; i++) n += rebound(s, 0, 'mid').offensive;
    return n / 3000;
  };
  assert.ok(share(90) > share(60) + 0.05);
});

test('better shooters make more of their free throws', () => {
  const made = rating => {
    const s = court(), [me] = shooterAndMan(s), person = personOf(s, me); person.ratings.mid = person.ratings.three = rating;
    let n = 0; for (let i = 0; i < 1000; i++) { person.energy = 1; n += freeThrows(s, me, 2).made; }
    return n / 2000;
  };
  assert.ok(made(92) > made(60) + 0.08);
});

// ---- Ratings matter, and three a side (Task 5.6) ----

// Team 0's mean of `measure(state)` over `games` games, with `change(state)` made before the tip.
function over(games, change, measure) {
  let sum = 0;
  for (let seed = 1; seed <= games; seed++) sum += measure(simulate(ready(seed, { change })));
  return sum / games;
}
const lineOf = (s, t) => teamLine(s, t);

test('better three-point shooters make more of their threes, and take more', () => {
  // Over 150 games: a team ten points better from three is guarded tighter for it, and still makes more and takes more.
  const of = up => { let made = 0, taken = 0; over(150, s => { for (const p of s.rosters[0]) p.ratings.three += up; }, s => { const l = lineOf(s, 0); made += l.tpm; taken += l.tpa; return 0; }); return { pct: made / taken, taken }; };
  const was = of(0), now = of(10);
  assert.ok(now.pct > was.pct, `3P% ${was.pct.toFixed(4)} -> ${now.pct.toFixed(4)}`);
  assert.ok(now.taken > was.taken, `3PA ${was.taken} -> ${now.taken}`);
});

test('a better defence lowers the other team\'s eFG%', () => {
  const efg = up => { let fgm = 0, tpm = 0, fga = 0; over(80, s => { for (const p of s.rosters[1]) p.ratings.defence += up; }, s => { const l = lineOf(s, 0); fgm += l.fgm; tpm += l.tpm; fga += l.fga; return 0; }); return (fgm + 0.5 * tpm) / fga; };
  const was = efg(0), now = efg(10);
  assert.ok(now < was - 0.005, `${was.toFixed(3)} -> ${now.toFixed(3)}`);
});

test('a team\'s five starters beat three of its bench and two starters more often than not', () => {
  // The other side never has the three starters it leaves out: its bench is the same three bench players again.
  const waves = TEAMS[0], again = i => ({ ...waves.players[i], name: `${waves.players[i].name} Jr.`, number: waves.players[i].number + 50 });
  const benched = { ...waves, players: [waves.players[5], waves.players[6], waves.players[7], waves.players[0], waves.players[1], again(5), again(6), again(7)] };
  let wins = 0;
  for (let seed = 1; seed <= 200; seed++) { const s = quickMatch({ seed, teams: [waves, benched] }); if (s.score[0] > s.score[1]) wins++; }
  assert.ok(wins > 100, `${wins} of 200`);
});

test('three a side: games end, the box scores add up, and the pace is believable for a half court of six (60-110 a team per 48 minutes)', () => {
  let poss = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const s = quickMatch({ seed, size: 3 });
    assert.equal(s.phase, 'final');
    assert.notEqual(s.score[0], s.score[1]);
    for (const t of [0, 1]) { const l = teamLine(s, t); assert.equal(l.pts, s.score[t]); assert.equal(l.pts, 2 * l.fgm + l.tpm + l.ftm); poss += s.possessions[t] * (2880 / lengthOf(s)); }
    for (const t of [0, 1]) assert.ok(Math.abs(s.rosters[t].reduce((a, p) => a + p.secs, 0) - 3 * lengthOf(s)) < 0.01, 'three a side, three on court');
  }
  const pace = poss / 60;
  assert.ok(pace >= 60 && pace <= 110, `${pace.toFixed(1)} possessions a team per 48 minutes`);
});
