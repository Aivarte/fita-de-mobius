import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAU,
  CHART,
  DIMS,
  frame,
  stripPoint,
  chartPoint,
  chartNormal,
  chartTangent,
  edgeCoord,
  edgePoint,
  rimPoint,
  rimNormal,
  buildRibbon,
} from '../js/math/mobius.js';

/** Solda por tolerância: vértices a menos de `eps` um do outro viram o mesmo. */
function weldVertices(positions, eps = 1e-5) {
  const cell = eps * 8;
  const buckets = new Map();
  const reps = [];
  const count = positions.length / 3;
  const welded = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const p = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const c = p.map((x) => Math.floor(x / cell));
    let found = -1;
    for (let dx = -1; dx <= 1 && found < 0; dx++) {
      for (let dy = -1; dy <= 1 && found < 0; dy++) {
        for (let dz = -1; dz <= 1 && found < 0; dz++) {
          const bucket = buckets.get(`${c[0] + dx},${c[1] + dy},${c[2] + dz}`);
          if (!bucket) continue;
          for (const id of bucket) {
            const q = reps[id];
            if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < eps) {
              found = id;
              break;
            }
          }
        }
      }
    }
    if (found < 0) {
      found = reps.length;
      reps.push(p);
      const key = c.join(',');
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(found);
    }
    welded[i] = found;
  }
  return { welded, count: reps.length };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => scale(a, 1 / len(a));
const assertNear = (a, b, eps = 1e-9, msg = '') =>
  assert.ok(Math.abs(a - b) <= eps, `${msg} esperado ${b}, veio ${a}`);
const assertVecNear = (a, b, eps = 1e-9, msg = '') =>
  assert.ok(len(sub(a, b)) <= eps, `${msg} esperado [${b}], veio [${a}]`);

// Amostras espalhadas pelas duas voltas da carta.
const US = [0, 0.3, 1.1, 2.9, 3.14, 4.4, 6.0, 6.5, 7.7, 9.2, 11.5, 12.5];
const VS = [-1, -0.6, 0, 0.35, 1];

test('o referencial (tangente, largura, normal) é ortonormal e destro', () => {
  for (const U of US) {
    const f = frame(U);
    assertNear(len(f.tangent), 1);
    assertNear(len(f.width), 1);
    assertNear(len(f.normal), 1);
    assertNear(dot(f.tangent, f.width), 0);
    assertNear(dot(f.tangent, f.normal), 0);
    assertNear(dot(f.width, f.normal), 0);
    assertVecNear(cross(f.tangent, f.width), f.normal, 1e-12, 'T x W = N;');
  }
});

test('meia-torção: depois de uma volta a largura e a normal invertem', () => {
  for (const U of US) {
    const a = frame(U);
    const b = frame(U + TAU);
    assertVecNear(b.center, a.center, 1e-12);
    assertVecNear(b.width, scale(a.width, -1), 1e-12);
    assertVecNear(b.normal, scale(a.normal, -1), 1e-12);
  }
});

test('depois de duas voltas o referencial volta ao que era', () => {
  for (const U of US) {
    const a = frame(U);
    const b = frame(U + CHART);
    assertVecNear(b.width, a.width, 1e-12);
    assertVecNear(b.normal, a.normal, 1e-12);
  }
});

test('identificação de Möbius: P(u + 2π, v) = P(u, -v)', () => {
  for (const u of US) {
    for (const v of [-0.4, -0.1, 0, 0.25, 0.4]) {
      assertVecNear(stripPoint(u + TAU, v), stripPoint(u, -v), 1e-12);
    }
  }
});

test('a carta de 4π cobre as duas faces: (U + 2π, -V) é o verso de (U, V)', () => {
  for (const U of US) {
    for (const V of VS) {
      const front = chartPoint(U, V);
      const back = chartPoint(U + TAU, -V);
      // Mesmo lugar da fita, separado apenas pela espessura, ao longo da normal.
      const gap = sub(front, back);
      assertNear(len(gap), 2 * DIMS.halfThickness, 1e-12, 'espessura;');
      assertVecNear(unit(gap), frame(U).normal, 1e-9);
      // E as normais das duas faces são opostas, a menos de um desvio da ordem
      // da espessura (as faces são deslocamentos ao longo do referencial, não
      // superfícies exatamente paralelas).
      assertVecNear(
        chartNormal(U + TAU, -V),
        scale(chartNormal(U, V), -1),
        DIMS.halfThickness,
      );
    }
  }
});

test('a carta é contínua e periódica em 4π', () => {
  for (const U of US) {
    for (const V of VS) {
      assertVecNear(chartPoint(U + CHART, V), chartPoint(U, V), 1e-12);
      assertVecNear(chartNormal(U + CHART, V), chartNormal(U, V), 1e-12);
    }
  }
});

test('a normal analítica bate com a normal por diferenças finitas', () => {
  const h = 1e-5;
  for (const U of US) {
    for (const V of [-0.9, -0.3, 0, 0.5, 0.9]) {
      const dU = sub(chartPoint(U + h, V), chartPoint(U - h, V));
      const dV = sub(chartPoint(U, V + h), chartPoint(U, V - h));
      const numeric = unit(cross(dU, dV));
      const analytic = chartNormal(U, V);
      assertNear(len(analytic), 1, 1e-12);
      assertVecNear(analytic, numeric, 1e-6);
      assertVecNear(chartTangent(U, V), unit(dU), 1e-6, 'tangente;');
    }
  }
});

test('o parâmetro lift afasta o ponto ao longo da normal', () => {
  for (const U of US) {
    const base = chartPoint(U, 0.4);
    const lifted = chartPoint(U, 0.4, DIMS, 0.1);
    assertVecNear(sub(lifted, base), scale(chartNormal(U, 0.4), 0.1), 1e-12);
  }
});

test('uma borda só: as duas beiradas são a mesma curva', () => {
  for (const U of US) {
    // A beirada V = +1 em U é a mesma beirada que V = -1 uma volta depois.
    assertNear(edgeCoord(U, 1), edgeCoord(U + TAU, -1), 1e-12);
  }
  // A curva da borda só fecha depois de duas voltas...
  assertVecNear(edgePoint(CHART), edgePoint(0), 1e-12);
  // ...e a meio caminho está do outro lado da faixa: por fora em 0, por dentro em 2π.
  const outer = edgePoint(0);
  const inner = edgePoint(TAU);
  assertNear(Math.hypot(outer[0], outer[2]), DIMS.radius + DIMS.halfWidth, 1e-12);
  assertNear(Math.hypot(inner[0], inner[2]), DIMS.radius - DIMS.halfWidth, 1e-12);
});

test('a borda tem cerca do dobro do comprimento da linha central', () => {
  const steps = 4000;
  let length = 0;
  let previous = edgePoint(0);
  for (let i = 1; i <= steps; i++) {
    const current = edgePoint((CHART * i) / steps);
    length += len(sub(current, previous));
    previous = current;
  }
  const ratio = length / (TAU * DIMS.radius);
  assert.ok(ratio > 1.95 && ratio < 2.2, `razão ${ratio}`);
});

test('a malha é um sólido fechado com a topologia de um toro', () => {
  const mesh = buildRibbon({ segmentsU: 64, segmentsV: 4, segmentsRim: 4 });
  const { positions, normals, chart, indices } = mesh;
  const vertexCount = positions.length / 3;
  assert.equal(normals.length, positions.length);
  assert.equal(chart.length, positions.length);
  assert.equal(indices.length % 3, 0);

  // Solda os vértices duplicados nas costuras para olhar a topologia.
  const { welded, count: weldedCount } = weldVertices(positions);

  const edges = new Map();
  const faceCount = indices.length / 3;
  for (let f = 0; f < faceCount; f++) {
    const tri = [indices[f * 3], indices[f * 3 + 1], indices[f * 3 + 2]];
    for (const i of tri) assert.ok(i < vertexCount, 'índice fora da malha');
    const w = tri.map((i) => welded[i]);
    assert.ok(w[0] !== w[1] && w[1] !== w[2] && w[0] !== w[2], 'triângulo degenerado');
    for (let k = 0; k < 3; k++) {
      const a = w[k];
      const b = w[(k + 1) % 3];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  for (const [key, count] of edges) {
    assert.equal(count, 2, `aresta ${key} pertence a ${count} triângulos`);
  }
  // V - E + F = 0: a casca de uma fita com espessura é um toro.
  assert.equal(weldedCount - edges.size + faceCount, 0);
});

test('a normal da beirada bate com a normal por diferenças finitas', () => {
  const h = 1e-5;
  for (const U of US) {
    for (const phi of [0.05, 0.7, Math.PI / 2, 2.2, 3.0]) {
      const dU = sub(rimPoint(U + h, phi), rimPoint(U - h, phi));
      const dPhi = sub(rimPoint(U, phi + h), rimPoint(U, phi - h));
      assertVecNear(rimNormal(U, phi), unit(cross(dU, dPhi)), 1e-5);
    }
    // A beirada emenda nas faces sem quina: mesma posição e mesma normal.
    assertVecNear(rimPoint(U, 0), chartPoint(U, 1), 1e-12);
    assertVecNear(rimNormal(U, 0), chartNormal(U, 1), 1e-12);
    assertVecNear(rimPoint(U, Math.PI), chartPoint(U + TAU, -1), 1e-12);
    assertVecNear(rimNormal(U, Math.PI), chartNormal(U + TAU, -1), 1e-12);
    // E o ápice da beirada é a curva da borda.
    assertVecNear(rimPoint(U, Math.PI / 2), edgePoint(U), 1e-12);
  }
});

test('os triângulos apontam para fora, de acordo com as normais', () => {
  const { positions, normals, indices } = buildRibbon({
    segmentsU: 96,
    segmentsV: 6,
    segmentsRim: 6,
  });
  const P = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  const N = (i) => [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
  for (let f = 0; f < indices.length; f += 3) {
    const [a, b, c] = [indices[f], indices[f + 1], indices[f + 2]];
    const face = unit(cross(sub(P(b), P(a)), sub(P(c), P(a))));
    for (const i of [a, b, c]) {
      assertNear(len(N(i)), 1, 1e-5);
      assert.ok(dot(face, N(i)) > 0.7, `face e normal divergem no triângulo ${f / 3}`);
    }
  }
});

test('nenhum triângulo interpola as coordenadas da carta através de uma costura', () => {
  const segmentsU = 64;
  const { chart, indices } = buildRibbon({ segmentsU, segmentsV: 4, segmentsRim: 4 });
  const step = CHART / segmentsU;
  for (let f = 0; f < indices.length; f += 3) {
    const tri = [indices[f], indices[f + 1], indices[f + 2]];
    const us = tri.map((i) => chart[i * 3]);
    const vs = tri.map((i) => chart[i * 3 + 1]);
    assert.ok(Math.max(...us) - Math.min(...us) <= step * 1.001, 'salto em U');
    assert.ok(Math.max(...vs) - Math.min(...vs) <= 0.5 + 1e-9, 'salto em V');
    // Folga de precisão simples: a malha guarda as coordenadas em Float32.
    for (const u of us) assert.ok(u >= 0 && u <= CHART + 1e-5);
  }
});

test('larguras diferentes geram malhas compatíveis (alvo de morph)', () => {
  const a = buildRibbon({ segmentsU: 64, segmentsV: 4, segmentsRim: 4 });
  const b = buildRibbon({
    dims: { ...DIMS, halfWidth: 0.7 },
    segmentsU: 64,
    segmentsV: 4,
    segmentsRim: 4,
  });
  assert.equal(a.positions.length, b.positions.length);
  assert.deepEqual(Array.from(a.indices), Array.from(b.indices));
  assert.deepEqual(Array.from(a.chart), Array.from(b.chart));
});
