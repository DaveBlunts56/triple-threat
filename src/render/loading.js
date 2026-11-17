// The loading screen: a spinner, what is being loaded, and how far it has got, over everything else. Shown from the
// moment the page opens (index.html has it up) until the game can be played, and again while a match waits for its
// players (see main.js).
import * as THREE from 'three';

// Takes over the page's #loading. Returns { show(words, share), hide() }: `share` (0 to 1) fills the bar; without
// one the bar follows the files three.js is loading.
export function createLoading(doc) {
  const box = doc.getElementById('loading'), text = doc.getElementById('loadingText'), bar = doc.getElementById('loadingBar');
  let following = true;   // whether the bar follows three.js's files
  let at = 0;              // how full the bar is
  const fill = share => { at = Math.max(0, Math.min(1, share)); bar.style.width = `${Math.round(at * 100)}%`; };
  // Files are found as others load, so the count of them grows: the bar never goes back.
  THREE.DefaultLoadingManager.onProgress = (url, loaded, total) => { if (following && total > 0) fill(Math.max(at, loaded / total)); };
  return {
    show(words, share = null) {
      box.hidden = false;
      if (text.textContent !== words) text.textContent = words;
      following = share === null;
      if (share !== null) fill(share);
    },
    hide() { box.hidden = true; following = true; fill(0); },
  };
}
