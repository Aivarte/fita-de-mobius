import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  lerp,
  span,
  smoothstep,
  damp,
  timelineAt,
  shotBlend,
  mixShots,
  presence,
} from '../js/math/journey.js';

const assertNear = (a, b, eps = 1e-9, msg = '') =>
  assert.ok(Math.abs(a - b) <= eps, `${msg} esperado ${b}, veio ${a}`);

test('clamp, lerp e span', () => {
  assert.equal(clamp(-1), 0);
  assert.equal(clamp(2), 1);
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(lerp(10, 20, 0.25), 12.5);
  assert.equal(span(0.5, 0.25, 0.75), 0.5);
  assert.equal(span(0, 0.25, 0.75), 0);
  assert.equal(span(1, 0.25, 0.75), 1);
});

test('smoothstep é monótono, com extremos exatos', () => {
  assert.equal(smoothstep(0, 1, -0.5), 0);
  assert.equal(smoothstep(0, 1, 1.5), 1);
  assertNear(smoothstep(0, 1, 0.5), 0.5);
  let previous = 0;
  for (let x = 0; x <= 1.0001; x += 0.05) {
    const y = smoothstep(0, 1, x);
    assert.ok(y >= previous - 1e-12);
    previous = y;
  }
});

test('damp aproxima do alvo sem passar dele e independe da taxa de quadros', () => {
  let x = 0;
  for (let i = 0; i < 600; i++) {
    const next = damp(x, 1, 6, 1 / 60);
    assert.ok(next >= x && next <= 1, 'não pode passar do alvo');
    x = next;
  }
  assertNear(x, 1, 1e-6);

  const oneStep = damp(0, 1, 6, 1 / 30);
  const twoSteps = damp(damp(0, 1, 6, 1 / 60), 1, 6, 1 / 60);
  assertNear(oneStep, twoSteps, 1e-12);
  assert.equal(damp(0.3, 1, 6, 0), 0.3);
});

test('timelineAt converte posição em índice da seção mais progresso local', () => {
  const sections = [
    { top: 0, height: 900 },
    { top: 900, height: 1800 },
    { top: 2700, height: 900 },
  ];
  assert.equal(timelineAt(sections, -50), 0);
  assert.equal(timelineAt(sections, 0), 0);
  assert.equal(timelineAt(sections, 450), 0.5);
  assert.equal(timelineAt(sections, 900), 1);
  assert.equal(timelineAt(sections, 1800), 1.5);
  assert.equal(timelineAt(sections, 3150), 2.5);
  assert.equal(timelineAt(sections, 99999), 3);
  assert.equal(timelineAt([], 100), 0);
});

test('shotBlend assenta no centro de cada seção e viaja entre os centros', () => {
  const count = 4;
  // Antes do primeiro centro e depois do último: plano único.
  assert.deepEqual(shotBlend(0.1, count), { from: 0, to: 0, t: 0 });
  assert.deepEqual(shotBlend(3.9, count), { from: 3, to: 3, t: 0 });
  // Exatamente no centro: plano puro.
  assert.deepEqual(shotBlend(1.5, count), { from: 1, to: 2, t: 0 });
  // Dentro da pausa em torno do centro continua puro.
  assert.equal(shotBlend(1.7, count, 0.5).t, 0);
  assert.equal(shotBlend(2.3, count, 0.5).t, 1);
  // No meio do caminho entre dois centros, metade.
  const mid = shotBlend(2.0, count, 0.5);
  assert.equal(mid.from, 1);
  assert.equal(mid.to, 2);
  assertNear(mid.t, 0.5);
});

test('shotBlend é monótono e contínuo ao longo da jornada', () => {
  const count = 5;
  let previous = 0;
  for (let T = 0; T <= count; T += 0.01) {
    const { from, t } = shotBlend(T, count, 0.4);
    const position = from + t;
    assert.ok(position >= previous - 1e-9, `retrocedeu em T=${T}`);
    assert.ok(position - previous < 0.05, `salto em T=${T}`);
    previous = position;
  }
});

test('mixShots interpola números e vetores e ignora o resto', () => {
  const a = { az: 0, dist: 4, target: [0, 0, 0], side: 'left' };
  const b = { az: 2, dist: 2, target: [1, 2, 3], side: 'right' };
  assert.deepEqual(mixShots(a, b, 0), { az: 0, dist: 4, target: [0, 0, 0] });
  assert.deepEqual(mixShots(a, b, 1), { az: 2, dist: 2, target: [1, 2, 3] });
  assert.deepEqual(mixShots(a, b, 0.5), { az: 1, dist: 3, target: [0.5, 1, 1.5] });
  // Reaproveita o objeto de saída.
  const out = { target: [9, 9, 9] };
  assert.equal(mixShots(a, b, 0.5, out), out);
  assert.deepEqual(out.target, [0.5, 1, 1.5]);
});

test('presence é 1 dentro da seção, 0 longe dela, com rampas nas pontas', () => {
  assert.equal(presence(0.5, 2), 0);
  assert.equal(presence(2.5, 2), 1);
  assert.equal(presence(4.5, 2), 0);
  const rising = presence(2.05, 2);
  assert.ok(rising > 0 && rising < 1);
  const falling = presence(2.98, 2);
  assert.ok(falling > 0 && falling < 1);
  let previous = 0;
  for (let T = 1.8; T <= 2.5; T += 0.01) {
    const p = presence(T, 2);
    assert.ok(p >= previous - 1e-12);
    previous = p;
  }
});
