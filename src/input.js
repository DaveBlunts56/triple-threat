const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyQ']);

// Tracks held keys on `target` (the window in the game) and reports them as an Intent.
export function createKeyboard(target) {
  const held = new Set();
  target.addEventListener('keydown', e => {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();   // Space would otherwise scroll the page
    held.add(e.code);
  });
  target.addEventListener('keyup', e => held.delete(e.code));
  // A key released while the window is unfocused never sends keyup: drop everything.
  target.addEventListener('blur', () => held.clear());

  const on = code => held.has(code);
  return {
    // The camera looks from +z toward -z, so "up the screen" (W) is -z and D is +x.
    intent: () => ({
      moveX: on('KeyD') - on('KeyA'),
      moveZ: on('KeyS') - on('KeyW'),
      sprint: on('ShiftLeft') || on('ShiftRight'),
      shoot: on('Space'),
      pass: on('KeyE'),
      steal: on('KeyQ'),
      switch: on('KeyE'),
    }),
  };
}
