#!/usr/bin/env node
// Gera as imagens estáticas da página a partir da própria cena 3D:
//
//   assets/og.jpg       cartão de compartilhamento (1200x630), a abertura como ela aparece
//   assets/poster.jpg   a fita sozinha, usada de fundo quando não há WebGL
//   assets/icon.png     ícone da aba
//
//   node tools/assets.mjs

import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer, listen } from './serve.mjs';

const outDir = resolve(fileURLToPath(new URL('..', import.meta.url)), 'assets');
await mkdir(outDir, { recursive: true });

const server = createStaticServer();
const port = await listen(server, 0);
const url = `http://127.0.0.1:${port}/?q=0&still=1`;
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
});

const HIDE_INTERFACE = 'main, .mast, .rail, .progress, .leader { visibility: hidden !important; }';

async function open(width, height, { clean = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__mobius?.ready, null, { timeout: 60000 });
  if (clean) await page.addStyleTag({ content: HIDE_INTERFACE });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__mobius.settle());
  // Espera a entrada do título e o fade do palco terminarem.
  await page.waitForTimeout(2200);
  return { context, page };
}

try {
  {
    const { context, page } = await open(1200, 630);
    // Num cartão de compartilhamento o botão não faz sentido.
    await page.addStyleTag({ content: '.button { visibility: hidden !important; }' });
    await page.screenshot({ path: resolve(outDir, 'og.jpg'), type: 'jpeg', quality: 88 });
    await context.close();
    console.log('assets/og.jpg');
  }

  {
    const { context, page } = await open(1600, 1000, { clean: true });
    await page.screenshot({ path: resolve(outDir, 'poster.jpg'), type: 'jpeg', quality: 84 });
    await context.close();
    console.log('assets/poster.jpg');
  }

  {
    // Numa tela quadrada e estreita a fita fica centrada na largura. Recorta um
    // quadrado em volta dela e reduz para o tamanho do ícone.
    const { context, page } = await open(800, 800, { clean: true });
    const crop = await page.screenshot({ type: 'png', clip: { x: 130, y: 10, width: 540, height: 540 } });
    const icon = await context.newPage();
    await icon.setViewportSize({ width: 256, height: 256 });
    await icon.setContent(
      `<body style="margin:0;background:transparent"><img src="data:image/png;base64,${crop.toString('base64')}"
        style="display:block;width:256px;height:256px;border-radius:56px"></body>`,
    );
    await writeFile(resolve(outDir, 'icon.png'), await icon.screenshot({ type: 'png', omitBackground: true }));
    await context.close();
    console.log('assets/icon.png');
  }
} finally {
  await browser.close();
  server.close();
}
