// Fita de Möbius: inicialização e laço de animação.
//
// A cada quadro: lê a posição do scroll (sem listener de scroll), converte em um tempo
// T da jornada, e desse tempo derivam a câmera, os efeitos da fita e o card ativo.

import * as THREE from 'three';
import { createStage, QUALITY_LEVELS } from './scene/stage.js';
import { createBackdrop, createEnvironment, createLights } from './scene/studio.js';
import { createRibbonGeometry, createRibbonMaterial, WIDE_HALF_WIDTH } from './scene/ribbon.js';
import { createAnts, createDust, createEdgeRunner, createGlyphTexture, createTraveler } from './scene/extras.js';
import { CHART, DIMS, TAU, chartNormal, chartPoint, edgePoint, frame as ribbonFrame } from './math/mobius.js';
import { clamp, damp, lerp, mixShots, presence, shotBlend, smoothstep, span, timelineAt } from './math/journey.js';
import { SCENES, SHOTS } from './shots.js';
import { createCards } from './ui/cards.js';
import { createNavigation } from './ui/navigation.js';

const root = document.documentElement;
const params = new URLSearchParams(location.search);

/** Fração do percurso entre duas paradas em que a câmera fica assentada. */
const HOLD = 0.5;
/** Faixa do progresso local de uma parada em que o card fica na tela. */
const CARD_WINDOW = [0.2, 0.84];
/** Proporção de tela abaixo da qual a câmera recua para a fita caber na largura. */
const FIT_ASPECT = 1.5;

function boot() {
  const canvas = document.querySelector('.stage');
  const sceneElements = SCENES.map((id) => document.querySelector(`[data-scene="${id}"]`));
  if (sceneElements.some((element) => !element)) throw new Error('Seções da página não conferem com o roteiro.');
  const sceneIndex = Object.fromEntries(SCENES.map((id, i) => [id, i]));

  // ---------- Preferências ----------

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const forceReduced = params.get('motion') === 'reduce';
  let reduced = forceReduced || motionQuery.matches;
  root.classList.toggle('reduce-motion', reduced);
  motionQuery.addEventListener('change', () => {
    reduced = forceReduced || motionQuery.matches;
    root.classList.toggle('reduce-motion', reduced);
  });

  const mobileQuery = window.matchMedia('(max-width: 899.98px)');
  const still = params.has('still'); // congela o tempo, para capturas comparáveis

  // ---------- Cena ----------

  const stage = createStage(canvas);
  const { scene, camera, renderer } = stage;

  scene.environment = createEnvironment(renderer);
  scene.environmentIntensity = 1.25;
  scene.add(createBackdrop(), createLights());

  const ribbonGroup = new THREE.Group();
  const ribbon = createRibbonMaterial(createGlyphTexture());
  const ribbonMesh = new THREE.Mesh(createRibbonGeometry(), ribbon.material);
  ribbonMesh.frustumCulled = false;
  const traveler = createTraveler();
  const runner = createEdgeRunner();
  const ants = createAnts();
  ribbonGroup.add(ribbonMesh, traveler.object, runner.object, ants.object);
  scene.add(ribbonGroup);

  const dust = createDust();
  scene.add(dust.object);

  // ---------- Qualidade ----------

  // Ponto de partida: GPUs integradas, celulares e máquinas modestas começam no nível
  // médio. Daí em diante, quem decide é o tempo de quadro medido.
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : 'WebGL';
  const integrated = /Intel|Mali|Adreno|PowerVR|Apple GPU|SwiftShader|llvmpipe|Basic Render/i.test(gpuName);
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const modest = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  // ?q=0, 1 ou 2 fixa um nível (alta, média, baixa) e desliga o ajuste automático.
  const qualityLocked = params.has('q');
  stage.setQuality(qualityLocked ? Number(params.get('q')) : integrated || coarse || modest ? 1 : 0);

  const applyQuality = () => {
    // O CSS também economiza no nível mais baixo (ver [data-quality] em styles.css).
    root.dataset.quality = String(stage.qualityIndex);
    ribbon.uniforms.uHardCut.value = stage.multisampled ? 0 : 1;
    dust.uniforms.uScale.value = stage.bufferHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
  };

  // Desce um degrau quando a página está lenta de verdade: mais de um quarto dos quadros
  // abaixo de uns 45 qps, em duas janelas seguidas de 60 quadros. Contar quadros lentos,
  // em vez de tirar a média, ignora engasgos isolados, que baixar a qualidade não resolve.
  const monitor = { cooldown: 3, frames: 0, slow: 0, strikes: 0 };
  const adaptQuality = (rawDt) => {
    if (qualityLocked || document.hidden) return;
    monitor.cooldown -= rawDt;
    if (monitor.cooldown > 0) return;
    monitor.frames += 1;
    if (rawDt > 1 / 45) monitor.slow += 1;
    if (monitor.frames < 60) return;
    monitor.strikes = monitor.slow > 15 ? monitor.strikes + 1 : 0;
    monitor.frames = 0;
    monitor.slow = 0;
    if (monitor.strikes >= 2 && stage.qualityIndex < QUALITY_LEVELS.length - 1) {
      stage.setQuality(stage.qualityIndex + 1);
      applyQuality();
      monitor.cooldown = 3;
      monitor.strikes = 0;
    }
  };

  // ---------- Medidas da página ----------

  const layout = { sections: [], mobile: false, dirty: true };
  const measure = () => {
    layout.dirty = false;
    layout.mobile = mobileQuery.matches;
    const scrollY = window.scrollY;
    layout.sections = sceneElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top + scrollY, height: rect.height };
    });
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width !== stage.size.width || height !== stage.size.height) {
      stage.resize(width, height);
      applyQuality();
    }
  };
  const invalidate = () => {
    layout.dirty = true;
  };
  window.addEventListener('resize', invalidate);
  new ResizeObserver(invalidate).observe(document.body);
  document.fonts?.ready.then(invalidate);

  // ---------- Interface ----------

  const cards = createCards(sceneElements);
  const navigation = createNavigation({ sceneIds: SCENES, sceneElements, isReduced: () => reduced });

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true },
  );

  // ---------- Estado da jornada ----------

  const state = { T: 0, Ts: 0, drift: 0, started: false, cutScene: -1 };
  const shot = {};
  const fx = { paintHead: 0, edgeHead: 0, glyphPos: 0, morph: 0 };
  const dims = { ...DIMS };

  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  /** Ponto da fita, em coordenadas da carta, para onde o card de cada parada aponta. */
  const anchors = {
    lado: () => ({ U: fx.paintHead % CHART, V: 0 }),
    borda: () => ({ edge: fx.edgeHead % CHART }),
    corte: () => ({ U: Math.PI * 3, V: 0.17 }),
    orientacao: () => ({ U: fx.glyphPos, V: 0 }),
    historia: () => ({ U: Math.PI * 1.5, V: 0.3 }),
    industria: () => ({ U: 5.4, V: -0.25 }),
    arte: (time) => ants.chartOf(0, time),
    raiz: () => ({ edge: 0.96 }),
  };

  /** Projeta o ponto de ancoragem na tela. Devolve null se ficar fora do quadro. */
  const projectAnchor = (id, time) => {
    const spot = anchors[id]?.(time);
    if (!spot) return null;
    normalMatrix.getNormalMatrix(ribbonGroup.matrixWorld);

    const place = (p, n) => {
      position.set(p[0], p[1], p[2]).applyMatrix4(ribbonGroup.matrixWorld);
      normal.set(n[0], n[1], n[2]).applyMatrix3(normalMatrix);
      return normal.dot(toCamera.copy(camera.position).sub(position)) > 0;
    };

    if (spot.edge !== undefined) {
      place(edgePoint(spot.edge, dims), ribbonFrame(spot.edge).width);
    } else if (!place(chartPoint(spot.U, spot.V, dims), chartNormal(spot.U, spot.V, dims))) {
      // A face está de costas para a câmera: o mesmo lugar do papel, pelo verso.
      place(chartPoint(spot.U + TAU, -spot.V, dims), chartNormal(spot.U + TAU, -spot.V, dims));
    }

    position.project(camera);
    if (position.z > 1 || Math.abs(position.x) > 1.05 || Math.abs(position.y) > 1.05) return null;
    return {
      x: (position.x * 0.5 + 0.5) * stage.size.width,
      y: (-position.y * 0.5 + 0.5) * stage.size.height,
    };
  };

  // ---------- Um quadro ----------

  const update = (time, dt) => {
    if (layout.dirty) measure();

    const count = SCENES.length;
    const T = timelineAt(layout.sections, window.scrollY + window.innerHeight / 2);
    state.T = T;
    state.Ts = !state.started || reduced ? T : damp(state.Ts, T, 5.5, dt);
    state.started = true;
    const Ts = state.Ts;
    const index = clamp(Math.floor(Ts), 0, count - 1);
    const local = Ts - index;
    const progress = (id, a, b) => span(Ts - sceneIndex[id], a, b);
    const weight = (id, ramps) => presence(Ts, sceneIndex[id], ramps);
    const clock = still || reduced ? 0 : time;

    // Câmera. Com menos movimento, ela não voa: troca de plano por corte.
    const blend = shotBlend(reduced ? index + 0.5 : Ts, count, HOLD);
    mixShots(SHOTS[blend.from], SHOTS[blend.to], blend.t, shot);

    if (reduced && index !== state.cutScene) {
      if (state.cutScene >= 0) {
        canvas.classList.add('is-cut');
        requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.remove('is-cut')));
      }
      state.cutScene = index;
    }

    // Giro lento da abertura e do encerramento. Fora deles, a fita termina a volta
    // em que estava, para que cada plano encontre a fita na posição prevista.
    if (still || reduced) {
      state.drift = 0;
    } else {
      state.drift += dt * 0.1 * shot.drift;
      const rest = Math.round(state.drift / TAU) * TAU;
      state.drift = damp(state.drift, rest, 4 * (1 - shot.drift), dt);
    }

    pointer.sx = damp(pointer.sx, reduced ? 0 : pointer.x, 3, dt);
    pointer.sy = damp(pointer.sy, reduced ? 0 : pointer.y, 3, dt);

    const aspect = stage.size.width / stage.size.height;
    const fit = aspect < FIT_ASPECT ? Math.pow(FIT_ASPECT / aspect, 0.72) : 1;
    const az = shot.az + state.drift + 0.05 * Math.sin(clock * 0.21) + pointer.sx * 0.06;
    const el = shot.el + 0.022 * Math.sin(clock * 0.17 + 1.3) - pointer.sy * 0.035;
    const dist = shot.dist * fit;
    const [tx, ty, tz] = shot.target;
    camera.position.set(
      tx + dist * Math.cos(el) * Math.sin(az),
      ty + dist * Math.sin(el),
      tz + dist * Math.cos(el) * Math.cos(az),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(tx, ty, tz);
    camera.rotateZ(shot.roll);
    // No celular o card ocupa a base: a fita sobe e fica centrada na largura.
    const shiftX = layout.mobile ? 0 : shot.shift[0];
    const shiftY = layout.mobile ? 0.15 : shot.shift[1];
    const { width, height } = stage.size;
    camera.setViewOffset(width, height, -shiftX * width, shiftY * height, width, height);
    camera.updateMatrixWorld();

    // Efeitos de cada parada.
    const u = ribbon.uniforms;
    u.uTime.value = clock;

    fx.paintHead = CHART * progress('lado', 0.2, 0.8);
    u.uPaint.value = weight('lado');
    u.uPaintHead.value = fx.paintHead;
    // A fita gira na mão para que a face que está sendo pintada fique voltada para cima.
    ribbonGroup.rotation.z = reduced ? 0 : fx.paintHead / 2;
    const traveling = smoothstep(0, 0.2, fx.paintHead) * (1 - smoothstep(CHART - 0.2, CHART, fx.paintHead));
    traveler.update(fx.paintHead, u.uPaint.value * traveling);

    fx.edgeHead = CHART * progress('borda', 0.2, 0.8);
    u.uEdge.value = weight('borda');
    u.uEdgeHead.value = fx.edgeHead;
    const running = smoothstep(0, 0.2, fx.edgeHead) * (1 - smoothstep(CHART - 0.2, CHART, fx.edgeHead));
    runner.update(fx.edgeHead, u.uEdge.value * running);

    u.uCut.value = weight('corte', { rise: 0.32, fall: 0.16 });

    fx.glyphPos = TAU * progress('orientacao', 0.25, 0.78);
    u.uGlyph.value = weight('orientacao');
    u.uGlyphPos.value = fx.glyphPos;

    u.uMosaic.value = weight('historia', { rise: 0.3, fall: 0.2 });
    u.uBelt.value = weight('industria', { rise: 0.28, fall: 0.2 });
    u.uLattice.value = weight('arte', { rise: 0.32, fall: 0.2 });
    ants.update(clock, u.uLattice.value);

    fx.morph = weight('raiz', { rise: 0.5, fall: 0.16 });
    ribbonMesh.morphTargetInfluences[0] = fx.morph;
    dims.halfWidth = lerp(DIMS.halfWidth, WIDE_HALF_WIDTH, fx.morph);

    scene.environmentRotation.y = clock * 0.03;
    dust.uniforms.uTime.value = clock;
    ribbonGroup.updateMatrixWorld(true);

    // As centelhas iluminam a fita no shader, que precisa delas em espaço de visão.
    const light = (uniform, spark, strength) => {
      position.copy(spark.object.position).applyMatrix4(ribbonGroup.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      uniform.value.set(position.x, position.y, position.z, strength * spark.weight);
    };
    light(u.uSparkA, traveler, 0.9);
    light(u.uSparkB, runner, 0.7);

    // Interface.
    const cardOn = cards.hasCard(index) && local >= CARD_WINDOW[0] && local <= CARD_WINDOW[1];
    cards.update(cardOn ? index : -1, cardOn ? projectAnchor(SCENES[index], clock) : null);
    navigation.update(index, Ts);
  };

  // Se o navegador tomar o contexto WebGL de volta (pouca memória, troca de GPU), a
  // página passa para a versão estática em vez de ficar com um palco vazio.
  let alive = true;
  canvas.addEventListener('webglcontextlost', () => {
    alive = false;
    root.classList.remove('is-ready');
    root.classList.add('no-webgl');
  });

  let last = performance.now() / 1000;
  const loop = (now) => {
    if (!alive) return;
    requestAnimationFrame(loop);
    const time = now / 1000;
    const rawDt = time - last;
    last = time;
    update(time, Math.min(rawDt, 0.05));
    stage.render(time, !(reduced || still));
    adaptQuality(rawDt);
  };

  // ---------- Partida ----------

  measure();
  applyQuality();

  // Compila todos os shaders agora, com os figurantes à mostra, para que nenhuma
  // parada engasgue ao aparecer pela primeira vez.
  const extras = [traveler.object, runner.object, ants.object];
  extras.forEach((object) => (object.visible = true));
  stage.compile();
  extras.forEach((object) => (object.visible = false));

  update(last, 0);
  stage.render(last, false);
  requestAnimationFrame(loop);

  root.classList.remove('no-webgl');
  root.classList.add('is-ready');

  // Ganchos para as ferramentas de captura e de medição (tools/).
  window.__mobius = {
    ready: true,
    renderer: gpuName,
    /** Assenta a câmera no destino de uma vez. Usado pela ferramenta de captura. */
    settle() {
      state.started = false;
      state.drift = 0;
      pointer.sx = pointer.sy = pointer.x = pointer.y = 0;
    },
    get quality() {
      return stage.quality.name;
    },
  };
}

try {
  boot();
} catch (error) {
  console.warn('Cena 3D indisponível, usando a versão estática.', error);
  root.classList.add('no-webgl');
  window.__mobius = { ready: false };
}
