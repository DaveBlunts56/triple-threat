// The fast engine's box scores set beside what each player is (Review Stage 5): every pairing of the league's teams,
// played twice in Simulation, each player's numbers per 36 minutes against his position, ratings and tendencies.
// The position sets the context; the player's own profile must set him apart from his peers. The extremes must stay
// rare, the game-to-game spread real, and every box score must add up. (tools/sim/audit.mjs prints the whole audit.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect, mean, mpg, per36, sd, withinPositions } from '../tools/sim/audit.mjs';

const data = collect('quick', 2, 12);
const regulars = data.players.filter(p => mpg(p) >= 12);
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
// How far a player's rate of `key` follows `x(player)` among players of his own position.
const within = (x, key) => withinPositions(regulars, x, p => per36(p, key));
// The mean rate of `key` at each position.
const byPosition = key => Object.fromEntries(POSITIONS.map(pos => [pos, mean(regulars.filter(p => p.position === pos).map(p => per36(p, key)))]));
// The share of team-games in which some player's line passes `test`.
const perTeamGame = pass => data.players.flatMap(p => p.games).filter(pass).length / (2 * data.checks.games);
const shown = rows => JSON.stringify(Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, Number(v.toFixed(2))])));

test('every box score adds up: points from the shots, five a side for the whole game, rebounds within the misses, assists within the baskets', () => {
  assert.deepEqual(data.checks, { games: 132, pointsOff: 0, minutesOff: 0, reboundsOff: 0, assistsOver: 0 });
});

test('rebounds: the position sets the context, and the player\'s own rating sets him apart from his peers', () => {
  const at = byPosition('reb');
  assert.ok(at.C > at.PF && at.PF > at.SF && at.SF > Math.max(at.PG, at.SG), shown(at));
  assert.ok(Math.min(at.PG, at.SG) > 2.5 && at.C < 14, `guards still rebound, centres do not take everything: ${shown(at)}`);
  const rating = within(p => p.ratings.rebound, 'reb'), crash = within(p => p.tend.crash, 'orb');
  assert.ok(rating > 0.35 && crash > 0.5, `within positions: rebounds and rating r = ${rating.toFixed(2)}, offensive rebounds and crashing r = ${crash.toFixed(2)}`);
});

test('the rest of the line follows the player: shots his usage, assists his handle and passing, blocks his defence, steals his gambling, fouls his habit', () => {
  const r = {
    'shots~usage': within(p => p.tend.usage, 'fga'), 'assists~handle': within(p => p.ratings.handle, 'ast'),
    'assists~passFirst': within(p => p.tend.passFirst, 'ast'), 'blocks~defence': within(p => p.ratings.defence, 'blk'),
    'steals~gamble': within(p => p.tend.gamble, 'stl'), 'fouls~foul': within(p => p.tend.foul, 'fouls'),
  };
  assert.ok(Object.values(r).every(v => v > 0.2), `within positions: ${shown(r)}`);
  // And the positions still read as positions: the point guard passes most, the centre blocks most and steals least.
  const [ast, blk, stl] = [byPosition('ast'), byPosition('blk'), byPosition('stl')];
  assert.ok(ast.PG > ast.C && blk.C > Math.max(blk.PG, blk.SG) && stl.C < stl.PG, `assists ${shown(ast)}, blocks ${shown(blk)}, steals ${shown(stl)}`);
});

test('the nights vary as real ones do, and the extremes stay rare: fouling out under one team-game in ten, 40 points under one in five', () => {
  const starters = data.players.filter(p => mpg(p) >= 25);
  const spread = mean(starters.map(p => sd(p.games.map(g => g.pts)) / Math.max(0.5, mean(p.games.map(g => g.pts)))));
  assert.ok(spread > 0.3 && spread < 0.55, `a starter's points vary by ${(100 * spread).toFixed(0)}% of his mean`);
  const rare = { fouledOut: perTeamGame(g => g.fouls >= 6), forty: perTeamGame(g => g.pts >= 40) };
  assert.ok(rare.fouledOut > 0 && rare.fouledOut < 0.1 && rare.forty > 0 && rare.forty < 0.2, shown(rare));
});
