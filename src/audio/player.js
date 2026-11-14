// Plays the game's sounds with Web Audio. Every call is safe where there is no audio, before the sounds have loaded,
// and before the first key press (until which a browser lets nothing be heard).
export const LEVELS = Object.freeze({ full: 1, quiet: 0.4, off: 0 });
export const nextSound = now => ({ full: 'quiet', quiet: 'off', off: 'full' }[now] ?? 'full');

export function createPlayer(Context = globalThis.AudioContext ?? globalThis.webkitAudioContext) {
  let ctx = null, master = null, level = 1, hushed = false, waking = null;
  const files = {}, buffers = {}, loops = {};
  const volume = () => (hushed ? 0 : level);
  const player = {
    ready: false,   // the sounds are decoded and can be played
    // Fetches every sound (`urlOf(name)` is its address). Nothing is decoded until the first key press.
    async load(urlOf, names, fetcher = globalThis.fetch) {
      if (!Context || !fetcher) return false;
      try {
        await Promise.all(names.map(async name => { files[name] = await (await fetcher(urlOf(name))).arrayBuffer(); }));
        return true;
      } catch { return false; }   // a sound that cannot be fetched: the game is silent, and plays on
    },
    // The first key press or click: the browser now lets sound start. Decodes the sounds, once.
    wake() {
      if (!Context) return Promise.resolve(false);
      if (waking) { try { ctx.resume?.(); } catch { /* still asleep */ } return waking; }
      waking = (async () => {
        try {
          ctx = new Context();
          master = ctx.createGain(); master.gain.value = volume(); master.connect(ctx.destination);
          await ctx.resume?.();
          await Promise.all(Object.entries(files).map(async ([name, data]) => { buffers[name] = await ctx.decodeAudioData(data.slice(0)); }));
          player.ready = Object.keys(buffers).length > 0;
        } catch { player.ready = false; }
        return player.ready;
      })();
      return waking;
    },
    // One sound, once: `gain` 0 to 1, `rate` its speed.
    play(name, gain = 1, rate = 1) {
      if (!player.ready || !buffers[name] || volume() === 0) return;
      const source = ctx.createBufferSource(), own = ctx.createGain();
      source.buffer = buffers[name]; source.playbackRate.value = rate; own.gain.value = gain;
      source.connect(own); own.connect(master);
      source.start();
    },
    // A sound that goes round and round, at `gain`: started the first time it is asked for, and eased to each new gain.
    loop(name, gain) {
      if (!player.ready || !buffers[name]) return;
      if (!loops[name]) {
        const source = ctx.createBufferSource(), own = ctx.createGain();
        source.buffer = buffers[name]; source.loop = true; own.gain.value = 0;
        source.connect(own); own.connect(master);
        source.start();
        loops[name] = own;
      }
      const own = loops[name].gain;
      if (own.setTargetAtTime) own.setTargetAtTime(gain, ctx.currentTime, 0.25); else own.value = gain;
    },
    // The Sound setting: 'full', 'quiet' or 'off'.
    level(name) { level = LEVELS[name] ?? 1; if (master) master.gain.value = volume(); },
    // Silence while paused, whatever the setting.
    hush(on) { hushed = on; if (master) master.gain.value = volume(); },
  };
  return player;
}
