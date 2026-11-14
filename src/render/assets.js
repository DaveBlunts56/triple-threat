// The files the game loads besides its code, and where to load each from.
export const FLOOR_FILES = Object.freeze({
  colour: 'assets/floor/wood_floor_diff_2k.jpg', bumps: 'assets/floor/wood_floor_nor_gl_2k.jpg', gloss: 'assets/floor/wood_floor_rough_2k.jpg',
});
export const ASSETS = Object.freeze(['assets/players.glb', 'assets/motion.glb', 'assets/motion.json', ...Object.values(FLOOR_FILES)]);

// Served from a folder, a file is fetched by its own path. In the single-file build the loader has already
// turned each packed file into a blob: URL and listed it in TT_ASSETS, so nothing is asked of the network.
export const assetUrl = path => globalThis.TT_ASSETS?.[path] ?? path;
