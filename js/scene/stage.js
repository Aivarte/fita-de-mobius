// Palco: renderizador, câmera, pós-processamento e níveis de qualidade.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Do mais caro ao mais barato. `samples` é o antisserrilhamento (MSAA). */
export const QUALITY_LEVELS = [
  { name: 'alta', pixelRatio: 2, samples: 4, bloom: true },
  { name: 'média', pixelRatio: 1.5, samples: 2, bloom: true },
  { name: 'baixa', pixelRatio: 1, samples: 0, bloom: false },
];

const FINISH_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uGrain;
  uniform float uVignette;

  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>

  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb;

    // Vinheta em luz linear: escurece as bordas sem acinzentar.
    float r = length((vUv - 0.5) * 2.0);
    color *= 1.0 - uVignette * smoothstep(0.5, 1.5, r);

    #if defined( ACES_FILMIC_TONE_MAPPING )
      color = ACESFilmicToneMapping(color);
    #elif defined( AGX_TONE_MAPPING )
      color = AgXToneMapping(color);
    #elif defined( NEUTRAL_TONE_MAPPING )
      color = NeutralToneMapping(color);
    #elif defined( REINHARD_TONE_MAPPING )
      color = ReinhardToneMapping(color);
    #elif defined( CINEON_TONE_MAPPING )
      color = CineonToneMapping(color);
    #elif defined( LINEAR_TONE_MAPPING )
      color = LinearToneMapping(color);
    #endif

    #ifdef SRGB_TRANSFER
      color = sRGBTransferOETF(vec4(color, 1.0)).rgb;
    #endif

    // Grão de filme com distribuição triangular. Além da textura, ele quebra as
    // faixas que degradês muito escuros formam em 8 bits.
    vec2 seed = gl_FragCoord.xy + fract(uTime * 0.37) * vec2(311.7, 173.3);
    float grain = hash12(seed) + hash12(seed * 1.37 + 17.0) - 1.0;
    color += grain * uGrain;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Passe final: tone mapping, espaço de cor, vinheta e grão. */
class FinishPass extends OutputPass {
  constructor() {
    super();
    this.uniforms.uTime = { value: 0 };
    this.uniforms.uGrain = { value: 0.028 };
    this.uniforms.uVignette = { value: 0.62 };
    this.material.fragmentShader = FINISH_FRAGMENT;
  }
}

export function createStage(canvas) {
  // Lança erro se o navegador não tiver WebGL2; quem chama cuida do plano B.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);

  const size = { width: 1, height: 1 };
  let level = 0;
  let composer = null;
  let bloom = null;
  let finish = null;

  const rebuild = () => {
    const quality = QUALITY_LEVELS[level];
    const pixelRatio = Math.min(window.devicePixelRatio || 1, quality.pixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(size.width, size.height, false);

    if (composer) {
      composer.passes.forEach((pass) => pass.dispose?.());
      composer.renderTarget1.dispose();
      composer.renderTarget2.dispose();
    }

    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(buffer.x, buffer.y, {
      type: THREE.HalfFloatType,
      samples: quality.samples,
    });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(size.width, size.height);
    composer.addPass(new RenderPass(scene, camera));

    bloom = null;
    if (quality.bloom) {
      bloom = new UnrealBloomPass(new THREE.Vector2(buffer.x, buffer.y), 0.32, 0.7, 0.9);
      composer.addPass(bloom);
    }
    const previous = finish;
    finish = new FinishPass();
    if (previous) {
      finish.uniforms.uGrain.value = previous.uniforms.uGrain.value;
      finish.uniforms.uVignette.value = previous.uniforms.uVignette.value;
    }
    composer.addPass(finish);
  };

  return {
    renderer,
    scene,
    camera,
    size,

    get quality() {
      return QUALITY_LEVELS[level];
    },
    get qualityIndex() {
      return level;
    },
    /** Há MSAA no alvo de renderização? Sem ele, os recortes usam limiar seco. */
    get multisampled() {
      return QUALITY_LEVELS[level].samples > 0;
    },

    setQuality(index) {
      const next = Math.min(QUALITY_LEVELS.length - 1, Math.max(0, index));
      if (next === level && composer) return;
      level = next;
      rebuild();
    },

    resize(width, height) {
      size.width = Math.max(1, Math.round(width));
      size.height = Math.max(1, Math.round(height));
      camera.aspect = size.width / size.height;
      if (!composer) {
        rebuild();
      } else {
        renderer.setSize(size.width, size.height, false);
        composer.setSize(size.width, size.height);
      }
    },

    render(time, animateGrain = true) {
      if (animateGrain) finish.uniforms.uTime.value = time;
      composer.render();
    },
  };
}
