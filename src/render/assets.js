// The files the game loads besides its code, and where to load each from.
export const ASSETS = Object.freeze(['assets/players.glb', 'assets/motion.glb', 'assets/motion.json']);

// Served from a folder, a file is fetched by its own path. In the single-file build the loader has already
// turned each packed file into a blob: URL and listed it in TT_ASSETS, so nothing is asked of the network.
export const assetUrl = path => globalThis.TT_ASSETS?.[path] ?? path;
