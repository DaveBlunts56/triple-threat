// The browser's own voice, if it has one. Every call is safe where there is none.
export function createVoice(synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance) {
  const available = !!synth && typeof synth.speak === 'function' && typeof Utterance === 'function';
  // An English voice if the device has one; otherwise whatever it speaks with by default.
  const english = () => {
    const voices = synth.getVoices?.() ?? [];
    return voices.find(v => /^en\b/i.test(v.lang) && v.default) ?? voices.find(v => /^en\b/i.test(v.lang)) ?? null;
  };
  return {
    available,
    // Says `text` now, in place of whatever was being said: the commentary has already decided this line is the one.
    speak(text) {
      if (!available) return;
      try {
        synth.cancel();
        const line = new Utterance(text), voice = english();
        if (voice) line.voice = voice;
        line.rate = 1.15;
        synth.speak(line);
      } catch { /* a voice that fails is silence, and the caption still shows */ }
    },
    stop() { try { if (available) synth.cancel(); } catch { /* nothing to stop */ } },
  };
}
