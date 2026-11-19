# Fita de Möbius

Uma página única em que uma fita de Möbius 3D é revelada por ângulos diferentes
conforme você rola. Cada ângulo traz um card que explica uma propriedade da fita e
conta uma curiosidade. Oito paradas, mais a abertura e o encerramento.

**No ar:** https://fita-de-mobius.vercel.app e https://aivarte.github.io/fita-de-mobius/

## Ver no computador

É preciso ter o [Node.js](https://nodejs.org) instalado. Na pasta do projeto:

```
npm start
```

O comando sobe um servidor local e abre `http://localhost:5173` no navegador.
Abrir o `index.html` com duplo clique não funciona: os módulos de JavaScript só
carregam a partir de um servidor.

## Publicar

A página é servida em dois lugares, ambos a partir da raiz do branch `main`: pela
Vercel (projeto `fita-de-mobius`, ligado a este repositório) e pelo GitHub Pages.
Cada `git push` para o `main` atualiza os dois em um ou dois minutos. O
`.vercelignore` faz a Vercel receber só o site, e o `.nojekyll` diz ao GitHub
para servir os arquivos como estão.

É um site estático, sem etapa de build, então também funciona em qualquer outra
hospedagem (Netlify, Vercel, um servidor comum). Bastam estes itens:

```
index.html   css/   js/   vendor/   fonts/   assets/
```

O restante (`tools/`, `tests/`, `docs/`, `node_modules/`) serve só ao
desenvolvimento.

Se mudar de domínio, atualize no `index.html` os endereços de `canonical`,
`og:url` e `og:image`. Redes sociais não aceitam caminho relativo no cartão de
compartilhamento.

## Onde mexer

| Para mudar | Arquivo |
|---|---|
| Textos dos cards, títulos, fontes citadas | `index.html` |
| Cores, tipografia, posição dos cards | `css/styles.css` |
| Ângulo, distância e enquadramento da câmera em cada parada | `js/shots.js` |
| Material da fita e o efeito de cada parada | `js/scene/ribbon.js` |
| Luzes e reflexos | `js/scene/studio.js` |
| Níveis de qualidade | `js/scene/stage.js` |

A ordem das paradas é a ordem das `<section data-scene="...">` no `index.html`,
que precisa ser a mesma da lista `SCENES` em `js/shots.js`.

## Como funciona

- **A fita é um sólido fino com uma carta só.** A superfície é parametrizada por
  `(U, V)` com `U` de 0 a 4π: duas voltas cobrem as duas "faces" do papel, que é a
  própria ideia de um lado só. A pintura, a borda, o corte e a seta são funções
  dessas coordenadas no shader. A matemática está em `js/math/mobius.js`.
- **O scroll vira um tempo `T`.** A cada quadro a página lê a posição do scroll e
  a converte em índice da parada mais progresso dentro dela. Desse número saem a
  câmera, os efeitos e o card ativo. Está em `js/math/journey.js` e `js/main.js`.
- **A qualidade se ajusta sozinha.** GPUs dedicadas começam no nível alto (MSAA).
  GPUs integradas e celulares começam no médio (FXAA), e a página desce um nível
  se o tempo de quadro ficar ruim. O texto é HTML, então não perde nitidez.
- **Planos B.** Com "reduzir movimento" ligado no sistema, a câmera troca de
  ângulo por corte, sem voo. Sem WebGL, os cards viram uma coluna de leitura.

Parâmetros de URL úteis para testar: `?q=0`, `?q=1` ou `?q=2` fixa o nível de
qualidade, `?motion=reduce` simula o modo de menos movimento e `?still=1` congela
o tempo.

## Testes e ferramentas

```
npm test          testes da matemática da fita e da linha do tempo
npm install       instala o que as ferramentas abaixo usam (só desenvolvimento)
npm run capture   captura cada parada em desktop e celular e acusa erros no console
npm run perf      mede o tempo de quadro na GPU da máquina
npm run assets    regenera o ícone, o cartão de compartilhamento e o pôster
```

`node tools/lookdev.mjs` monta folhas de contato com várias paradas numa imagem
só. As capturas vão para `tools/out/`. As ferramentas usam o Chrome instalado na
máquina.

## Créditos

- [Three.js](https://threejs.org) 0.170.0, licença MIT, em `vendor/three/`.
- Fontes Cormorant Garamond, Geist e Geist Mono, licença SIL Open Font, em `fonts/`.
- As fontes dos fatos citados estão listadas no rodapé da página.
