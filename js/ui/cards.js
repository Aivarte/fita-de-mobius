// Cards: ativa o da parada atual e desenha a linha que o liga ao ponto da fita.

const STUB = 26; // trecho reto que sai do card antes de a linha rumar para a fita
const RING = 6; // raio do anel que marca o ponto
const CLEARANCE = 22; // distância mínima entre o ponto e o card para a linha existir

export function createCards(sceneElements) {
  const cards = sceneElements.map((element) => element.querySelector('.card'));
  const leader = document.querySelector('.leader');
  const line = leader.querySelector('.leader__line');
  const ring = leader.querySelector('.leader__ring');
  const dot = leader.querySelector('.leader__dot');
  let active = -1;

  /** Sai do card pelo lado voltado para o ponto, com um trecho reto, e segue até o anel. */
  const route = (rect, x, y) => {
    let port;
    let elbow;
    if (x > rect.right + CLEARANCE) {
      const py = rect.top + Math.min(54, rect.height / 2);
      port = [rect.right, py];
      elbow = [rect.right + STUB, py];
    } else if (x < rect.left - CLEARANCE) {
      const py = rect.top + Math.min(54, rect.height / 2);
      port = [rect.left, py];
      elbow = [rect.left - STUB, py];
    } else if (y < rect.top - CLEARANCE) {
      const px = rect.left + rect.width / 2;
      port = [px, rect.top];
      elbow = [px, rect.top - STUB * 0.6];
    } else if (y > rect.bottom + CLEARANCE) {
      const px = rect.left + rect.width / 2;
      port = [px, rect.bottom];
      elbow = [px, rect.bottom + STUB * 0.6];
    } else {
      return null; // o ponto está atrás do card
    }
    const dx = x - elbow[0];
    const dy = y - elbow[1];
    const length = Math.hypot(dx, dy);
    if (length < RING * 2) return null;
    const k = (length - RING - 3) / length;
    return [port, elbow, [elbow[0] + dx * k, elbow[1] + dy * k]];
  };

  return {
    /**
     * @param {number} index seção cujo card está ativo, ou -1
     * @param {{x: number, y: number} | null} anchor ponto da fita em pixels da janela
     */
    update(index, anchor) {
      if (index !== active) {
        if (active >= 0) sceneElements[active].classList.remove('is-active');
        if (index >= 0) sceneElements[index].classList.add('is-active');
        active = index;
      }

      const card = index >= 0 ? cards[index] : null;
      const path = card && anchor ? route(card.getBoundingClientRect(), anchor.x, anchor.y) : null;
      if (!path) {
        leader.classList.remove('is-on');
        return;
      }
      line.setAttribute('points', path.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' '));
      ring.setAttribute('cx', anchor.x.toFixed(1));
      ring.setAttribute('cy', anchor.y.toFixed(1));
      dot.setAttribute('cx', anchor.x.toFixed(1));
      dot.setAttribute('cy', anchor.y.toFixed(1));
      leader.classList.add('is-on');
    },

    hasCard(index) {
      return Boolean(cards[index]);
    },
  };
}
