// What the fast engine knows instead of where everyone stands: the situations each kind of action creates. A look at
// the rim, a pull-up, a catch at the arc: how far out, how far off the defender, how long a beat takes. These are the
// engine's own numbers (the 3D game works them out from positions); they are tuned so that the two engines agree on
// the same style (tests/agree.test.js). Every number the style or a slider may change is read through styled() as in
// the 3D game; nothing here names a team.
const f = Object.freeze;

export const QUICK = f({
  // Seconds: an inbound brought up into the front court (divided by the team's pace), and one beat of the offence.
  bringUp: f([3, 5.5]),
  beat: f([1.52, 2.8]),
  // The share of possessions begun live (a defensive rebound, a steal) that are pushed, by how they began, and the
  // seconds a push takes before its shot.
  push: f({ dreb: 0.16, steal: 0.5 }),
  pushTime: f([2.5, 6.5]),
  // Metres from the rim's centre, by zone (see shooting.js, zoneFor).
  far: f({ rim: f([0.5, 1.3]), close: f([1.6, 2.9]), mid: f([3.2, 6.4]), corner3: f([6.85, 7.1]), arc3: f([7.1, 8.3]) }),
  // Metres between a shooter and his defender as the shot goes up, by the kind of look. A man found open is one
  // whose catch gap reaches AI.callAt's room (see possession.js).
  gap: f({ pullUp: f([0.6, 1.7]), catch: f([0.58, 2.05]), rim: f([0.42, 1.42]), post: f([0.35, 0.9]), push: f([1.0, 3.0]), forced: f([0.3, 0.9]) }),
  // What the defence's scheme does to a pick and roll: metres added to the handler's pull-up gap (a dropping big
  // gives it) and to the roller's (he catches against the big, or against the help).
  scheme: f({ drop: f({ pullUp: 0.6, roll: -0.3 }), switch: f({ pullUp: 0, roll: 0.2 }), over: f({ pullUp: 0.2, roll: 0.1 }) }),
  // The chance a team-mate can be reached by a pass on a beat: a clear lane, within range. Measured from the 3D game,
  // where a man with the ball who may pass has about 1.2 team-mates he can pass to.
  passLane: 0.55,
  // How much of a man's jump-shot diet that is not mid-range is threes (the rest of a jumper is mid-range).
  threeShare: 0.97,
  // How strongly the ball starts with the team's best ball handler: the power of his handle and IQ in the draw. Measured
  // from the 3D game, where who has the ball as it crosses half court is spread nearly evenly (its best handler about a
  // quarter of the time he is on court): in proportion.
  handlerPull: 1,
  // A look this open (metres) is a man found open: he may shoot it early in the shot clock.
  open: 1.8,
  // How likely a drive finds a lane: from laneBase and twice the style's appetite for the rim (a team that wants
  // the rim looks for lanes harder), moved by the handler's drive edge over his man, between these.
  lane: f([0.08, 0.55]), laneBase: 0.09,
  // The share of rolls that get the roller to the rim (the rest end in a short pull-up), and of offensive rebounds of
  // a miss near the rim that are put straight back up.
  rollsIn: 0.45, putback: 0.65,
  // Metres from the rim's centre of a post move: a fade or a turnaround, as the 3D game's post scorers take them.
  postFar: f([3.0, 4.2]),
  // The chance a missed shot is the offence's own, before the glass's numbers (crashers, box-outs, rebound ratings).
  oreb: 0.67,
  // The share of misses that go out of bounds before anybody has them: nobody's rebound (the 3D game's, as its
  // players read the carom).
  out: 0.085,
  // Blocks, by zone, before the defender's rating.
  block: f({ rim: 0.112, close: 0.066, mid: 0.018, corner3: 0.007, arc3: 0.007 }),
  // Shooting fouls, by zone: the share of shots on which a defender's contact is there to be called (the style's
  // chances then decide: foul.drive for a finish, foul.shooting for any shot).
  contact: f({ drive: f({ rim: 0.4, close: 0.18 }), air: f({ rim: 0.08, close: 0.05, mid: 0.025, corner3: 0.012, arc3: 0.012 }) }),
  // A beat's chance of losing the ball, before the handler's handle, his IQ and the defence: a bad pass, a strip on a
  // drive, a fumble. And the share of those that are steals.
  turnover: f({ pass: 0.08, drive: 0.102, hold: 0.036, stolen: 0.55 }),
  // Fouls away from a shot, a possession: on the ball (a reach or a block), and in the scramble for a rebound.
  reach: 0.043, looseBall: 0.02,
  // The share of baskets assisted, by how the scorer got the ball: off a catch he shot, a pass that put him at the rim,
  // a drive or post move of his own after a catch.
  assist: f({ catch: 0.85, feed: 0.85, drive: 0.45, post: 0.25 }),
  // How a possession's seconds are spent, for tiredness: sprinting, running, standing (the 3D game's own shares).
  effort: f({ sprint: 0.29, run: 0.49, rest: 0.22 }),
});

// Which plays bring which looks: whom the ball goes to, and what he gets. pick: a pick and roll (the handler, and the
// screener rolling or popping). post: a post-up for the big. catch: shooters coming off screens or cutting. iso: the
// handler alone.
export const KIND = f({ pickRoll: 'pick', pickPop: 'pop', spain: 'pick', horns: 'pick', iso: 'iso', postUp: 'post', floppy: 'catch', ucla: 'catch', giveGo: 'catch', fiveOut: 'catch' });

// A number between two, drawn from the match's dice.
export const within = (rand, [lo, hi]) => lo + rand() * (hi - lo);
