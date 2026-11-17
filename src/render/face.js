// A player's face: he blinks now and then, and shows effort, a shout or dejection when what he does calls for it. The
// expressions are morph targets on his skin (made in tools/blender/build_players.py from the generator's expression
// units); this sets how much of each shows. No Three.js here, so it can be tested without a browser.
import { STEAL } from '../sim/tuning.js';
import { CELEBRATIONS } from '../broadcast/reactions.js';

// blinkEvery: the seconds between blinks, at least and at most, different for each player. blinkFor: how long a
// blink lasts. ease: the seconds an expression takes to come in or go out. reach: for this many seconds after a
// swipe at the ball he shows effort. grimace, down: the frustration at which a defender grimaces, and the confidence
// at or below which he hangs his head while the ball is dead (see faceWants).
export const FACE = Object.freeze({ blinkEvery: Object.freeze([2, 6]), blinkFor: 0.12, ease: 0.15, reach: 0.4, grimace: 0.6, down: -0.5 });

const MOODS = ['effort', 'shout', 'dejected'];

// A small seeded generator (xorshift): the same blinks for the same player every time, different for each.
function randomFrom(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// The face of the mesh that carries the expressions (`morphTargetDictionary` naming blink, effort, shout and
// dejected; any it lacks are left out, and a mesh with none is left alone). `seed`: different for each player.
// update(dt, wants): moves on by dt seconds; `wants` says which of effort, shout and dejected he shows (see faceWants).
// reset(): a neutral face, his next blink a fresh wait away.
export function createFace(mesh, seed) {
  const slots = mesh?.morphTargetDictionary ?? {}, influences = mesh?.morphTargetInfluences ?? [];
  const set = (name, value) => { if (slots[name] !== undefined) influences[slots[name]] = value; };
  const random = randomFrom(seed);
  const wait = () => FACE.blinkEvery[0] + random() * (FACE.blinkEvery[1] - FACE.blinkEvery[0]);
  let untilBlink = wait(), blinking = -1;   // seconds to the next blink; seconds into this one, or -1 between them
  const shown = { effort: 0, shout: 0, dejected: 0 };
  return {
    update(dt, wants = {}) {
      untilBlink -= dt;
      if (blinking < 0 && untilBlink <= 0) { blinking = 0; untilBlink += wait(); }
      // Shut and open again, as at the middle of this frame.
      set('blink', blinking < 0 ? 0 : Math.sin(Math.PI * Math.min(0.999, (blinking + dt / 2) / FACE.blinkFor)));
      if (blinking >= 0 && (blinking += dt) >= FACE.blinkFor - 1e-9) blinking = -1;
      for (const mood of MOODS) {
        const step = dt / FACE.ease;
        shown[mood] = wants[mood] ? Math.min(1, shown[mood] + step + 1e-9) : Math.max(0, shown[mood] - step - 1e-9);
        set(mood, shown[mood]);
      }
    },
    reset() {
      for (const mood of MOODS) shown[mood] = 0;
      blinking = -1;
      untilBlink = wait();
      for (const name of ['blink', ...MOODS]) set(name, 0);
    },
  };
}

// What the face of `player` shows on this frame: effort while he gathers and rises for a finish or a fade, in a
// step-back, and just after a swipe at the ball; a shout while the broadcast has him celebrating and dejection while it
// has him beaten (`marks.show`, see motion.js).
// His mood shows as well (see mood.js), given `feel`: { mood, defending, dead }: a frustrated man grimaces on defence,
// and one whose confidence is gone hangs his head while the ball is dead.
export function faceWants(player, marks, feel = {}) {
  const mood = feel.mood ?? { confidence: 0, frustration: 0 };
  return {
    effort: (player.shooting && (player.finish !== null || player.fading)) || player.move?.kind === 'stepBack'
      || player.stealCooldown > STEAL.cooldown - FACE.reach || (!!feel.defending && mood.frustration >= FACE.grimace),
    shout: marks?.show?.celebrate === player.id || CELEBRATIONS.includes(marks?.show?.react?.[player.id]?.clip),
    dejected: marks?.show?.dejected === player.id || ['dejected', 'headHands'].includes(marks?.show?.react?.[player.id]?.clip) || (!!feel.dead && mood.confidence <= FACE.down),
  };
}
