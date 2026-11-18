// Roteiro da jornada: um plano de câmera por seção, na ordem em que aparecem na página.
//
// Câmera em coordenadas esféricas ao redor do alvo:
//   az     azimute em graus. 0 olha a partir de +Z; os valores são cumulativos, então
//          a diferença entre dois planos vizinhos é o giro real da câmera entre eles.
//   el     elevação em graus (90 = de cima, negativo = de baixo)
//   dist   distância ao alvo, calibrada para uma tela larga
//   target ponto para onde a câmera olha
//   roll   inclinação do horizonte em graus
//   shift  deslocamento da fita no quadro, em fração da tela, para abrir espaço ao card
//          (x positivo = fita à direita, y positivo = fita para cima)
//   drift  quanto do giro lento automático vale neste plano (abertura e encerramento)

const RAD = Math.PI / 180;

const shot = ({ az, el, dist, target = [0, 0, 0], roll = 0, shift = [0, 0], drift = 0 }) => ({
  az: az * RAD,
  el: el * RAD,
  dist,
  target,
  roll: roll * RAD,
  shift,
  drift,
});

export const SCENES = [
  'abertura',
  'lado',
  'borda',
  'corte',
  'orientacao',
  'historia',
  'industria',
  'arte',
  'raiz',
  'fim',
];

export const SHOTS = [
  // Abertura: três quartos clássico, a fita à direita do título.
  shot({ az: 25, el: 24, dist: 6.3, roll: -4, shift: [0.18, 0.1], drift: 1 }),
  // Um lado só: de cima, com o eixo do giro atravessado no quadro. A fita tomba na
  // direção da câmera como uma moeda, e a face que está sendo pintada fica sempre à vista.
  shot({ az: 90, el: 58, dist: 6.6, shift: [0.2, 0] }),
  // Uma borda só: quase a pino, para ver a luz ir da beirada de fora à de dentro.
  shot({ az: 60, el: 80, dist: 6.6, shift: [-0.21, 0] }),
  // Corte ao meio: rente, de lado, encarando o trecho em que a fita fica de pé.
  shot({ az: -90, el: 8, dist: 4.3, target: [-0.35, 0, 0], roll: 3, shift: [0.12, 0.16] }),
  // Sem horário nem anti-horário: por cima do trecho deitado, onde a seta parte e chega.
  shot({ az: 70, el: 44, dist: 6.2, target: [0.1, 0, 0], shift: [-0.2, 0] }),
  // 1858: retrato pelo lado oposto ao da abertura.
  shot({ az: 205, el: 27, dist: 6.3, roll: 3, shift: [0.2, 0.02] }),
  // Do papel à fábrica: de baixo para cima, a esteira passando sobre a câmera.
  shot({ az: 140, el: -24, dist: 5.6, roll: -5, shift: [-0.15, 0.14] }),
  // Na arte: contra a luz fria, para a treliça recortar.
  shot({ az: 298, el: 18, dist: 5.7, roll: 2, shift: [0.2, 0.03] }),
  // O enigma da raiz de três: recua para caber a fita mais larga.
  shot({ az: 395, el: 34, dist: 7.4, shift: [-0.21, 0] }),
  // Encerramento: o mesmo quadro da abertura, uma volta inteira depois.
  shot({ az: 385, el: 24, dist: 6.3, roll: -4, shift: [0.18, 0.1], drift: 1 }),
];
