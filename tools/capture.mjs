#!/usr/bin/env node
// Captura telas da jornada em Chrome headless e reporta erros do console.
//
//   node tools/capture.mjs                         todas as paradas, desktop e celular
//   node tools/capture.mjs --only desktop          só um tamanho de tela
//   node tools/capture.mjs --scenes lado,borda     só algumas paradas
//   node tools/capture.mjs --at 0.3,0.7            pontos do progresso local de cada parada
//   node tools/capture.mjs --query "motion=reduce" parâmetros extras na URL
//   node tools/capture.mjs --tag antes             prefixo no nome dos arquivos
//
// As imagens vão para tools/out/. Sai com código 1 se houver erro no console.

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer, listen } from './serve.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const only = flag('only');
const sceneFilter = flag('scenes')?.split(',');
const points = (flag('at', '0.5')).split(',').map(Number);
const query = flag('query', '');
const tag = flag('tag', '');
const outDir = resolve(fileURLToPath(new URL('.', import.meta.url)), flag('out', 'out'));
const reducedMotion = query.includes('motion=reduce') ? 'reduce' : 'no-preference';

// Tenta a GPU da máquina e, se o WebGL não subir, cai para o renderizador por software.
const GL_MODES = [
  ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
  ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
];

await mkdir(outDir, { recursive: true });
const server = createStaticServer();
const port = await listen(server, 0);
const base = `http://127.0.0.1:${port}/${query ? `?${query}` : ''}`;
const problems = [];
let browser;

async function launch(glArgs) {
  return chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', ...glArgs],
  });
}

async function openPage(name) {
  const context = await browser.newContext({ ...VIEWPORTS[name], reducedMotion });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`[${name}] console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`[${name}] erro: ${error.message}`));
  page.on('requestfailed', (request) => problems.push(`[${name}] falhou: ${request.url()}`));
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`[${name}] ${response.status()}: ${response.url()}`);
  });
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__mobius?.ready || document.documentElement.classList.contains('no-webgl'), null, {
    timeout: 45000,
  });
  return { context, page };
}

try {
  let mode = 0;
  browser = await launch(GL_MODES[mode]);
  {
    const probe = await openPage('desktop');
    const hasWebgl = await probe.page.evaluate(() => !document.documentElement.classList.contains('no-webgl'));
    await probe.context.close();
    if (!hasWebgl) {
      await browser.close();
      problems.length = 0;
      mode = 1;
      browser = await launch(GL_MODES[mode]);
    }
  }

  for (const name of Object.keys(VIEWPORTS)) {
    if (only && only !== name) continue;
    const { context, page } = await openPage(name);
    const info = await page.evaluate(() => ({
      gl: window.__mobius?.renderer ?? 'sem WebGL',
      scenes: [...document.querySelectorAll('[data-scene]')].map((el) => el.dataset.scene),
    }));
    console.log(`${name}: ${info.gl}`);

    let index = 0;
    for (const scene of info.scenes) {
      index += 1;
      if (sceneFilter && !sceneFilter.includes(scene)) continue;
      for (const point of points) {
        await page.evaluate(
          ([id, local]) => {
            const el = document.querySelector(`[data-scene="${id}"]`);
            const top = el.getBoundingClientRect().top + window.scrollY;
            const y = top + el.offsetHeight * local - window.innerHeight / 2;
            window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
          },
          [scene, point],
        );
        // Deixa a página ler o scroll, assenta a câmera e espera as transições dos cards.
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        await page.evaluate(() => window.__mobius?.settle?.());
        await page.waitForTimeout(900);
        await page.evaluate(() => window.__mobius?.settle?.());
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        const suffix = points.length > 1 ? `-${String(Math.round(point * 100)).padStart(3, '0')}` : '';
        const file = `${tag ? `${tag}-` : ''}${name}-${String(index).padStart(2, '0')}-${scene}${suffix}.png`;
        await page.screenshot({ path: resolve(outDir, file) });
        console.log(`  ${file}`);
      }
    }
    await context.close();
  }
} finally {
  await browser?.close();
  server.close();
}

if (problems.length) {
  console.error(`\n${problems.length} problema(s):`);
  for (const line of [...new Set(problems)]) console.error(`  ${line}`);
  process.exit(1);
}
console.log('\nSem erros no console.');
