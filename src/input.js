const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyQ', 'KeyF']);

// Tracks held keys on `target` (the window in the game) and reports them as an Intent.
export function createKeyboard(target) {
  // `tapped`: keys pressed since the last read. A tap shorter than one frame would otherwise never be seen.
  // `dropped`: keys held when drop() was called, ignored until they are let go.
  const held = new Set(), tapped = new Set(), dropped = new Set();
  target.addEventListener('keydown', e => {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();   // Space would otherwise scroll the page
    if (dropped.has(e.code)) return;
    held.add(e.code); tapped.add(e.code);
  });
  target.addEventListener('keyup', e => { held.delete(e.code); dropped.delete(e.code); });
  // A key released while the window is unfocused never sends keyup: drop everything.
  target.addEventListener('blur', () => { held.clear(); tapped.clear(); dropped.clear(); });

  const on = code => held.has(code) || tapped.has(code);
  const read = intent => { tapped.clear(); return intent; };
  return {
    // The camera looks from +z toward -z, so "up the screen" (W) is -z and D is +x.
    intent: () => read({
      moveX: on('KeyD') - on('KeyA'),
      moveZ: on('KeyS') - on('KeyW'),
      sprint: on('ShiftLeft') || on('ShiftRight'),
      shoot: on('Space'),
      pass: on('KeyE'),
      steal: on('KeyQ'),
      switch: on('KeyE'),
      hold: on('KeyF'),
    }),
    // Forgets every key held now: each stays unseen, auto-repeats too, until it is let go. Keys not held are unaffected.
    drop: () => {
      for (const code of held) { dropped.add(code); tapped.delete(code); }
      held.clear();
    },
  };
}
