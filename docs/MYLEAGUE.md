# MyLeague development

## Milestones

1. **Playable foundation – ready for owner review.** Create a named slot, choose a team and settings, play, watch or simulate fixtures, check standings and box scores, complete the playoffs, and start the next season. The archive preserves each season. See the handoff for verification and device coverage.
2. **Dynamic universe.** Give players persistent identities independent of their current club and jersey number. Add ages, uncertain development, coaching and team-building decisions. Measure divergence against the fixed-roster foundation.
3. **Front office.** Add roster management, contracts, trades, free agency, scouting and drafts. Preserve the player's face and paint the new club's kit, as the owner requested. The model lookup currently takes a club and jersey number.
4. **Personality and events.** Extend the confidence and rivalries that already carry between fixtures. Add chemistry, relationships and a shared history of verified basketball events.
5. **CourtSide and TTN.** Give both applications the same dated event IDs. Build profiles, feeds, articles and analysis from recorded facts.
6. **Broadcast and presentation.** Feed franchise context into the existing broadcast director, reactions and dead-ball cinematics. Preserve the skip controls.
7. **Test and polish.** Extend the headless lab for each new system. Check decade-scale stability, saves, browser interaction and frame times on the owner's Chromebook.

The owner reviews and merges each playable milestone separately. SimCast and mid-game entry need a possession-boundary handoff between the engines. The current quick engine can observe a possession and returns a finished game. Resuming 3D at an arbitrary beat also requires a legal clock, possession, locations and substitutions.

## Match and calendar

The catalogue in `src/sim/teams.js` supplies the twelve league keys and their conferences. The two development clubs stay in exhibition. A universe saves those keys. The match adapter resolves them into the renderer's team indices. Both engines receive the same fixture seed, rosters, style, quarter length, home team and moods. The human's team occupies side zero, even on the road. The adapter converts the final back to home/away order.

The seed shuffles a round-robin rotation. Each club meets all eleven opponents before the rotation repeats. Opponents alternate venues. For pairs that meet an odd number of times, the calendar distributes the extra home dates along closed walks so every club hosts exactly half its games. A round gives each club one game, with one or two days between regular-season rounds. The league advances in fixture order. Standings sort by win percentage, wins, point differential, points scored and club key. The top four in each conference qualify. A series alternates venues, starting with the higher seed, and ends on the clinching win.

`src/franchise/league.js` accepts only a final for the pending season, fixture, seed and teams. It checks the player lines against the score, keeps regular-season and playoff totals apart, and advances the bracket. It maps match-local rivalry pairs back to club and player number and rebases their clocks for the next meeting. A quit leaves the pending fixture available. The showcase roster is read-only.

The website runs the quick engine in a module worker. The standalone build yields between games. The UI can stop a batch at the next committed game. The main loop skips court rendering while the franchise dialog is open.

## Saves and checks

IndexedDB schema 1 keeps slot metadata, the active checkpoint and immutable seasons in separate stores. A transaction compares the loaded revision with the current one before writing. Starting the following season and archiving the old one share a transaction. A failed write keeps the prior checkpoint. If a stored slot fails validation, the library can restore its previous checkpoint into a new slot. A failed played-game save can be retried or recovered into a new slot. Import creates a fresh slot ID. The export holds the entire universe in one versioned JSON file. Reading an archive or importing a save reconstructs its schedule and playoff bracket and checks the totals. Future schemas must migrate existing saves explicitly.

Run `node --test tests/franchise*.test.js` for the focused foundation tests, including the worker bridge and injected storage failures. Run `node tools/franchise/lab.mjs 100 10` for one hundred ten-season universes, or `node tools/franchise/lab.mjs 2 25 101` for longer saves. The optional third argument chooses the first seed. The lab uses 14 games per club, three-minute Simulation quarters, five a side, and best-of-three playoffs. It reports championship counts, repeat titles, scoring, shooting percentage, the highest individual score, save size and elapsed time. Every universe checks the season length and validates its JSON round trip. On failure it prints the seed, season and fixture.

For browser acceptance, create a slot, finish one fixture, reload the page, open the slot and check its record and box score. Open a second copy of the slot, advance the first and try to save the stale copy. Export and import a slot with a completed season and open its archived bracket. On the Chromebook, check cancellation during a full-season simulation and a playable road game in the home club's arena.
