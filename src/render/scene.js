import * as THREE from 'three';
import { pixelRatioFor, prefersWebGL } from './quality.js';
import { createLight } from './light.js';
import { createFloor } from './floor.js';
import { arenaOf, loadLogos } from './arenas.js';
import { createArena } from './arena.js';
import { createSideline } from './sideline.js';
import { createRefs } from './refs.js';
import { createPost } from './post.js';
import { BROADCAST, createFollow, poseOf, stepFollow } from './framing.js';
import { NET, stepNet } from './net.js';
import { createHoop, drape } from './hoop.js';

const MESH = 64;                           // texture pixels on a side of one cell of the net's picture
// The replay's camera: metres from the centre line toward the hoop, up, and out from the middle of the court; and the
// lowest height it looks at.
const REPLAY_CAMERA = { x: 13.3, height: 2.6, z: 6.8, lookUp: 1.2 };   // in the corner, above the players' heads, so nobody near it fills the picture

// The net's picture: a faint white wash, and in each of its NET.strings by NET.knots cells both diagonals, so the
// cells read as a net's diamonds. The diagonals of the cells either side of it are drawn too and cut off at the edge,
// so where the picture runs round and meets itself the lines go on unbroken.
function paintNet() {
  const c = document.createElement('canvas');
  c.width = NET.strings * MESH; c.height = NET.knots * MESH;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255, 255, 255, 0.15)'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#ffffff'; g.lineWidth = 0.1 * MESH;
  g.beginPath();
  for (let col = -1; col <= NET.strings; col++) for (let row = 0; row < NET.knots; row++) {
    const x = col * MESH, y = row * MESH;
    g.moveTo(x, y); g.lineTo(x + MESH, y + MESH);
    g.moveTo(x + MESH, y); g.lineTo(x, y + MESH);
  }
  g.stroke();
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

// Builds the renderer, court, hoops, lights and camera, for teams `ids` (the match's, by id) with side `home` (0 or 1)
// at home, drawing with the renderer the player chose (`drawWith`, one of RENDERERS in quality.js). Resolves to null
// (after telling the player) if nothing can draw.
export async function createScene(canvas, ids = [0, 1], home = 0, drawWith = 'auto') {
  // WebGL 2 where the player or the game prefers it (see prefersWebGL) or the browser has nothing else; WebGPU otherwise.
  const chosen = prefersWebGL(window.navigator.userAgent, window.location.hash, drawWith);
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: chosen });
  try {
    await renderer.init();   // falls back to WebGL 2 by itself when WebGPU is missing
  } catch {
    document.body.textContent = 'This browser supports neither WebGPU nor WebGL 2, so the game cannot run.';
    return null;
  }
  const backend = renderer.backend.isWebGPUBackend ? 'webgpu' : chosen ? 'webgl2chosen' : 'webgl2';
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);

  await loadLogos();   // the league's marks are pictures, painted into the court, the boards and the scorebug
  const floor = await createFloor(scene, arenaOf(ids[home]));
  let arena = createArena(scene, arenaOf(ids[home]), ids[1 - home], ids), builtFor = `${ids[0]}-${ids[1]}-${home}`;
  const sideline = createSideline(scene, ids), refs = createRefs(scene);
  // The nets' picture as its colour and its see-through, unlit, both sides drawn, and not written to the depth buffer.
  const netLook = new THREE.MeshBasicMaterial({ map: paintNet(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const hoops = [createHoop(1, netLook), createHoop(-1, netLook)];
  scene.add(...hoops.map(h => h.hoop));
  let ball = null;   // the ball as it was on the last call of swayNets: x, y, z, vx, vy, vz

  const light = createLight(renderer, scene);

  // The render resolution and the shadow map of a quality level (one of QUALITY.order). Nothing else is needed: the
  // renderer resizes its drawing buffer when the pixel ratio changes, and resizes the shadow map to mapSize, throwing
  // the old one away, before it next draws the shadow.
  let drawnAt = 'high';   // the level being drawn
  const setQuality = level => {
    drawnAt = level;
    renderer.setPixelRatio(pixelRatioFor(level, window.innerWidth, window.innerHeight, window.devicePixelRatio));
    light.setQuality(level);
    arena.setQuality(level);
    post.setQuality(level);
    const failed = floor.setQuality(level);
    if (failed) post.missing.push(failed);
  };

  const camera = new THREE.PerspectiveCamera(BROADCAST.fov, 1, 0.1, 100);
  const post = createPost(renderer, scene, camera);
  setQuality('high');
  // mode: 'broadcast', the sideline view, or '2k', from behind the team with the ball. follow: what the camera follows
  // and how it frames it (see framing.js). size: the match's, three or five a side.
  let mode = '2k', shake = 0, clock = 0, size = 3;
  const follow = createFollow();
  // The game's camera; with a close-up (see broadcast/cinema.js), that far of the way from it to the close-up's.
  const aim = (close = null) => {
    const pose = poseOf(follow, mode, camera.aspect, size), k = close?.blend ?? 0;
    const mix = (a, b) => a.map((v, i) => v + (b[i] - v) * k);
    camera.position.set(...(k ? mix(pose.at, close.at) : pose.at));
    camera.lookAt(...(k ? mix(pose.look, close.look) : pose.look));
    const fov = pose.fov + ((close?.fov ?? pose.fov) - pose.fov) * k;
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
  };
  // The picture shakes while the crowd puts off a free-throw shooter.
  const jolt = () => { if (shake) { camera.position.x += shake * Math.sin(clock * 47); camera.position.y += shake * Math.sin(clock * 61 + 1); } };
  const resize = () => {
    renderer.setPixelRatio(pixelRatioFor(drawnAt, window.innerWidth, window.innerHeight, window.devicePixelRatio));   // a bigger window draws coarser
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();   // the view's width follows the window (see framing.js poseOf)
  };
  window.addEventListener('resize', resize);
  resize(); aim();
  const point = new THREE.Vector3();

  return {
    scene, camera, backend, renderer, setQuality,
    // A match's teams, `ids`, with side `home` at home: the home team's arena, built afresh in place of the one there
    // when the home team or its visitor is another (its crowd wears both teams' colours), and the benches dressed.
    setTeams(ids, home) {
      sideline.setTeams(ids);
      const want = `${ids[0]}-${ids[1]}-${home}`;   // the benches sit in the teams' order
      if (want === builtFor) return;
      builtFor = want;
      arena.dispose();
      arena = createArena(scene, arenaOf(ids[home]), ids[1 - home], ids);
      arena.setQuality(drawnAt);
      floor.dress(arenaOf(ids[home]));
    },
    // The match, for the arena's scoreboard and the hoops' clocks, lights and rims.
    watch(state) { arena.show(state); for (const h of hoops) h.show(state); },
    // The people round the court, moved on by `real` seconds: the referees, the crowd, the boards, the cameras and
    // the flashes, as the crowd's mood (`life`, see life.js) has them. Nothing moves while the game is paused.
    live(state, life, real) {
      clock += real; shake = life.shake;
      refs.live(state, real);   // by real time, so that they move as smoothly as the picture is drawn
      arena.live(life, clock, state.home ?? 0);
      sideline.live(state.ball, life, clock);
    },
    // Draws the frame. Nothing moves while it is drawn, so the scene's matrices are worked out once here, not again by
    // each pass that draws the scene (the floor's mirror is one), and the shadow is drawn once (see light.js).
    render() {
      light.fresh();
      scene.updateMatrixWorld();
      scene.matrixWorldAutoUpdate = false;
      try { post.render(); } finally { scene.matrixWorldAutoUpdate = true; }
      arena.feed(renderer, camera, post.picture());   // the frame just drawn, onto the video board (High and Ultra)
    },
    missing: post.missing,   // the effects of the current level that this browser could not run, in words
    // Eases the camera toward the play round the ball: along the sideline, or behind the team that has the ball, looking
    // at the hoop it attacks (`sign`: +1 for the hoop at +x) and swinging round when the ball changes teams; framing
    // the players who matter in `state`, the match (see framing.js). `close`: a close-up the camera is easing to or
    // from (see broadcast/cinema.js), or null; the game's camera goes on following underneath it.
    follow(ball, sign, state, close = null) {
      size = state.size;
      stepFollow(follow, mode, state, ball, sign);
      aim(close); jolt();
    },
    // Changes the camera: 'broadcast' or '2k'.
    setCamera(to) { mode = to; follow.z = 0; resize(); aim(); },
    // The replay's camera: low, just inside the baseline of the hoop at `sign`, on the `side` of the court given
    // (+1 or -1 along z), looking at the ball.
    replay(ball, sign, side) {
      camera.position.set(sign * REPLAY_CAMERA.x, REPLAY_CAMERA.height, side * REPLAY_CAMERA.z);
      camera.lookAt(ball.x, Math.max(ball.y, REPLAY_CAMERA.lookUp), ball.z);
    },
    // The way the camera will look once it has settled, as a unit vector on the floor: what "up the screen" means.
    heading: () => (mode === 'broadcast' ? { x: 0, z: -1 } : { x: Math.cos(follow.turnTo), z: -Math.sin(follow.turnTo) }),
    // Moves both nets on by dt seconds while the ball went from where it was on the last call to where `now` is.
    swayNets(now, dt) {
      const to = { x: now.x, y: now.y, z: now.z, vx: now.vx, vy: now.vy, vz: now.vz };
      for (const { net, sleeve } of hoops) { stepNet(net, ball, to, dt); drape(sleeve, net); }
      ball = to;
    },
    // Where the point (x, y, z) of the court is on the page as last drawn, in CSS pixels from the top left.
    toScreen(x, y, z) {
      point.set(x, y, z).project(camera);
      return { x: (point.x + 1) / 2 * window.innerWidth, y: (1 - point.y) / 2 * window.innerHeight };
    },
  };
}
