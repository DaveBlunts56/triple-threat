// What the shot meter shows, worked out from the match alone. No Three.js here, so it can be tested without a browser.
import { DT } from '../sim/tuning.js';
import { attackSign } from '../sim/state.js';
import { shotWindow } from '../sim/players.js';
import { styled } from '../sim/styles.js';

// The shot meter. stay: seconds it is kept after the release. aside: metres it stands from the shooter, on the side
// away from the hoop he attacks. high: the height its top is level with, about his shoulder; it does not rise with his
// jump. ease: the power its axis is bent by, so the last part of the fill's travel, where the band is, is drawn larger.
export const SHOT_METER = Object.freeze({ stay: 1.2, aside: 0.6, high: 1.45, ease: 2 });

// The meter of a shot `t` seconds after its press, beside `player`. `window` is what shotWindow gave, or the record of
// the release, which carries the same fields. The fill and the band are read on one axis, so the fill is inside the
// band exactly when a release at `t` is green.
function meterOf(player, t, window, frozen) {
  const { best, half } = window;
  // How far up the bar a moment `off` seconds before or after the best one sits: the top at the best moment, the
  // bottom at the press, and as far down after it as the same time before it.
  const up = off => Math.max(0, 1 - off / best) ** SHOT_METER.ease;
  return {
    player: player.id,
    x: player.x - attackSign(player.team) * SHOT_METER.aside, z: player.z,
    fill: up(Math.abs(t - best)),
    band: window.inRange ? { from: up(half + DT / 2), to: 1 } : null,   // the half step is greenAt's
    level: window.level,
    frozen,
  };
}

// The shot meter to draw, or null for none. Only team 0 gets one: live while one of them is in his shooting motion,
// then frozen as the rules judged the release, for SHOT_METER.stay seconds of match time. None in a style without a
// meter (Simulation), where a release is not judged.
export function shotMeter(state) {
  if (state.phase === 'start' || state.phase === 'final' || !styled(state, 'shot.meter')) return null;
  const shooter = state.players.find(p => p.team === 0 && p.shooting);
  if (shooter) return shooter.finish === 'dunk' ? null : meterOf(shooter, shooter.shotT, shotWindow(state, shooter), null);   // a dunk has nothing to time

  // The record outlives the shot, until the next press: only a fresh release by team 0 is shown.
  const { shot } = state;
  if (!shot || shot.finish === 'dunk' || state.players[shot.shooter].team !== 0 || state.time - shot.at > SHOT_METER.stay) return null;
  const verdict = shot.green ? 'green' : !shot.inRange ? 'range' : shot.t < shot.best ? 'early' : 'late';
  return meterOf(state.players[shot.shooter], shot.t, shot, { verdict, blocked: shot.blocked });
}
