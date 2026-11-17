// The loading screen: a spinner, what is being loaded, and how far it has got, over everything else. From the moment
// the page opens it is the splash (index.html has it up, as #loading.splash): the game's name over the menu's sky, the
// loading under it, and once the game can be played it asks for a key, a click or a tap to start (see ready). After
// that it is the plain screen, shown again while a match waits for its players (see main.js).
import * as THREE from 'three';

// Keys that never start the game from the splash: those held for others, and the browser's own (reload, full screen,
// the developer tools).
const NOT_START = /^(Shift|Control|Alt|Meta|Tab|CapsLock|F\d+)$/;
// How long the splash takes to fade into the menu, in milliseconds (index.html: #loading.going).
export const SPLASH_FADE = 350;

// Takes over the page's #loading. Returns { show(words, share), hide(), ready(win) }: `share` (0 to 1) fills the
// bar; without one the bar follows the files three.js is loading.
export function createLoading(doc) {
  const box = doc.getElementById('loading'), text = doc.getElementById('loadingText'), bar = doc.getElementById('loadingBar');
  const start = doc.getElementById('loadingStart');
  let following = true;   // whether the bar follows three.js's files
  let at = 0;              // how full the bar is
  const fill = share => { at = Math.max(0, Math.min(1, share)); bar.style.width = `${Math.round(at * 100)}%`; };
  // Files are found as others load, so the count of them grows: the bar never goes back.
  THREE.DefaultLoadingManager.onProgress = (url, loaded, total) => { if (following && total > 0) fill(Math.max(at, loaded / total)); };
  const hide = () => { box.hidden = true; following = true; fill(0); };
  return {
    show(words, share = null) {
      box.hidden = false;
      if (text.textContent !== words) text.textContent = words;
      following = share === null;
      if (share !== null) fill(share);
    },
    hide,
    // The splash's last step, once the game can be played: it asks for a key, a click or a tap (`touch`: the words for
    // a touch screen), and fades into the menu when one comes. The key that starts the game does nothing else: `win`'s
    // own listeners, the menu's among them, never see it. Resolves as it starts to fade.
    ready(win, touch = false) {
      box.classList.add('ready');
      start.textContent = touch ? 'Tap to start' : 'Press any key to start';
      start.hidden = false;
      return new Promise(resolve => {
        const go = e => {
          if (e.type === 'keydown') {
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || NOT_START.test(e.key)) return;
            e.preventDefault(); e.stopImmediatePropagation();
          }
          win.removeEventListener('keydown', go, true);
          box.removeEventListener('click', go);
          box.classList.add('going');
          win.setTimeout(() => { hide(); box.classList.remove('splash', 'ready', 'going'); start.hidden = true; }, SPLASH_FADE);
          resolve();
        };
        win.addEventListener('keydown', go, true);   // before anything else on the page hears it
        box.addEventListener('click', go);
      });
    },
  };
}
