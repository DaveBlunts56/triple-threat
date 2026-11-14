// Cuts the game's sounds out of the downloaded recordings. Usage: node tools/sound/build.mjs
// Reads tools/sound/cuts.json and the files in assets/source/sounds/ (not committed; see assets/CREDITS.md for where
// each came from) and writes assets/sounds/<out>.ogg: mono, 44.1 kHz, Vorbis.
//
// A cut is { out, src, start, end, peak, fadeIn?, fadeOut?, tempo? }: seconds of the source, the peak it is brought
// to in dB, fades in seconds, and a tempo (0.55 plays it nearly twice as long at the same pitch).
// A loop is { out, src, start, length, cross, peak, loop: true }: `length` seconds whose end is cross-faded into its
// own beginning over `cross` seconds, so that it repeats without a seam.
// A mix is { out, mix: [{ src, start, end, gain }], peak, fadeIn?, fadeOut? }: the parts laid over each other.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const from = name => join(root, 'assets', 'source', 'sounds', name), to = name => join(root, 'assets', 'sounds', `${name}.ogg`);
const cuts = JSON.parse(readFileSync(join(root, 'tools', 'sound', 'cuts.json'), 'utf8'));
mkdirSync(join(root, 'assets', 'sounds'), { recursive: true });

// The ffmpeg inputs and the filter graph that makes the cut, ending in the label [cut].
function graph(cut) {
  const inputs = [], steps = [];
  const part = (src, start, end, label) => {
    inputs.push('-i', from(src));
    steps.push(`[${inputs.length / 2 - 1}:a]aformat=channel_layouts=mono,aresample=44100,atrim=${start}:${end},asetpts=PTS-STARTPTS[${label}]`);
  };
  let length;
  if (cut.mix) {
    cut.mix.forEach((m, i) => { part(m.src, m.start, m.end, `p${i}`); steps.push(`[p${i}]volume=${m.gain}[g${i}]`); });
    steps.push(`${cut.mix.map((_, i) => `[g${i}]`).join('')}amix=inputs=${cut.mix.length}:duration=longest:normalize=0[raw]`);
    length = Math.max(...cut.mix.map(m => m.end - m.start));
  } else if (cut.loop) {
    // The body, then its own lead-in faded over its end: the last moment of the loop is the moment before its first.
    part(cut.src, cut.start + cut.cross, cut.start + cut.cross + cut.length, 'body');
    part(cut.src, cut.start, cut.start + cut.cross, 'lead');
    steps.push(`[body][lead]acrossfade=d=${cut.cross}:c1=tri:c2=tri[raw]`);
    length = cut.length;
  } else {
    part(cut.src, cut.start, cut.end, 'raw0');
    steps.push(cut.tempo ? `[raw0]atempo=${cut.tempo}[raw]` : '[raw0]anull[raw]');
    length = (cut.end - cut.start) / (cut.tempo ?? 1);
  }
  const fades = [cut.fadeIn ? `afade=t=in:d=${cut.fadeIn}` : null, cut.fadeOut ? `afade=t=out:st=${Math.max(0, length - cut.fadeOut).toFixed(3)}:d=${cut.fadeOut}` : null].filter(Boolean);
  steps.push(`[raw]${fades.length ? fades.join(',') : 'anull'}[cut]`);
  return { inputs, steps };
}

for (const cut of cuts) {
  const { inputs, steps } = graph(cut);
  // Its peak as cut, then the gain that brings it to the peak asked for.
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...inputs, '-filter_complex', `${steps.join(';')};[cut]volumedetect[out]`, '-map', '[out]', '-f', 'null', '-'],
    { encoding: 'utf8' }).stderr ?? '';   // ffmpeg reports on stderr
  const max = Number(/max_volume: (-?[\d.]+) dB/.exec(probe)?.[1]);
  if (!Number.isFinite(max)) throw new Error(`${cut.out}: no peak found (is ${cut.src ?? cut.mix[0].src} in assets/source/sounds/?)`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', `${steps.join(';')};[cut]volume=${(cut.peak - max).toFixed(2)}dB[out]`,
    '-map', '[out]', '-ac', '1', '-ar', '44100', '-c:a', 'libvorbis', '-q:a', '3', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', to(cut.out)]);
  console.log(`${cut.out}.ogg  ${(statSync(to(cut.out)).size / 1024).toFixed(1)} KB  (peak ${max} dB brought to ${cut.peak})`);
}
console.log(`${cuts.length} sounds written to assets/sounds/`);
