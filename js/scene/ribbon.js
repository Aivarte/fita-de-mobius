// A fita: geometria do sólido e material iridescente com os efeitos de cada parada.
//
// O material é o MeshPhysicalMaterial do Three.js (metal com película fina) com
// trechos de shader injetados. Todos os efeitos são funções das coordenadas da carta
// (U, V) que a malha carrega em cada vértice. Ver js/math/mobius.js.

import * as THREE from 'three';
import { buildRibbon, DIMS } from '../math/mobius.js';

/** Meia largura da fita no alvo de morph da última parada. */
export const WIDE_HALF_WIDTH = 0.74;

export function createRibbonGeometry({ segmentsU = 512, segmentsV = 12, segmentsRim = 8 } = {}) {
  const base = buildRibbon({ segmentsU, segmentsV, segmentsRim });
  const wide = buildRibbon({
    dims: { ...DIMS, halfWidth: WIDE_HALF_WIDTH },
    segmentsU,
    segmentsV,
    segmentsRim,
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(base.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(base.normals, 3));
  geometry.setAttribute('chart', new THREE.BufferAttribute(base.chart, 3));
  geometry.setIndex(new THREE.BufferAttribute(base.indices, 1));

  // Alvo de morph absoluto: a mesma malha, com a fita mais larga.
  geometry.morphAttributes.position = [new THREE.BufferAttribute(wide.positions, 3)];
  geometry.morphAttributes.normal = [new THREE.BufferAttribute(wide.normals, 3)];
  geometry.morphTargetsRelative = false;

  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), DIMS.radius + WIDE_HALF_WIDTH + 0.1);
  return geometry;
}

const FRAGMENT_PARS = /* glsl */ `
  varying vec3 vChart;

  uniform float uTime;
  uniform vec3 uAccent;
  uniform vec2 uFilm;
  uniform float uHardCut;

  uniform float uPaint;
  uniform float uPaintHead;
  uniform float uEdge;
  uniform float uEdgeHead;
  uniform float uCut;
  uniform float uGlyph;
  uniform float uGlyphPos;
  uniform sampler2D uGlyphMap;
  uniform float uMosaic;
  uniform float uBelt;
  uniform float uLattice;

  #define MOB_LAP 6.283185307179586
  #define MOB_CHART 12.566370614359172
  // Converte um avanço em U (radianos sobre a linha central) em unidades de V.
  #define MOB_ARC ${(DIMS.radius / (DIMS.halfWidth - DIMS.halfThickness)).toFixed(6)}

  float mobHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Menor diferença entre dois pontos da carta, em [-2π, 2π).
  float mobWrap(float x) {
    return mod(x + MOB_LAP, MOB_CHART) - MOB_LAP;
  }

  // Cobertura suavizada de uma distância com sinal (positiva = dentro).
  float mobCover(float d) {
    return clamp(d / max(fwidth(d), 1e-6) + 0.5, 0.0, 1.0);
  }

  // Desenho da seta circular em coordenadas locais (x ao longo da fita, y na largura).
  float mobGlyph(vec2 q) {
    vec2 uv = q * 0.62 + 0.5;
    vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
    return texture2D(uGlyphMap, clamp(uv, 0.0, 1.0)).r * inside.x * inside.y;
  }
`;

const FRAGMENT_SURFACE = /* glsl */ `
  float mobU = vChart.x;
  float mobV = vChart.y;
  float mobRim = vChart.z;
  // Coordenada ao longo da borda única (e da meia-faixa, quando a fita é cortada).
  float mobE = mod(mobU + (mobV < 0.0 ? MOB_LAP : 0.0), MOB_CHART);
  float mobIrid = 1.0;
  float mobCoverage = 1.0;

  // A espessura da película varia devagar pela fita: é o que cria as faixas de cor.
  float mobFlow = 0.5 + 0.5 * sin(mobU + mobV * 1.4 + uTime * 0.06);
  mobFlow = mix(mobFlow, 0.5 + 0.5 * sin(mobU * 2.5 - mobV * 2.2 - uTime * 0.045), 0.35);
  float mobThickness = mix(uFilm.x, uFilm.y, mobFlow);

  // 1. Um lado só. A tinta avança pela carta e cobre as duas "faces" do papel
  //    sem nunca cruzar a beirada.
  if (uPaint > 0.001) {
    float settle = smoothstep(0.0, 0.5, uPaintHead) * (1.0 - smoothstep(MOB_CHART - 0.5, MOB_CHART, uPaintHead));
    // A pincelada começa numa linha irregular, e é nela que a tinta fecha no fim.
    float along = mod(mobU - 0.06 - 0.05 * sin(mobV * 5.0 + 1.0), MOB_CHART);
    float wobble = settle * (0.055 * sin(mobV * 4.0 + mobU * 2.0) + 0.02 * sin(mobV * 11.0 - uTime * 0.6));
    float d = uPaintHead - along + wobble;
    float painted = smoothstep(0.0, 0.02, d) * uPaint;
    float front = exp(-max(d, 0.0) * 5.0) * step(0.0, d) * settle * uPaint;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.43, 0.17), painted);
    roughnessFactor = mix(roughnessFactor, 0.42, painted);
    mobIrid *= 1.0 - 0.94 * painted;
    totalEmissiveRadiance += uAccent * front * 0.6;
  }

  // 2. Uma borda só. A luz percorre a beirada inteira num traço único.
  if (uEdge > 0.001) {
    float nearRim = max(mobRim, smoothstep(0.955, 1.0, abs(mobV)));
    float behind = uEdgeHead - mobE;
    float traced = smoothstep(0.0, 0.03, behind);
    float running = 1.0 - smoothstep(MOB_CHART - 0.4, MOB_CHART, uEdgeHead);
    float head = exp(-max(behind, 0.0) * 2.2) * step(0.0, behind) * running;
    vec3 hot = mix(vec3(1.0, 0.93, 0.82), uAccent, 0.4);
    totalEmissiveRadiance += hot * nearRim * uEdge * (0.42 * traced + 2.6 * head);
    diffuseColor.rgb *= 1.0 - 0.35 * uEdge * (1.0 - nearRim);
  }

  // 3. Corte ao meio. A fita se abre pelo centro; um pulso de luz percorre a
  //    meia-faixa e mostra que continua sendo uma peça só.
  if (uCut > 0.001) {
    float d = abs(mobV) - uCut * 0.09;
    mobCoverage *= mobCover(d);
    totalEmissiveRadiance += uAccent * exp(-max(d, 0.0) * 30.0) * 0.5 * uCut;
    float s = fract((mobE - uTime * 0.85) / MOB_CHART);
    float pulse = smoothstep(0.88, 0.995, s) * (1.0 - smoothstep(0.995, 1.0, s));
    totalEmissiveRadiance += vec3(1.0, 0.9, 0.76) * pulse * 0.55 * uCut;
  }

  // 4. Sem horário nem anti-horário. A seta vive NA superfície, como tinta que
  //    atravessa o papel: aparece nas duas faces. Depois de uma volta ela chega
  //    ao ponto de partida pelo verso, e o que se vê é a sua imagem espelhada.
  if (uGlyph > 0.001) {
    float ink = max(
      mobGlyph(vec2(mobWrap(mobU - uGlyphPos) * MOB_ARC, mobV)),
      mobGlyph(vec2(mobWrap(mobU + MOB_LAP - uGlyphPos) * MOB_ARC, -mobV))
    );
    float ghost = max(
      mobGlyph(vec2(mobWrap(mobU) * MOB_ARC, mobV)),
      mobGlyph(vec2(mobWrap(mobU + MOB_LAP) * MOB_ARC, -mobV))
    );
    diffuseColor.rgb *= 1.0 - uGlyph * max(0.6 * ink, 0.35 * ghost);
    totalEmissiveRadiance += uGlyph * (uAccent * ink * 2.0 + vec3(0.85, 0.9, 1.0) * ghost * (1.0 - ink) * 0.16);
  }

  // 5. 1858, duas vezes. A superfície vira um mosaico de tesselas.
  if (uMosaic > 0.001) {
    vec2 g = vec2(mobU / MOB_LAP * 46.0, (mobV * 0.5 + 0.5) * 7.0);
    float row = min(floor(g.y), 6.0);
    g.x += 0.5 * mod(row, 2.0);
    vec2 id = vec2(floor(g.x), row);
    vec2 f = abs(fract(g) - 0.5);
    float h1 = mobHash(id);
    float h2 = mobHash(id + 31.7);
    float body = (1.0 - smoothstep(0.4, 0.47, max(f.x, f.y) + 0.05 * (h2 - 0.5))) * (1.0 - step(0.001, mobRim));
    vec3 stone = mix(vec3(0.74, 0.68, 0.56), vec3(0.5, 0.32, 0.13), smoothstep(0.3, 0.34, h1));
    stone = mix(stone, vec3(0.34, 0.11, 0.07), smoothstep(0.56, 0.6, h1));
    stone = mix(stone, vec3(0.045, 0.12, 0.15), smoothstep(0.76, 0.8, h1));
    stone = mix(stone, vec3(0.025, 0.025, 0.03), smoothstep(0.91, 0.94, h1));
    float border = step(row, 0.5) + step(5.5, row);
    stone = mix(stone, vec3(0.9, 0.64, 0.26), border);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.014), stone, body), uMosaic);
    metalnessFactor = mix(metalnessFactor, border * body, uMosaic);
    roughnessFactor = mix(roughnessFactor, mix(0.95, mix(0.26, 0.6, h2), body), uMosaic);
    mobIrid *= 1.0 - uMosaic;
    // Cada tessela assenta com uma inclinação mínima, e por isso brilha na sua vez.
    normal = normalize(normal + uMosaic * body * 0.11 * vec3(h1 - 0.5, h2 - 0.5, 0.0));
  }

  // 6. Do papel à fábrica. Borracha fosca com três setas iridescentes correndo.
  if (uBelt > 0.001) {
    float c = fract(mobU / MOB_LAP * 3.0 - uTime * 0.1 + 0.17 * abs(mobV));
    float arrow = smoothstep(0.0, 0.015, c) * (1.0 - smoothstep(0.4, 0.415, c));
    arrow *= 1.0 - smoothstep(0.76, 0.8, abs(mobV));
    float matte = uBelt * (1.0 - arrow);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.042, 0.048), matte);
    metalnessFactor = mix(metalnessFactor, 0.0, matte);
    roughnessFactor = mix(roughnessFactor, 0.52, matte);
    mobIrid *= 1.0 - matte;
  }

  // 7. Na arte. A fita vira a treliça da gravura de Escher.
  if (uLattice > 0.001) {
    vec2 g = vec2(mobU / MOB_LAP * 36.0, (mobV * 0.5 + 0.5) * 5.0);
    vec2 f = abs(fract(g) - 0.5);
    float corner = 0.07;
    vec2 q = f - vec2(uLattice * 0.37 - corner);
    float hole = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
    mobCoverage *= mobCover(hole);
  }

  diffuseColor.a *= mobCoverage;
  if (mobCoverage < mix(0.004, 0.5, uHardCut)) discard;
`;

const FRAGMENT_FILM = /* glsl */ `
  #ifdef USE_IRIDESCENCE
    material.iridescence *= mobIrid;
    material.iridescenceThickness = mobThickness;
  #endif
`;

export function createRibbonMaterial(glyphMap) {
  const uniforms = {
    uTime: { value: 0 },
    uAccent: { value: new THREE.Color(1.0, 0.6, 0.22) },
    // Espessura da película em nanômetros. Nesta faixa a interferência fica na
    // primeira ordem: dourado, magenta e azul, como titânio anodizado.
    uFilm: { value: new THREE.Vector2(168, 258) },
    uHardCut: { value: 0 },
    uPaint: { value: 0 },
    uPaintHead: { value: 0 },
    uEdge: { value: 0 },
    uEdgeHead: { value: 0 },
    uCut: { value: 0 },
    uGlyph: { value: 0 },
    uGlyphPos: { value: 0 },
    uGlyphMap: { value: glyphMap },
    uMosaic: { value: 0 },
    uBelt: { value: 0 },
    uLattice: { value: 0 },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xc4bdb5,
    metalness: 1,
    roughness: 0.18,
    iridescence: 1,
    iridescenceIOR: 1.85,
    iridescenceThicknessRange: [168, 258],
  });
  // Os recortes (corte e treliça) usam a cobertura do MSAA para ficarem lisos.
  material.alphaToCoverage = true;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 chart;\nvarying vec3 vChart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvChart = chart;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAGMENT_SURFACE}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${FRAGMENT_FILM}`);
  };
  material.customProgramCacheKey = () => 'fita-de-mobius';

  return { material, uniforms };
}
