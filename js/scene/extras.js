// Figurantes da cena: a seta circular, as luzes viajantes, as formigas e a poeira.

import * as THREE from 'three';
import { CHART, DIMS, chartNormal, chartPoint, chartTangent, edgePoint } from '../math/mobius.js';

/** Textura da seta circular (canal vermelho), usada na parada da orientação. */
export function createGlyphTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const radius = size * 0.27;
  const stroke = size * 0.085;
  const start = -Math.PI * 0.42;
  const end = start + Math.PI * 1.62;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(c, c, radius, start, end);
  ctx.stroke();

  // Ponta da seta, tangente ao fim do arco.
  const tipX = c + Math.cos(end) * radius;
  const tipY = c + Math.sin(end) * radius;
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(end + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(stroke * 1.55, 0);
  ctx.lineTo(-stroke * 0.5, -stroke * 1.35);
  ctx.lineTo(-stroke * 0.5, stroke * 1.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function glowMaterial(color, intensity) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });
}

/**
 * Pequena esfera luminosa que viaja sobre a fita. A luz que ela lança na superfície
 * é calculada no shader da fita (uniformes uSparkA e uSparkB): sai mais barato do
 * que uma luz de verdade e não muda a contagem de luzes da cena no meio da jornada.
 */
function createSpark(color, coreIntensity, minScale) {
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.02, 20, 14), glowMaterial(color, coreIntensity));
  core.visible = false;
  return {
    object: core,
    /** Brilho atual, de 0 (apagada) a 1. */
    weight: 0,
    /** Posiciona a centelha, em coordenadas da fita, e ajusta o brilho. */
    place(point, weight) {
      this.weight = weight > 0.01 ? weight : 0;
      core.visible = this.weight > 0;
      if (!core.visible) return;
      core.position.set(point[0], point[1], point[2]);
      core.scale.setScalar(minScale + 0.4 * weight);
    },
  };
}

/** O viajante que pinta a fita na primeira parada. `U` é a posição na carta. */
export function createTraveler() {
  const spark = createSpark(0xffa040, 9, 0.6);
  spark.update = (U, weight) => spark.place(chartPoint(U, 0, DIMS, 0.05), weight);
  return spark;
}

/** A luz que percorre a borda única na segunda parada. `e` é a coordenada da borda. */
export function createEdgeRunner() {
  const spark = createSpark(0xffe3c0, 8, 0.5);
  spark.update = (e, weight) => spark.place(edgePoint(e, DIMS, 0.012), weight);
  return spark;
}

/** Junta geometrias já transformadas numa só (posição, normal e índices). */
function mergeGeometries(parts) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (const { geometry, matrix } of parts) {
    const g = geometry.clone().applyMatrix4(matrix);
    const offset = positions.length / 3;
    positions.push(...g.attributes.position.array);
    normals.push(...g.attributes.normal.array);
    for (const i of g.index.array) indices.push(i + offset);
    g.dispose();
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}

/** Uma formiga estilizada: três gomos e seis pernas. Olha para +X, de pé em +Y. */
function createAntGeometry() {
  const parts = [];
  const place = (geometry, position, scale, rotation = [0, 0, 0]) => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    );
    parts.push({ geometry, matrix });
  };
  const ball = () => new THREE.SphereGeometry(1, 14, 10);
  place(ball(), [-0.95, 0.62, 0], [0.72, 0.5, 0.52]); // abdômen
  place(ball(), [0, 0.52, 0], [0.4, 0.3, 0.3]); // tórax
  place(ball(), [0.62, 0.6, 0], [0.34, 0.3, 0.32]); // cabeça
  for (const side of [-1, 1]) {
    for (const [x, splay] of [
      [0.25, 0.45],
      [0, 0],
      [-0.25, -0.45],
    ]) {
      place(
        new THREE.CylinderGeometry(0.035, 0.03, 0.95, 5),
        [x + splay * 0.35, 0.3, side * 0.42],
        [1, 1, 1],
        [side * 0.95, splay * side, 0],
      );
    }
  }
  return mergeGeometries(parts);
}

/**
 * As nove formigas da gravura de Escher. Elas andam pela carta de 4π, então passam
 * pelas duas "faces" sem nunca virar a beirada.
 */
export function createAnts(count = 9) {
  const geometry = createAntGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: 0xb3261a,
    roughness: 0.3,
    metalness: 0.1,
    emissive: 0xa81c0c,
    emissiveIntensity: 0.7,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.visible = false;

  // Pistas sobre as vigas da treliça (V = ±0.2 e ±0.6), com espaçamento irregular.
  const lanes = [-0.6, 0.2, -0.2, 0.6, -0.6, 0.2, 0.6, -0.2, 0.2];
  const phases = Array.from({ length: count }, (_, i) => (CHART * i) / count + (i % 3) * 0.21);

  const basis = new THREE.Matrix4();
  const x = new THREE.Vector3();
  const y = new THREE.Vector3();
  const z = new THREE.Vector3();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const size = 0.058;

  const chartOf = (i, time) => ({
    U: (phases[i] + time * 0.16) % CHART,
    V: lanes[i % lanes.length],
  });

  return {
    object: mesh,
    /** Posição da formiga `i` na carta, no instante `time`. */
    chartOf,
    update(time, weight) {
      mesh.visible = weight > 0.01;
      if (!mesh.visible) return;
      for (let i = 0; i < count; i++) {
        const { U, V } = chartOf(i, time);
        const p = chartPoint(U, V, DIMS, 0.002);
        const n = chartNormal(U, V);
        const t = chartTangent(U, V);
        x.set(t[0], t[1], t[2]);
        y.set(n[0], n[1], n[2]);
        z.crossVectors(x, y).normalize();
        x.crossVectors(y, z);
        basis.makeBasis(x, y, z);
        quaternion.setFromRotationMatrix(basis);
        position.set(p[0], p[1], p[2]);
        scale.setScalar(size * weight);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** Poeira em suspensão: dá profundidade ao vazio e pega a luz ao passar. */
export function createDust(count = 260) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  // Gerador determinístico: a mesma poeira em toda visita.
  let state = 20261118;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - 0.5) * 12;
    positions[i * 3 + 1] = (random() - 0.5) * 7;
    positions[i * 3 + 2] = (random() - 0.5) * 12;
    seeds[i] = random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 1 },
      uIntensity: { value: 0.5 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uScale;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.07 + aSeed * 6.283) * 0.35;
        p.x += cos(uTime * 0.05 + aSeed * 12.57) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float depth = max(-mv.z, 0.001);
        gl_PointSize = uScale * (0.006 + 0.012 * aSeed) / depth;
        // Some perto demais da câmera e ao longe.
        vAlpha = smoothstep(0.8, 2.6, depth) * (1.0 - smoothstep(8.0, 13.0, depth)) * (0.2 + 0.8 * fract(aSeed * 7.31));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.0, 1.0, d)) * vAlpha * uIntensity;
        gl_FragColor = vec4(vec3(1.0, 0.94, 0.86) * a, a);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { object: points, uniforms: material.uniforms };
}
