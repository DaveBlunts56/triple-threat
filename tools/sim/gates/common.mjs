// What the gate scripts share. Each measures the checkout at ROOT: by default this one; set ROOT to another
// (`git worktree add ../base <commit>`, then link its node_modules) to measure the code before a change, and run
// both together on the same machine: only numbers measured side by side compare.
import { fileURLToPath } from 'node:url';

export const ROOT = process.env.ROOT ?? fileURLToPath(new URL('../../..', import.meta.url));
export const from = path => import(`${ROOT}/${path}`);
// The numbers after the script's name: `n` and `first` (for seeds), with defaults.
export const args = (...defaults) => defaults.map((d, i) => Number(process.argv[2 + i] ?? d));
export const pct = (now, was) => `${((now / was - 1) * 100).toFixed(1)}%`;
