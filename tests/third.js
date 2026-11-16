// A third team, made up for the tests and nowhere else: proof that a team added as data plays like any other.
export const THIRD_TEAM = Object.freeze({
  name: 'Lakeside Lanterns', abbr: 'LAN', playbook: 'balanced', defence: 'standard', coach: 'steady',
  players: ['Ezra Pike', 'Owen Tull', 'Milo Brandt', 'Felix Arno', 'Ravi Sund', 'Cole Wren', 'Abel Moss', 'Luis Varga'].map((name, i) => ({
    name, number: 40 + i, position: ['PG', 'SF', 'C', 'SG', 'PF', 'PG', 'SF', 'C'][i], role: ['Playmaker', 'Slasher', 'Rim protector', 'Sharpshooter', 'Stretch big', 'Role player', 'Two-way wing', 'Rebounder'][i],
    ratings: { inside: 70 + (i % 3) * 5, mid: 72, three: 68 + (i % 2) * 8, handle: 70, speed: 72, defence: 74, rebound: 70 + (i % 3) * 6, stamina: 76 },
  })),
});

