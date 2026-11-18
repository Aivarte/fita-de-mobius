// Palco: renderizador, câmera, pós-processamento e níveis de qualidade.
//
// A cadeia de pós-processamento é própria e curta:
//   1. a cena vai para um alvo de ponto flutuante (HDR);
//   2. o bloom extrai e desfoca as altas luzes em resolução reduzida;
//   3. o passe final soma o bloom, aplica vinheta, tone mapping e espaço de cor;
//   4. nos níveis sem MSAA, um passe de FXAA alisa as bordas.
// O grão de filme entra no último passe, seja ele qual for.

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

/**
 * Do mais caro ao mais barato.
 *   pixelRatio  teto para a densidade de pixels do aparelho
 *   scale       fração da resolução em que o 3D é renderizado (o texto é HTML e não perde nitidez)
 *   samples     amostras de MSAA. Em GPUs integradas o MSAA em ponto flutuante é caro
 *               demais, então os níveis de baixo usam FXAA.
 *   bloomScale  resolução do bloom em relação à imagem
 */
export const QUALITY_LEVELS = [
  { name: 'alta', pixelRatio: 2, scale: 1, samples: 4, fxaa: false, bloom: true, bloomScale: 1 },
  { name: 'média', pixelRatio: 1.5, scale: 1, samples: 0, fxaa: true, bloom: true, bloomScale: 0.5 },
  { name: 'baixa', pixelRatio: 1, scale: 0.8, samples: 0, fxaa: true, bloom: true, bloomScale: 0.5 },
];

const BLOOM = { strength: 0.32, radius: 0.7, threshold: 0.9 };
const GRAIN = 0.028;
/** Ruído mínimo antes de gravar em 8 bits, só para os degradês escuros não formarem faixas. */
const DITHER = 0.004;

const HASH = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  // Ruído com distribuição triangular em [-1, 1], que varia a cada quadro.
  float filmGrain(vec2 fragCoord, float time) {
    vec2 seed = fragCoord + fract(time * 0.37) * vec2(311.7, 173.3);
    return hash12(seed) + hash12(seed * 1.37 + 17.0) - 1.0;
  }
`;

const QUAD_VERTEX = /* glsl */ `
  precision highp float;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FINISH_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform sampler2D tBloom;
  uniform float uBloom;
  uniform float uTime;
  uniform float uGrain;
  uniform float uVignette;

  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>

  varying vec2 vUv;
  ${HASH}

  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;

    // Vinheta em luz linear: escurece as bordas sem acinzentar.
    float r = length((vUv - 0.5) * 2.0);
    color *= 1.0 - uVignette * smoothstep(0.5, 1.5, r);

    color = ACESFilmicToneMapping(color);
    color = sRGBTransferOETF(vec4(color, 1.0)).rgb;
    color += filmGrain(gl_FragCoord.xy, uTime) * uGrain;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Bloom do Three.js sem a etapa final de mistura: quem soma o resultado é o passe final. */
class BloomChain extends UnrealBloomPass {
  get texture() {
    return this.renderTargetsHorizontal[0].texture;
  }

  render(renderer, writeBuffer, readBuffer) {
    renderer.getClearColor(this._oldClearColor);
    this.oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(this.clearColor, 0);

    // 1. Extrai as áreas claras.
    this.highPassUniforms.tDiffuse.value = readBuffer.texture;
    this.highPassUniforms.luminosityThreshold.value = this.threshold;
    this.fsQuad.material = this.materialHighPassFilter;
    renderer.setRenderTarget(this.renderTargetBright);
    renderer.clear();
    this.fsQuad.render(renderer);

    // 2. Desfoca em cascata, cada nível com metade da resolução do anterior.
    let input = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const blur = this.separableBlurMaterials[i];
      this.fsQuad.material = blur;

      blur.uniforms.colorTexture.value = input.texture;
      blur.uniforms.direction.value = UnrealBloomPass.BlurDirectionX;
      renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
      renderer.clear();
      this.fsQuad.render(renderer);

      blur.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
      blur.uniforms.direction.value = UnrealBloomPass.BlurDirectionY;
      renderer.setRenderTarget(this.renderTargetsVertical[i]);
      renderer.clear();
      this.fsQuad.render(renderer);

      input = this.renderTargetsVertical[i];
    }

    // 3. Junta os níveis numa textura só.
    this.fsQuad.material = this.compositeMaterial;
    this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
    this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
    this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
    renderer.clear();
    this.fsQuad.render(renderer);

    renderer.setClearColor(this._oldClearColor, this.oldClearAlpha);
    renderer.autoClear = oldAutoClear;
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
  renderer.toneMappingExposure = 1.18;

  // A cena é renderizada em ponto flutuante. Sem esse suporte a imagem sairia preta,
  // então é melhor falhar aqui e deixar a página usar a versão estática.
  const floatTargets =
    renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  if (!floatTargets) {
    renderer.dispose();
    throw new Error('Esta GPU não renderiza em ponto flutuante.');
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);

  const finishMaterial = new THREE.RawShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      tBloom: { value: null },
      uBloom: { value: 0 },
      uTime: { value: 0 },
      uGrain: { value: GRAIN },
      uVignette: { value: 0.62 },
      toneMappingExposure: { value: 1 },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: FINISH_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const finishQuad = new FullScreenQuad(finishMaterial);

  // FXAA do Three.js, com o grão de filme somado depois de alisar as bordas.
  const fxaaMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      resolution: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uGrain: { value: GRAIN },
    },
    vertexShader: FXAAShader.vertexShader,
    fragmentShader: FXAAShader.fragmentShader
      .replace('varying vec2 vUv;', `varying vec2 vUv;\nuniform float uTime;\nuniform float uGrain;\n${HASH}`)
      .replace(
        'gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );',
        `gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );
         gl_FragColor.rgb += filmGrain(gl_FragCoord.xy, uTime) * uGrain;
         gl_FragColor.a = 1.0;`,
      ),
    depthTest: false,
    depthWrite: false,
  });
  const fxaaQuad = new FullScreenQuad(fxaaMaterial);

  const size = { width: 1, height: 1 };
  const buffer = new THREE.Vector2();
  let level = 0;
  let sceneTarget = null;
  let ldrTarget = null;
  let bloom = null;

  /** Ajusta o tamanho de tudo ao tamanho da tela e ao nível de qualidade atuais. */
  const applySize = () => {
    const quality = QUALITY_LEVELS[level];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio) * quality.scale);
    renderer.setSize(size.width, size.height, false);
    renderer.getDrawingBufferSize(buffer);
    sceneTarget.setSize(buffer.x, buffer.y);
    ldrTarget?.setSize(buffer.x, buffer.y);
    bloom?.setSize(buffer.x * quality.bloomScale, buffer.y * quality.bloomScale);
    fxaaMaterial.uniforms.resolution.value.set(1 / buffer.x, 1 / buffer.y);
  };

  /** Recria os alvos de renderização. Só é preciso quando o nível de qualidade muda. */
  const rebuild = () => {
    const quality = QUALITY_LEVELS[level];
    sceneTarget?.dispose();
    ldrTarget?.dispose();
    bloom?.dispose();

    sceneTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality.samples });
    ldrTarget = quality.fxaa ? new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }) : null;
    bloom = quality.bloom
      ? new BloomChain(new THREE.Vector2(2, 2), BLOOM.strength, BLOOM.radius, BLOOM.threshold)
      : null;
    applySize();
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
    /** Há MSAA no alvo da cena? Sem ele, os recortes da fita usam limiar seco. */
    get multisampled() {
      return QUALITY_LEVELS[level].samples > 0;
    },
    /** Altura da imagem renderizada, em pixels reais. */
    get bufferHeight() {
      return buffer.y;
    },

    setQuality(index) {
      const next = Math.min(QUALITY_LEVELS.length - 1, Math.max(0, index));
      if (next === level && sceneTarget) return;
      level = next;
      rebuild();
    },

    resize(width, height) {
      size.width = Math.max(1, Math.round(width));
      size.height = Math.max(1, Math.round(height));
      camera.aspect = size.width / size.height;
      if (sceneTarget) applySize();
      else rebuild();
    },

    /**
     * Compila os shaders de tudo o que estiver visível na cena, já no formato do alvo
     * em que a cena é renderizada. Chamado uma vez na partida.
     */
    compile() {
      renderer.setRenderTarget(sceneTarget);
      renderer.compile(scene, camera);
      renderer.setRenderTarget(null);
    },

    render(time, animateGrain = true) {
      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);

      if (bloom) bloom.render(renderer, null, sceneTarget);

      const finish = finishMaterial.uniforms;
      finish.tDiffuse.value = sceneTarget.texture;
      finish.tBloom.value = bloom ? bloom.texture : sceneTarget.texture;
      finish.uBloom.value = bloom ? 1 : 0;
      finish.toneMappingExposure.value = renderer.toneMappingExposure;
      if (animateGrain) finish.uTime.value = fxaaMaterial.uniforms.uTime.value = time;

      if (ldrTarget) {
        finish.uGrain.value = DITHER;
        renderer.setRenderTarget(ldrTarget);
        finishQuad.render(renderer);
        fxaaMaterial.uniforms.tDiffuse.value = ldrTarget.texture;
        renderer.setRenderTarget(null);
        fxaaQuad.render(renderer);
      } else {
        finish.uGrain.value = GRAIN;
        renderer.setRenderTarget(null);
        finishQuad.render(renderer);
      }
    },
  };
}
