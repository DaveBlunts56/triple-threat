// The decision maker: of the options open to a player, each worth so many expected points, he takes one at random,
// the better ones more often. How sharply the best wins depends on how well he decides (his IQ) and the side's IQ
// slider: a sharp player nearly always takes the best, a poor one sometimes takes a worse one. That is where a
// computer player's mistakes come from: the choice, never a dice roll that takes the ball off him.
import { rand } from './state.js';
import { styled } from './styles.js';
import { overall } from './overall.js';

// The spread of his choices, in expected points: the style's, wider the lower his IQ, narrower the higher the slider.
export const temperature = (state, iq, side) => (styled(state, 'decide.temperature') * (1.25 - iq)) / styled(state, side === 'defence' ? 'iq.defence' : 'iq.offence');

// His IQ as the side's IQ slider sharpens it, the same way it narrows his choices: 1.25 less what he lacks of that,
// divided by the slider. At the slider's middle it is his IQ.
export const sharpness = (state, iq, side) => 1.25 - (1.25 - iq) / styled(state, side === 'defence' ? 'iq.defence' : 'iq.offence');

// How much his team-mates look for `person` (of `team`) with the ball, beyond what he would make of it: the style's pull
// toward a star, in full for a player of STAR_AT overall or better, part of it for one a point or two below. More for
// a star who has had little of the ball so far in the match, less for one who has had plenty: a coach gets his stars
// going (his share of the team's plays, against a fifth).
export const STAR_AT = 83;
const plays = line => line.fga + 0.44 * line.fta + line.tov;
export function starPull(state, person, team) {
  const pull = styled(state, 'decide.stars') * Math.min(1, Math.max(0, (overall(person) - (STAR_AT - 3)) / 3));
  if (!(pull > 0)) return 0;
  const all = state.rosters[team].reduce((sum, p) => sum + plays(p.stats), 0) + state.teamStats[team].tov;
  const share = (plays(person.stats) + 1) / (all + 5);
  return pull * Math.min(1.8, Math.max(0.3, 1 + 6 * (0.2 - share)));
}

// `options`: [{ key, value, ... }], `value` in expected points, -Infinity for one not allowed. Returns the option
// taken, or null when none is allowed. Draws one number from the match's dice when there is more than one to choose.
export function choose(state, options, iq, side = 'offence') {
  const open = options.filter(o => o.value > -Infinity);
  if (open.length <= 1) return open[0] ?? null;
  const t = Math.max(1e-6, temperature(state, iq, side)), top = Math.max(...open.map(o => o.value));
  const weights = open.map(o => Math.exp((o.value - top) / t));
  let at = rand(state) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < open.length; i++) if ((at -= weights[i]) < 0) return open[i];
  return open[open.length - 1];
}
