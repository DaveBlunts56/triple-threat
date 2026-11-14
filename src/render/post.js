import * as THREE from 'three';
import { pass, mrt, output, normalView, screenUV, renderOutput, smoothstep, float } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { QUALITY } from './quality.js';

// aoSize: the ambient occlusion is worked out at this share of the picture's size. bloom: how strong the glow is, how
// far it spreads, and how bright a pixel must be before it glows at all (1 is white, so only lights, lit boards and
// the hottest highlights do). vignette: the picture darkens toward its corners, from `from` to `to` of the way out
// from the middle, by `dark` at most.
const POST = Object.freeze({
  aoSize: 0.5,
  bloom: Object.freeze({ strength: 0.3, radius: 0.5, threshold: 1 }),
  vignette: Object.freeze({ from: 0.45, to: 0.95, dark: 0.28 }),
});

// What is done to the picture after the scene is drawn, by quality level. Returns { render(), setQuality(level),
// missing }: `missing` lists, in words, the effects of the current level that this browser could not run.
export function createPost(renderer, scene, camera) {
  const missing = [];
  let pipeline = null;   // null: the scene is drawn straight to the screen
  let parts = [];        // the passes and effects of the current chain, each holding pictures on the graphics card

  // The chain for a level, or null if the level asks for nothing. An effect that cannot be built is left out.
  function chain(level) {
    const q = QUALITY[level];
    if (q.aa === 'none' && !q.ao && !q.bloom) return null;
    const made = new THREE.RenderPipeline(renderer);
    const scenePass = pass(scene, camera);
    parts.push(scenePass);
    const attempt = (words, add) => { try { add(); } catch (error) { console.warn(`No ${words} here.`, error); missing.push(words); } };
    let picture = scenePass, lit = scenePass;   // the picture so far, and the scene as drawn, which is what glows
    if (q.ao) attempt('ambient occlusion', () => {
      // The scene's one pass also writes which way each surface faces. From that and its depth the occlusion is
      // worked out and darkens the picture: no second drawing of the scene is needed.
      scenePass.setMRT(mrt({ output, normal: normalView }));
      const occlusion = ao(scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'), camera);
      occlusion.resolutionScale = POST.aoSize;
      parts.push(occlusion);
      lit = scenePass.getTextureNode('output');
      picture = lit.mul(occlusion.getTextureNode().r);
    });
    if (q.bloom) attempt('bloom', () => {
      const glow = bloom(lit, POST.bloom.strength, POST.bloom.radius, POST.bloom.threshold);
      parts.push(glow);
      const edge = smoothstep(POST.vignette.from, POST.vignette.to, screenUV.sub(0.5).length().mul(1.4));
      picture = picture.add(glow).mul(float(1).sub(edge.mul(POST.vignette.dark)));
    });
    // Edges are smoothed last, on the picture as the screen will show it: tone-mapped and in the screen's colours.
    made.outputColorTransform = false;
    const shown = renderOutput(picture);
    made.outputNode = shown;
    if (q.aa !== 'none') attempt('anti-aliasing', () => { made.outputNode = q.aa === 'smaa' ? smaa(shown) : fxaa(shown); parts.push(made.outputNode); });
    return made;
  }

  // Lets go of the current chain and of every picture its passes and effects hold: the pipeline's own dispose frees
  // only its last step.
  function drop() {
    for (const part of parts) part.dispose?.();
    parts = [];
    pipeline?.dispose();
    pipeline = null;
  }

  return {
    missing,
    setQuality(level) {
      drop();
      missing.length = 0;
      pipeline = chain(level);
    },
    // Draws one frame. If the chain fails as it is first used, the game goes on drawing straight to the screen.
    render() {
      if (!pipeline) return renderer.render(scene, camera);
      try { pipeline.render(); } catch (error) {
        console.warn('Post-processing failed; drawing without it.', error);
        missing.push('post-processing');
        drop();
        renderer.render(scene, camera);
      }
    },
  };
}
