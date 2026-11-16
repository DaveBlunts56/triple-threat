// The decision maker: of the options open to a player, each worth so many expected points, he takes one at random,
// the better ones more often. How sharply the best wins depends on how well he decides (his IQ) and the side's IQ
// slider: a sharp player nearly always takes the best, a poor one sometimes takes a worse one. That is where a
// computer player's mistakes come from: the choice, never a dice roll that takes the ball off him.
import { rand } from './state.js';
import { styled } from './styles.js';

// The spread of his choices, in expected points: the style's, wider the lower his IQ, narrower the higher the slider.
export const temperature = (state, iq, side) => (styled(state, 'decide.temperature') * (1.25 - iq)) / styled(state, side === 'defence' ? 'iq.defence' : 'iq.offence');

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
