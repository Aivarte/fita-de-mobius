# Fita de Möbius: página-experiência guiada por scroll

- **Data:** 2026-11-18
- **Status:** desenho aprovado em conversa; construção autorizada em seguida ("pode fazer")

## Objetivo

Uma página única, no formato de um hero de site, em que uma fita de Möbius 3D
animada é revelada por ângulos diferentes conforme a pessoa rola a página. Cada
ângulo traz um card que explica uma propriedade da fita e conta uma curiosidade.

É uma peça autoral de portfólio. O impacto visual vem em primeiro lugar, sem
abrir mão de textos corretos. Sucesso é a pessoa rolar até o fim porque a
experiência é fluida e bonita, e sair sabendo algo novo sobre a fita.

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Propósito | Peça autoral / portfólio |
| Clima visual | Cinematográfico escuro |
| Construção | Site estático sem build, Three.js em versão fixa dentro da pasta |
| Idioma | Português do Brasil |
| Tamanho | Abertura, oito paradas e encerramento |
| Assinatura | Link discreto no rodapé para `https://github.com/Aivarte` |

## Experiência

A fita fica fixa em tela cheia e o conteúdo rola por cima. O scroll move uma
linha do tempo contínua, sem travar em seções. Em cada parada a câmera encontra
um ângulo novo, a própria fita demonstra a ideia e um card salta na tela, ligado
por uma linha fina ao ponto da fita de que ele fala.

| Parada | Ângulo e demonstração na fita | Curiosidade |
|---|---|---|
| Abertura | Três quartos, girando devagar | |
| Um lado só | A fita gira na mão enquanto o scroll a "pinta" inteira, sem cruzar a borda | Duas voltas para retornar ao ponto de partida |
| Uma borda só | De cima: uma luz percorre a borda num traço único, de fora para dentro e de volta | Um anel comum tem duas bordas |
| Corte ao meio | De lado: a fita se abre pelo centro e continua uma peça só | Cortando a um terço saem duas peças entrelaçadas |
| Sem horário nem anti-horário | Uma seta circular dá a volta e retorna espelhada | Duas fitas coladas pela borda formam a garrafa de Klein |
| 1858, duas vezes | Retrato frontal: a superfície vira mosaico | Listing e Möbius; mosaico romano do século III |
| Do papel à fábrica | De baixo: setas correm como numa esteira | Patente de 1957; símbolo da reciclagem |
| Na arte | Contraluz: a fita vira treliça e nove formigas caminham | Escher, Lygia Clark, logotipo do IMPA |
| O enigma da raiz de três | A fita alarga | Conjectura de 1977 provada em 2023; seis cores |
| Encerramento | Volta ao enquadramento inicial | "Você voltou ao início. Só que do outro lado." |

Comportamentos:

- **Cards:** no desktop a posição varia conforme a composição de cada ângulo
  (esquerda, direita, cantos inferiores), com a fita no espaço oposto. No celular
  o card encaixa na base e a fita fica em cima.
- **Navegação:** índice lateral clicável com o nome de cada parada. A abertura
  tem um botão que inicia a jornada e o encerramento tem um que volta ao topo.
- **Menos movimento:** com `prefers-reduced-motion`, a câmera troca de ângulo
  por corte com fade, sem voo, giro automático nem balanço.
- **Sem WebGL:** a página continua legível, com os cards empilhados sobre um
  fundo estático.

## Direção visual

- **Tema único escuro.** Fundo quase preto (nunca `#000`), gradiente muito
  sutil, grão fino e vinheta em camadas fixas.
- **Fita:** sólido fino de bordas arredondadas, metal iridescente (película
  fina) iluminado por softboxes de estúdio, com bloom suave.
- **Cor:** interface monocromática em branco quente, com um único acento âmbar
  usado na página inteira. A cor fica por conta da fita.
- **Tipografia:** Cormorant Garamond nos títulos (o contraste e o itálico
  caligráfico remetem aos tratados de matemática do século XIX), Geist no texto
  e Geist Mono em legendas pontuais. Fontes hospedadas na própria pasta.
- **Cards:** vidro escuro fosco com borda interna de 1px. Entram com um pop
  curto (escala, desfoque e deslocamento) e saem do mesmo jeito.
- **Formas:** cards com raio de 20px, botões em pílula.
- **Texto:** sem travessões, sem numeração decorativa de seções, sem avisos de
  "role a página".

## Arquitetura

Site estático servido como arquivos simples.

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Todo o conteúdo e a estrutura das paradas |
| `css/styles.css` | Tokens, layout, cards, índice, estados |
| `js/math/mobius.js` | Matemática pura da fita: parametrização, cartas contínuas de 4π, normais |
| `js/math/journey.js` | Matemática pura da linha do tempo: progresso, interpolação de planos, amortecimento |
| `js/shots.js` | Dados dos planos de câmera e efeitos de cada parada |
| `js/scene/*` | Palco (renderizador, pós-processamento), geometria, material com efeitos, estúdio de luz, extras (viajante, formigas, seta) |
| `js/ui/*` | Cards e linhas de ligação, índice lateral, botões |
| `js/main.js` | Inicialização, laço de animação, qualidade adaptativa |
| `vendor/three/` | Three.js 0.170.0 e os addons de pós-processamento |
| `fonts/` | Arquivos woff2 |
| `tools/` | Servidor local sem dependências e captura de telas |

Pontos de projeto:

- **Uma carta contínua de 4π.** A fita é um sólido fino. Sua superfície é
  parametrizada por `(U, V)` com `U` de 0 a 4π: duas voltas cobrem as duas
  "faces" do papel, o que é a própria ideia de um lado só. Pintura, borda,
  corte e seta são funções dessas coordenadas no shader.
- **Scroll lido no laço de animação.** Nenhum listener de scroll. A posição é
  lida uma vez por quadro e convertida em um tempo `T` (índice da parada mais
  progresso local), de onde saem câmera, efeitos e card ativo.
- **Planos interpolados com pausas.** A câmera assenta no centro de cada parada
  e viaja entre elas, com amortecimento por cima.
- **Qualidade adaptativa.** Resolução, antisserrilhamento e bloom se ajustam ao
  aparelho e ao tempo de quadro medido.

## Testes e verificação

- Testes automáticos (`node --test`, sem dependências) de `mobius.js` e
  `journey.js`: fechamento da meia-torção, continuidade das cartas, normais
  conferidas por diferenças finitas, interpolação exata nos pontos-chave.
- Capturas de tela em Chrome headless de cada parada, em desktop e em celular,
  conferidas uma a uma.
- Console sem erros durante a jornada completa.
- Datas e nomes dos textos conferidos em fontes, listadas no rodapé.

## Fora do escopo

Som, modo claro, outros idiomas, analytics, CMS e qualquer backend.

## Ordem de construção

1. Estrutura do projeto, servidor local, Three.js e fontes na pasta.
2. Matemática da fita e da linha do tempo, com testes primeiro.
3. Palco, geometria, estúdio de luz e material base até a abertura ficar boa.
4. Conteúdo, layout, cards e índice.
5. Ligação do scroll com câmera, cards e linhas.
6. Efeitos de cada parada.
7. Celular, menos movimento, sem WebGL, verificação final.
