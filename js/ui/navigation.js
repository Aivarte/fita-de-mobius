// Navegação: índice lateral, botões que levam a uma parada e marcas de progresso.

export function createNavigation({ sceneIds, sceneElements, isReduced }) {
  const root = document.documentElement;
  const links = [...document.querySelectorAll('.rail a')];
  const indexOf = new Map(sceneIds.map((id, i) => [id, i]));
  let current = -1;
  let pastLead = null;
  let progress = -1;

  // Qualquer elemento com data-go leva ao centro da parada, onde o card está ativo.
  // A abertura e o encerramento vão para o topo e para o fim da página.
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-go]');
    if (!trigger) return;
    const index = indexOf.get(trigger.dataset.go);
    if (index === undefined) return;
    event.preventDefault();
    const element = sceneElements[index];
    const rect = element.getBoundingClientRect();
    const start = rect.top + window.scrollY;
    const isEdge = element.classList.contains('scene--edge');
    const top = isEdge ? start : start + rect.height / 2 - window.innerHeight / 2;
    window.scrollTo({ top: Math.max(0, top), behavior: isReduced() ? 'auto' : 'smooth' });
  });

  return {
    /**
     * @param {number} sceneIndex seção em que a leitura está
     * @param {number} T tempo da jornada
     */
    update(sceneIndex, T) {
      if (sceneIndex !== current) {
        current = sceneIndex;
        const id = sceneIds[sceneIndex];
        for (const link of links) {
          if (link.dataset.go === id) link.setAttribute('aria-current', 'step');
          else link.removeAttribute('aria-current');
        }
      }

      const past = T > 0.82;
      if (past !== pastLead) {
        pastLead = past;
        root.classList.toggle('past-lead', past);
      }

      const value = Math.min(1, Math.max(0, (T - 0.5) / (sceneIds.length - 1)));
      if (Math.abs(value - progress) > 0.0015) {
        progress = value;
        root.style.setProperty('--progress', value.toFixed(4));
      }
    },
  };
}
