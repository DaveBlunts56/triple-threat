// Who guards whom. Every player has a man: the one opponent he guards. This file is the only place that reads or
// changes it.

// The opponent `player` guards.
export const manOf = (state, player) => state.players[player.man];

// The opponent who guards `player`.
export const guardOf = (state, player) => state.players.find(o => o.man === player.id);

// Puts everyone back on his own man: the opponent in his place of the team's order.
export function ownMen(state) {
  for (const p of state.players) {
    p.man = state.players.find(o => o.team !== p.team && o.slot === p.slot).id;
    p.switchWait = 0;
  }
}
