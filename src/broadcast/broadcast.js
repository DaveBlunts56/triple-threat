// The broadcast as the page uses it: it hears every step of the match, and once a frame says what is on the screen
// and what the commentator says. It never changes the match.
import { createWatch, watchStep } from './moments.js';
import { createBooth, lineFor, quietLine, rankOf, say } from './commentary.js';
import { createDirector, direct, panelFor, skipPanel } from './director.js';
import { createVoice } from './voice.js';

export function createBroadcast(voice = createVoice()) {
  let match = null, watch, booth, director, heard, caption;
  // A new match (the page makes a new state for each) starts everything afresh.
  const sync = state => {
    if (state === match) return;
    [match, watch, booth, director, heard, caption] = [state, createWatch(), createBooth(), createDirector(), [], null];
    voice.stop();
  };
  return {
    voice,
    // After each step of the match: `events` is what step() returned.
    hear(state, events) { sync(state); heard.push(...watchStep(watch, state, events)); },
    // The panel that should be up now ('lineups', 'period', 'half' or null). The match waits during the line-ups.
    panel(state, now) { sync(state); return panelFor(director, state, now); },
    // Any key during the line-ups.
    skip() { if (director) skipPanel(director); },
    // Once a frame, at real time `now` (seconds). `commentary` is the setting: 'voice', 'captions' or 'off'.
    // Returns { banner, lower, celebrate, dejected, caption, heard }: `heard` is everything since the last frame.
    frame(state, now, commentary) {
      sync(state);
      const list = heard;
      heard = [];
      const show = direct(director, list, state, now);
      if (commentary === 'off' || state.phase === 'start') caption = null;
      else {
        // The biggest thing heard is what gets said; a line that would only be dropped is not worded at all, so its
        // wordings are not used up.
        const lines = [...list].sort((a, b) => rankOf(b) - rankOf(a));
        let text = null;
        for (const h of lines) {
          if (now < booth.until && rankOf(h) <= booth.rank) continue;
          text = say(booth, lineFor(booth, h, state), rankOf(h), now);
          if (text) break;
        }
        if (!text && now >= booth.until) { const idle = quietLine(booth, state, now); if (idle) text = say(booth, idle, 0, now); }
        if (text) {
          caption = { text, until: booth.until + 0.6 };
          if (commentary === 'voice') voice.speak(text);
        }
      }
      if (caption && now >= caption.until) caption = null;
      return { ...show, caption: caption?.text ?? null, heard: list };
    },
    // Pausing: the voice stops in the middle of its line.
    hush() { voice.stop(); },
  };
}
