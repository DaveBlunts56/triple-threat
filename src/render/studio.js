// Team Select's picture: each team's star, our own model of him in his kit, standing in the idle motion before his
// team's mark, lit as in a studio against the two teams' colours: the away team's on the left, the home team's on the
// right. Drawn in place of the court while Team Select is up; the page's words lie over it (index.html, hud.js).
import * as THREE from 'three';
import { TEAMS } from '../sim/teams.js';
import { overall } from '../sim/ratings.js';
import { drawLogo } from './arenas.js';

const f = Object.freeze;

// fov, eye, look: the camera. x: how far out from the middle each star stands, at most `wide` of the half-width the
// camera sees there. turn: how far each turns in toward the middle. mark: the team's mark behind him, `size` across,
// its middle `y` up and `z` behind, `out` further out than him, and how strongly it shows. light: the soft light from
// all round, the key from the front and above, and the rim light low behind each star (`rimAt`, mirrored on the left)
// in his team's colour, `rimWhite` of the way to white: it lights both stars, so it stays low and behind, and pale.
export const STUDIO = f({
  fov: 30, eye: f([0, 1.42, 4.9]), look: f([0, 1.2, 0]), x: 1.3, wide: 0.6, turn: 0.32,
  mark: f({ size: 3.4, y: 1.5, z: -1.8, out: 0.35, opacity: 0.3 }),
  light: f({ sky: 0.9, key: 2.4, rim: 2.2, rimAt: f([2.2, 1.1, -4.5]), rimWhite: 0.45, environment: 0.5 }),
});

// The number of team `id`'s star: its player with the highest overall, the first if two are level.
export const starNumber = id => TEAMS[id].players.reduce((best, p) => (overall(p) > overall(best) ? p : best)).number;

// A colour `by` of the way to black (`by` 0 leaves it as it is).
const darker = (hex, by) => `#${new THREE.Color(hex).multiplyScalar(1 - by).getHexString()}`;

// The studio, drawn by `renderer` with the game's `environment` light. `people`: the players (see people.js), or null
// when they could not be loaded: then only the marks show. Returns { scene, render(select, dt) }: its scene, and
// drawing it for Team Select's choice (`select`, { away, home }), its stars moved on by `dt` seconds.
export function createStudio(renderer, people, environment) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(STUDIO.fov, 1, 0.1, 60);
  scene.environment = environment;
  scene.environmentIntensity = STUDIO.light.environment;
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x1a1d24, STUDIO.light.sky));
  const key = new THREE.DirectionalLight(0xffffff, STUDIO.light.key);
  key.position.set(0.5, 4, 6);
  scene.add(key);
  // The backdrop: dark, each team's colour toward its own side.
  const back = document.createElement('canvas');
  back.width = 512; back.height = 8;
  const backdrop = new THREE.CanvasTexture(back);
  backdrop.colorSpace = THREE.SRGBColorSpace;
  scene.background = backdrop;
  // Each side: away (0, on the left) and home (1, on the right).
  const sides = [-1, 1].map(s => {
    const group = new THREE.Group(), rim = new THREE.DirectionalLight(0xffffff, STUDIO.light.rim);
    rim.position.set(s * STUDIO.light.rimAt[0], STUDIO.light.rimAt[1], STUDIO.light.rimAt[2]);
    rim.target = group;
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(STUDIO.mark.size, STUDIO.mark.size),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: STUDIO.mark.opacity, depthWrite: false }));
    scene.add(group, rim, mark);
    return { s, group, rim, mark, id: null, star: null };
  });
  // Puts team `id` on side `side`: its star, its mark, and its colour in the rim light.
  const dress = (side, id) => {
    const at = sides[side];
    if (at.star) {
      at.group.remove(at.star.model);
      at.star.model.traverse(part => part.skeleton?.dispose());
    }
    at.star = people ? people.portrait(id, starNumber(id)) : null;
    if (at.star) at.group.add(at.star.model);
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    drawLogo(c.getContext('2d'), id, 256, 256, 500);
    at.mark.material.map?.dispose();
    at.mark.material.map = new THREE.CanvasTexture(c);
    at.mark.material.map.colorSpace = THREE.SRGBColorSpace;
    at.mark.material.needsUpdate = true;
    at.rim.color.set(TEAMS[id].colour).lerp(new THREE.Color(0xffffff), STUDIO.light.rimWhite);
    at.id = id;
  };
  const paintBackdrop = () => {
    const g = back.getContext('2d'), fill = g.createLinearGradient(0, 0, back.width, 0);
    fill.addColorStop(0, darker(TEAMS[sides[0].id].colour, 0.55));
    fill.addColorStop(0.5, '#05070c');
    fill.addColorStop(1, darker(TEAMS[sides[1].id].colour, 0.55));
    g.fillStyle = fill; g.fillRect(0, 0, back.width, back.height);
    backdrop.needsUpdate = true;
  };

  return {
    scene,
    render(select, dt) {
      let changed = false;
      [select.away, select.home].forEach((id, side) => { if (sides[side].id !== id) { dress(side, id); changed = true; } });
      if (changed) paintBackdrop();
      // Framed for the window: the stars stand apart, but never further out than the camera sees.
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.position.set(...STUDIO.eye);
      camera.lookAt(...STUDIO.look);
      camera.updateProjectionMatrix();
      const half = (STUDIO.eye[2] * Math.tan(THREE.MathUtils.degToRad(STUDIO.fov / 2))) * camera.aspect;
      const x = Math.min(STUDIO.x, half * STUDIO.wide);
      for (const at of sides) {
        at.group.position.set(at.s * x, 0, 0);
        at.group.rotation.y = -at.s * STUDIO.turn;
        at.mark.position.set(at.s * (x + STUDIO.mark.out), STUDIO.mark.y, STUDIO.mark.z);
        at.star?.mixer.update(dt);
      }
      renderer.render(scene, camera);
    },
  };
}
