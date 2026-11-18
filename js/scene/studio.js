// Estúdio de luz: o ambiente refletido pela fita, o fundo e as luzes diretas.

import * as THREE from 'three';

/**
 * Gera o mapa de ambiente a partir de uma cena pequena de softboxes num quarto
 * escuro. O metal da fita não tem cor difusa: tudo o que se vê nela são reflexos
 * destes painéis, então é aqui que a "fotografia" é decidida.
 */
export function createEnvironment(renderer) {
  const room = new THREE.Scene();
  const disposables = [];

  const add = (geometry, material, position) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.lookAt(0, 0, 0);
    room.add(mesh);
    disposables.push(geometry, material);
    return mesh;
  };

  const panel = (width, height, position, color, intensity) =>
    add(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
        side: THREE.DoubleSide,
      }),
      position,
    );

  // Paredes: um degradê escuro, mais claro e frio em cima, quente e quase preto
  // embaixo. É o preenchimento que impede o metal de sumir no fundo e que dá
  // volume: o que olha para cima reflete mais do que o que olha para baixo.
  add(
    new THREE.SphereGeometry(40, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          float h = normalize(vDirection).y;
          vec3 top = vec3(0.075, 0.09, 0.125);
          vec3 mid = vec3(0.026, 0.029, 0.04);
          vec3 low = vec3(0.02, 0.014, 0.01);
          vec3 color = h > 0.0 ? mix(mid, top, smoothstep(0.0, 1.0, h)) : mix(mid, low, smoothstep(0.0, -0.8, h));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
    [0, 0, 0],
  );

  panel(11, 11, [-2.5, 8, 3.5], 0xfff2e2, 2.3); // principal, de cima, grande e levemente quente
  panel(1.2, 12, [7.5, 1.6, -3.5], 0xdbe7ff, 5.5); // contraluz fria, faixa vertical
  panel(1.0, 11, [-7.5, 0.4, -4.5], 0xffdcb8, 3.6); // contraluz quente, do outro lado
  panel(11, 6, [3, -6.5, 4], 0x9fb2d0, 0.9); // rebatedor baixo
  panel(6, 3, [0.5, 2.2, 9], 0xffffff, 1.4); // frontal suave
  panel(4, 7, [9, 0.5, 4], 0xe6ecff, 0.9); // lateral direita, fria e fraca
  panel(4, 7, [-9, 1.5, 3], 0xffeedd, 0.8); // lateral esquerda, quente e fraca
  panel(13, 0.5, [0, 5.5, -8], 0xffffff, 2.4); // linha fina ao fundo: desenha um friso no metal

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(room, 0.03).texture;
  pmrem.dispose();
  disposables.forEach((item) => item.dispose());
  return texture;
}

/** Fundo: uma esfera invertida com um degradê muito discreto em torno do horizonte. */
export function createBackdrop() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uBase: { value: new THREE.Color(0.0032, 0.0036, 0.005) },
      uHaze: { value: new THREE.Color(0.0065, 0.008, 0.013) },
      uWarm: { value: new THREE.Color(0.007, 0.0048, 0.003) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase;
      uniform vec3 uHaze;
      uniform vec3 uWarm;
      varying vec3 vDirection;
      void main() {
        vec3 d = normalize(vDirection);
        float horizon = exp(-d.y * d.y * 5.0);
        float low = smoothstep(0.1, -0.9, d.y);
        gl_FragColor = vec4(uBase + uHaze * horizon + uWarm * low, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

/** Luzes diretas: dão os brilhos finos e definidos que o ambiente borrado não dá. */
export function createLights() {
  const group = new THREE.Group();

  const key = new THREE.DirectionalLight(0xfff0dc, 1.1);
  key.position.set(-3, 7, 4);

  const rim = new THREE.DirectionalLight(0xcfe0ff, 1.4);
  rim.position.set(6, 2, -5);

  const kicker = new THREE.DirectionalLight(0xffd9b0, 0.8);
  kicker.position.set(-6, -1, -4);

  group.add(key, rim, kicker);
  return group;
}
