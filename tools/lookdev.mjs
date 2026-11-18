#!/usr/bin/env node
// Folha de contato: renderiza a mesma cena com parâmetros diferentes na URL e junta
// tudo numa imagem só, para comparar variações de visual lado a lado.
//
//   node tools/lookdev.mjs --scene abertura --tag filme "film=120,200" "film=150,230&ior=2.2"
//
// Opções: --scene id, --at progresso local (0 a 1), --cols colunas, --size LxA, --tag nome.
// A imagem vai para tools/out/sheet-<tag>.png.

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer, listen } from './serve.mjs';

const args = process.argv.slice(2);
const options = { scene: 'abertura', at: '0.5', cols: '2', size: '720x450', tag: 'look', base: 'q=0&still=1' };
const variants = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) options[args[i].slice(2)] = args[++i];
  else variants.push(args[i]);
}
if (!variants.length) variants.push('');

// Um quadro por combinação de cena e variação. Cenas: "id" ou "id@progresso".
const tiles = [];
for (const spec of (options.scenes ?? `${options.scene}@${options.at}`).split(',')) {
  const [scene, at = options.at] = spec.split('@');
  for (const variant of variants) tiles.push({ scene, at: Number(at), variant });
}

const [width, height] = options.size.split('x').map(Number);
const outDir = resolve(fileURLToPath(new URL('.', import.meta.url)), 'out');
await mkdir(outDir, { recursive: true });

const server = createStaticServer();
const port = await listen(server, 0);
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
});

try {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const shots = [];
  for (const { scene, at, variant } of tiles) {
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    page.on('pageerror', (error) => errors.push(error.message));
    const query = [options.base, variant].filter(Boolean).join('&');
    await page.goto(`http://127.0.0.1:${port}/?${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__mobius?.ready, null, { timeout: 45000 });
    await page.evaluate(
      ([id, local]) => {
        const el = document.querySelector(`[data-scene="${id}"]`);
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, top + el.offsetHeight * local - window.innerHeight / 2), behavior: 'instant' });
      },
      [scene, at],
    );
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.evaluate(() => window.__mobius.settle());
    await page.waitForTimeout(Number(options.wait ?? 1300));
    await page.evaluate(() => window.__mobius.settle());
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const png = await page.screenshot({ type: 'png' });
    const label = [`${scene}@${at}`, variant].filter(Boolean).join('  ');
    shots.push({ label, data: png.toString('base64'), errors });
    if (errors.length) console.error(`[${label}]`, errors.slice(0, 3).join(' | '));
    await page.close();
  }

  const cols = Number(options.cols);
  const sheet = await context.newPage();
  await sheet.setViewportSize({ width: width * cols, height: 100 });
  await sheet.setContent(`<!doctype html><body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${width}px)">
    ${shots
      .map(
        (shot) => `<figure style="margin:0;position:relative">
          <img src="data:image/png;base64,${shot.data}" style="display:block;width:${width}px;height:${height}px">
          <figcaption style="position:absolute;left:8px;top:8px;padding:3px 8px;background:#000c;color:#fff;font:12px/1.4 monospace">${shot.label}</figcaption>
        </figure>`,
      )
      .join('')}
  </body>`);
  const file = resolve(outDir, `sheet-${options.tag}.png`);
  await sheet.screenshot({ path: file, fullPage: true });
  console.log(file);
} finally {
  await browser.close();
  server.close();
}
