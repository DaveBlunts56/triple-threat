import { createKeys, keyOf } from './keys.js';

// The keys' intent turned to the court for a camera looking along `heading` ({ x, z }, a unit vector on the floor): W
// runs up the screen and D to its right, whichever way that is. The intent's moveX is right and moveZ is down the screen.
export const steer = (intent, heading) => ({ ...intent,
  moveX: -intent.moveX * heading.z - intent.moveZ * heading.x,
  moveZ: intent.moveX * heading.x - intent.moveZ * heading.z });

// The actions the keyboard turns into an Intent; the others (plays, timeout, camera, quality) are the page's.
const HELD = ['up', 'left', 'down', 'right', 'sprint', 'shoot', 'pass', 'steal', 'hold', 'cross', 'legs', 'back', 'stepBack', 'fade'];

// Tracks held keys on `target` (the window in the game) and reports them as an Intent. `keys` says which key does
// what (see keys.js); it is read at every press, so a key changed in the Keys panel counts from then on.
export function createKeyboard(target, keys = createKeys()) {
  // `tapped`: keys pressed since the last read. A tap shorter than one frame would otherwise never be seen.
  // `dropped`: keys held when drop() was called, ignored until they are let go. All three hold keys as keyOf gives
  // them, so the two Shift keys are one.
  const held = new Set(), tapped = new Set(), dropped = new Set(), down = new Set();   // down: the keyboard codes pressed now
  target.addEventListener('keydown', e => {
    const key = keyOf(e.code);
    down.add(e.code);
    if (!HELD.some(action => keys[action] === key)) return;
    e.preventDefault();   // Space would otherwise scroll the page
    if (dropped.has(key)) return;
    held.add(key); tapped.add(key);
  });
  target.addEventListener('keyup', e => {
    const key = keyOf(e.code);
    down.delete(e.code);
    if ([...down].some(code => keyOf(code) === key)) return;   // the other Shift is still down
    held.delete(key); dropped.delete(key);
  });
  // A key released while the window is unfocused never sends keyup: drop everything.
  target.addEventListener('blur', () => { held.clear(); tapped.clear(); dropped.clear(); down.clear(); });

  const on = action => held.has(keys[action]) || tapped.has(keys[action]);
  const read = intent => { tapped.clear(); return intent; };
  return {
    // As the screen has them: moveX is right, moveZ is down. steer() turns them to the court for the camera.
    intent: () => read({
      moveX: on('right') - on('left'),
      moveZ: on('down') - on('up'),
      sprint: on('sprint'),
      shoot: on('shoot'),
      pass: on('pass'),
      steal: on('steal'),
      switch: on('pass'),
      hold: on('hold'),
      foul: false,   // only the computer fouls on purpose
      cross: on('cross'), legs: on('legs'), back: on('back'), stepBack: on('stepBack'), fade: on('fade'),
    }),
    // Forgets every key held now, or only those of the keyboard codes `codes` that are: each stays unseen, auto-repeats
    // too, until it is let go. Keys not held are unaffected.
    drop: codes => {
      for (const key of codes ? codes.map(keyOf) : [...held]) if (held.delete(key)) { dropped.add(key); tapped.delete(key); }
    },
  };
}
