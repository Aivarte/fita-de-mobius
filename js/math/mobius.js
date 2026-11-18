// Matemática pura da fita de Möbius. Sem dependências: roda no navegador e no Node.
//
// A fita é tratada como um sólido fino, e sua casca tem duas partes:
//   - a carta: as faces planas, parametrizadas por (U, V), com U em [0, 4π) e V em [-1, 1];
//   - a beirada: o arredondamento lateral, parametrizado por (U, φ), com φ em [0, π].
//
// U percorre DUAS voltas. É a meia-torção que permite isso: depois de uma volta o
// referencial chega invertido, e a mesma fórmula passa a descrever o verso do papel.
// Uma única carta para as duas faces e uma única beirada: "um lado só, uma borda só"
// escrito na própria malha.

export const TAU = Math.PI * 2;

/** Comprimento da carta contínua: duas voltas. */
export const CHART = TAU * 2;

/** Dimensões padrão: raio da linha central, meia largura total e meia espessura. */
export const DIMS = Object.freeze({ radius: 1, halfWidth: 0.42, halfThickness: 0.014 });

const flatHalfWidth = (dims) => dims.halfWidth - dims.halfThickness;

const combine = (a, ka, b, kb, c, kc) => [
  a[0] * ka + b[0] * kb + c[0] * kc,
  a[1] * ka + b[1] * kb + c[1] * kc,
  a[2] * ka + b[2] * kb + c[2] * kc,
];

const normalize = (v) => {
  const k = 1 / Math.hypot(v[0], v[1], v[2]);
  return [v[0] * k, v[1] * k, v[2] * k];
};

/**
 * Referencial móvel na linha central, que é um círculo no plano XZ.
 * `width` aponta ao longo da largura da fita e `normal` é perpendicular a ela.
 * Os dois giram meia volta a cada volta completa: essa é a torção.
 */
export function frame(U, radius = DIMS.radius) {
  const cu = Math.cos(U);
  const su = Math.sin(U);
  const c = Math.cos(U / 2);
  const s = Math.sin(U / 2);
  return {
    center: [radius * cu, 0, radius * su],
    tangent: [-su, 0, cu],
    width: [c * cu, s, c * su],
    normal: [-s * cu, c, -s * su],
  };
}

/** Ponto da fita ideal, sem espessura: P(u, v) = C(u) + v W(u). */
export function stripPoint(u, v, radius = DIMS.radius) {
  const f = frame(u, radius);
  return [
    f.center[0] + v * f.width[0],
    f.center[1] + v * f.width[1],
    f.center[2] + v * f.width[2],
  ];
}

/** Normal unitária da face plana, apontando para fora do sólido. */
export function chartNormal(U, V, dims = DIMS) {
  const f = frame(U, dims.radius);
  const a = V * flatHalfWidth(dims);
  const k = dims.radius + a * Math.cos(U / 2) - dims.halfThickness * Math.sin(U / 2);
  return normalize(combine(f.normal, k, f.tangent, -a / 2, f.width, 0));
}

/** Direção unitária de avanço sobre a face (derivada em U). */
export function chartTangent(U, V, dims = DIMS) {
  const f = frame(U, dims.radius);
  const h = dims.halfThickness;
  const a = V * flatHalfWidth(dims);
  const k = dims.radius + a * Math.cos(U / 2) - h * Math.sin(U / 2);
  return normalize(combine(f.tangent, k, f.normal, a / 2, f.width, -h / 2));
}

/**
 * Ponto sobre a face plana do sólido. `lift` afasta o ponto da superfície ao longo
 * da normal, para pousar objetos sobre a fita.
 */
export function chartPoint(U, V, dims = DIMS, lift = 0) {
  const f = frame(U, dims.radius);
  const a = V * flatHalfWidth(dims);
  const h = dims.halfThickness;
  const p = [
    f.center[0] + a * f.width[0] + h * f.normal[0],
    f.center[1] + a * f.width[1] + h * f.normal[1],
    f.center[2] + a * f.width[2] + h * f.normal[2],
  ];
  if (lift !== 0) {
    const n = chartNormal(U, V, dims);
    p[0] += lift * n[0];
    p[1] += lift * n[1];
    p[2] += lift * n[2];
  }
  return p;
}

/**
 * Coordenada ao longo da borda única, em [0, 4π), da beirada mais próxima de (U, V).
 * A beirada V = +1 em U é a mesma que V = -1 uma volta depois.
 */
export function edgeCoord(U, V) {
  const e = (U + (V < 0 ? TAU : 0)) % CHART;
  return e < 0 ? e + CHART : e;
}

/** Ponto no ápice da beirada. A curva só fecha depois de duas voltas. */
export function edgePoint(e, dims = DIMS, lift = 0) {
  const f = frame(e, dims.radius);
  const a = dims.halfWidth + lift;
  return [
    f.center[0] + a * f.width[0],
    f.center[1] + a * f.width[1],
    f.center[2] + a * f.width[2],
  ];
}

/** Ponto do arredondamento lateral: φ = 0 encosta na face de cima, φ = π na de baixo. */
export function rimPoint(U, phi, dims = DIMS) {
  const f = frame(U, dims.radius);
  const h = dims.halfThickness;
  const a = flatHalfWidth(dims) + h * Math.sin(phi);
  const b = h * Math.cos(phi);
  return [
    f.center[0] + a * f.width[0] + b * f.normal[0],
    f.center[1] + a * f.width[1] + b * f.normal[1],
    f.center[2] + a * f.width[2] + b * f.normal[2],
  ];
}

/** Normal unitária do arredondamento lateral, apontando para fora. */
export function rimNormal(U, phi, dims = DIMS) {
  const f = frame(U, dims.radius);
  const h = dims.halfThickness;
  const wf = flatHalfWidth(dims);
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const a = wf + h * sin;
  const b = h * cos;
  const k = dims.radius + a * Math.cos(U / 2) - b * Math.sin(U / 2);
  return normalize(combine(f.width, k * sin, f.normal, k * cos, f.tangent, -0.5 * wf * cos));
}

/**
 * Malha do sólido. Devolve vetores simples (sem Three.js):
 *   positions, normals: xyz por vértice
 *   chart: (U, V, rim) por vértice. `rim` vai de 0 na face plana a 1 no ápice da beirada.
 *   indices: triângulos com a frente para fora
 *
 * Os vértices são duplicados nas costuras para que nenhum triângulo interpole as
 * coordenadas da carta através de um salto.
 */
export function buildRibbon({
  dims = DIMS,
  segmentsU = 512,
  segmentsV = 12,
  segmentsRim = 8,
} = {}) {
  if (segmentsU % 2 !== 0 || segmentsRim % 2 !== 0) {
    throw new RangeError('segmentsU e segmentsRim precisam ser pares');
  }

  const positions = [];
  const normals = [];
  const chart = [];
  const indices = [];

  // Grade de (nu + 1) x (nv + 1) vértices. As duas direções da grade formam, nessa
  // ordem, um produto vetorial que aponta para fora.
  const grid = (nu, nv, sample) => {
    const base = positions.length / 3;
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const s = sample(i, j);
        positions.push(s.p[0], s.p[1], s.p[2]);
        normals.push(s.n[0], s.n[1], s.n[2]);
        chart.push(s.U, s.V, s.rim);
      }
    }
    const at = (i, j) => base + i * (nv + 1) + j;
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i + 1, j + 1);
        const d = at(i, j + 1);
        indices.push(a, b, c, a, c, d);
      }
    }
  };

  const half = segmentsRim / 2;
  const quarter = Math.PI / 2;

  // Faces planas: a carta inteira, duas voltas.
  grid(segmentsU, segmentsV, (i, j) => {
    const U = (CHART * i) / segmentsU;
    const V = -1 + (2 * j) / segmentsV;
    return { p: chartPoint(U, V, dims), n: chartNormal(U, V, dims), U, V, rim: 0 };
  });

  // Beirada, metade de cima: continua a carta em (U, +1).
  grid(segmentsU, half, (i, k) => {
    const U = (CHART * i) / segmentsU;
    const phi = (quarter * k) / half;
    return { p: rimPoint(U, phi, dims), n: rimNormal(U, phi, dims), U, V: 1, rim: k / half };
  });

  // Beirada, metade de baixo: continua a carta uma volta adiante, em (U + 2π, -1).
  // São duas tiras para que o salto de 4π para 0 não caia dentro de um triângulo.
  for (const [start, shift] of [
    [0, TAU],
    [segmentsU / 2, -TAU],
  ]) {
    grid(segmentsU / 2, half, (i, k) => {
      const U = (CHART * (start + i)) / segmentsU;
      const phi = quarter + (quarter * k) / half;
      return {
        p: rimPoint(U, phi, dims),
        n: rimNormal(U, phi, dims),
        U: U + shift,
        V: -1,
        rim: 1 - k / half,
      };
    });
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    chart: new Float32Array(chart),
    indices: new Uint32Array(indices),
  };
}
