# Player tracking profiles

The 120 Triple Threat league players use individual shot, drive, passing and rotation inputs. The two development teams still use the game’s role and ratings model.

## Sources and coverage

The owner's private CSV supplied the equivalent for each club and jersey number. The importer checks the fictional player name against the roster. It drops the private crosswalk before emitting numeric profiles.

The requested NBA dashboards were the source specification. Direct endpoint requests timed out, so the import uses a pinned export of the same NBA tracking feeds. The Shot Dashboard feed was exported by defender distance. Adding its four distance buckets gives each player's general attempt totals, and the shot-zone export splits the two-point attempts between paint and midrange. [Shot Dashboard](https://www.nba.com/stats/players/shots-general?Season=2025-26) · [Drive Tracking](https://www.nba.com/stats/players/drives?Season=2025-26) · [Pinned data export](https://github.com/meharpalbasi/NBA_Lineup202324_Analyzer/tree/56a57c0c60117eb2104d1fd2ebf270c4ffd9ea5f/data)

- **114 players** use 2025–26 regular-season data.
- **Kyree Swerving** uses 2024–25 because the equivalent has no tracked minutes in 2025–26.
- **Andre Liberty, Trey Current, Jared Cloud, Lamar Shields, and Brent Alpine** use the early 2026–27 snapshot, their first available season in the export.

## How the game uses the data

- **Shot selection.** The game blends measured attempt shares into its existing paint, midrange and three-point preferences. Paint includes restricted-area shots and other paint attempts. Attempts guide shot choice while ratings and game context determine the outcome.
- **Driving.** Drives per 36 tracked minutes influence how often a player looks to attack when the lane opens.
- **Passing.** The share of drives ending in a pass informs the player's passing preference. It includes passes that did not lead to a shot or assist.
- **Rotation.** Tracked minutes per game contribute to the coach's minutes plan. The plan still budgets minutes for the match's length and lineup size.

The blend weights increase with sample size. A handful of shots, minutes or drives leave a player close to his existing role. Both match engines initialize from these profiles, including MyLeague fixtures.

Run `node tools/league/import-tracking.mjs matched.csv data-folder` to regenerate the numeric profiles. Use the private mapping and the regular-season exports named at the top of the script. Keep the inputs outside the repository.
