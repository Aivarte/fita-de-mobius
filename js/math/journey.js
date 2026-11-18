// Matemática pura da jornada guiada pelo scroll. Sem dependências.
//
// A página é uma pilha de seções. A posição de leitura (o centro da janela) vira um
// tempo T = índice da seção + progresso dentro dela. De T saem a câmera, os efeitos e
// o card ativo.

export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

export const lerp = (a, b, t) => a + (b - a) * t;

/** Posição de x dentro do intervalo [a, b], limitada a [0, 1]. */
export const span = (x, a, b) => clamp((x - a) / (b - a));

export const smoothstep = (a, b, x) => {
  const t = span(x, a, b);
  return t * t * (3 - 2 * t);
};

export const smootherstep = (a, b, x) => {
  const t = span(x, a, b);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/**
 * Amortecimento exponencial: aproxima `current` de `target` sem passar dele.
 * O resultado não depende da taxa de quadros: dois passos de dt/2 valem um de dt.
 */
export function damp(current, target, lambda, dt) {
  return current + (target - current) * -Math.expm1(-lambda * dt);
}

/**
 * Converte uma posição vertical em tempo da jornada.
 * `sections` é a lista ordenada de { top, height } em pixels.
 */
export function timelineAt(sections, y) {
  const count = sections.length;
  if (count === 0) return 0;
  if (y <= sections[0].top) return 0;
  for (let i = 0; i < count; i++) {
    const { top, height } = sections[i];
    if (y < top + height) return i + (y - top) / height;
  }
  return count;
}

/**
 * Qual par de planos está em jogo no tempo T e quanto do segundo já entrou.
 * Cada plano é a pose do centro da sua seção (T = i + 0.5). `hold` é a fração do
 * percurso entre dois centros em que a câmera fica assentada, metade em cada ponta.
 */
export function shotBlend(T, count, hold = 0.5) {
  const last = count - 1;
  if (count <= 1 || T <= 0.5) return { from: 0, to: 0, t: 0 };
  if (T >= last + 0.5) return { from: last, to: last, t: 0 };
  const x = T - 0.5;
  const from = Math.min(Math.floor(x), last - 1);
  const s = x - from;
  return { from, to: from + 1, t: smootherstep(hold / 2, 1 - hold / 2, s) };
}

/**
 * Interpola dois planos campo a campo. Números e vetores numéricos são misturados;
 * qualquer outro tipo de campo é ignorado. Reaproveita `out` quando fornecido.
 */
export function mixShots(a, b, t, out = {}) {
  for (const key of Object.keys(a)) {
    const va = a[key];
    const vb = b[key];
    if (typeof va === 'number') {
      out[key] = lerp(va, vb, t);
    } else if (Array.isArray(va)) {
      const target = Array.isArray(out[key]) ? out[key] : (out[key] = []);
      target.length = va.length;
      for (let i = 0; i < va.length; i++) target[i] = lerp(va[i], vb[i], t);
    }
  }
  return out;
}

/**
 * Peso de um efeito ligado à seção `index`: sobe no começo da seção, fica em 1 e
 * desce antes do fim, de modo que dois efeitos vizinhos nunca se sobreponham.
 */
export function presence(T, index, { rise = 0.18, fall = 0.18 } = {}) {
  const local = T - index;
  return smoothstep(0, rise, local) * (1 - smoothstep(1 - fall, 1, local));
}
