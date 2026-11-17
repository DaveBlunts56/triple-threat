// The broadcast as the page uses it: it hears every step of the match, and once a frame says what is on the screen
// and what the commentator says. It never changes the match.
import { createWatch, watchStep } from './moments.js';
import { createBooth, lineFor, quietLine, rankOf, say } from './commentary.js';
import { createDirector, direct, panelFor, skipPanel } from './director.js';
import { createVoice } from './voice.js';
import { createReactions, react } from './reactions.js';
import { closeCard, closeUp, createCinema, cue, skipClose } from './cinema.js';

export function createBroadcast(voice = createVoice()) {
  let match = null, watch, booth, director, heard, caption, reactions, cinema;
  // A new match (the page makes a new state for each) starts everything afresh.
  const sync = state => {
    if (state === match) return;
    [match, watch, booth, director, heard, caption, reactions, cinema] = [state, createWatch(), createBooth(), createDirector(), [], null, createReactions(), createCinema()];
    voice.stop();
  };
  return {
    voice,
    // After each step of the match: `events` is what step() returned.
    hear(state, events) { sync(state); heard.push(...watchStep(watch, state, events)); },
    // The panel that should be up now ('lineups', 'period', 'half' or null). The match waits while one is.
    // `busy`: a replay is on or about to be; the panel comes after it.
    panel(state, now, busy = false) { sync(state); return panelFor(director, state, now, busy); },
    // Any key while a panel is up.
    skip() { if (director) skipPanel(director); },
    // Any key while a close-up is on (see cinema.js): it ends, and the key does what it does.
    skipClose() { if (cinema) skipClose(cinema); },
    // Once a frame, at real time `now` (seconds). `commentary` is the setting: 'voice', 'captions' or 'off'.
    // Returns { banner, lower, celebrate, dejected, react, close, card, caption, heard }: `heard` is everything since the
    // last frame, `react` each reacting player's reaction (see reactions.js), `close` the close-up's camera and `card`
    // its card (see cinema.js), or null. `blocked`: a replay or a pause has the screen, and no close-up is on.
    frame(state, now, commentary, blocked = false) {
      sync(state);
      const list = heard;
      heard = [];
      const show = direct(director, list, state, now), reacting = react(reactions, list, state, now);
      cue(cinema, state, now, reacting, blocked);
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
      return { ...show, react: reacting, close: closeUp(cinema, state, now), card: closeCard(cinema, state), caption: caption?.text ?? null, heard: list };
    },
    // Pausing: the voice stops in the middle of its line.
    hush() { voice.stop(); },
  };
}
