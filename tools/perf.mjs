#!/usr/bin/env node
// Mede o tempo médio de quadro em algumas paradas, na GPU desta máquina.
//
//   node tools/perf.mjs                    tamanhos padrão, qualidade automática
//   node tools/perf.mjs --query "q=0"      força um nível de qualidade (0 alta, 1 média, 2 baixa)
//   node tools/perf.mjs --sizes 1366x768,1920x1080

import { chromium } from 'playwright-core';
import { createStaticServer, listen } from './serve.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const sizes = flag('sizes', '1366x768,1920x1080').split(',').map((s) => s.split('x').map(Number));
const scenes = flag('scenes', 'abertura,lado,historia,arte').split(',');
const query = flag('query', '');
// Sem vsync o navegador não trava em 60 qps, e o tempo medido é o custo real do quadro.
const uncapped = args.includes('--uncapped');

const server = createStaticServer();
const port = await listen(server, 0);
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--hide-scrollbars',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--use-angle=d3d11',
    ...(uncapped ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
  ],
});

try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const started = Date.now();
    await page.goto(`http://127.0.0.1:${port}/${query ? `?${query}` : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__mobius?.ready, null, { timeout: 60000 });
    const boot = Date.now() - started;
    const results = [];
    for (const scene of scenes) {
      await page.evaluate((id) => {
        const el = document.querySelector(`[data-scene="${id}"]`);
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, top + el.offsetHeight / 2 - window.innerHeight / 2), behavior: 'instant' });
      }, scene);
      await page.waitForTimeout(1200);
      const ms = await page.evaluate(
        () =>
          new Promise((done) => {
            let frames = 0;
            let first = 0;
            const tick = (now) => {
              if (!first) first = now;
              if (++frames > 120) done((now - first) / 120);
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
      );
      results.push(`${scene} ${ms.toFixed(1)} ms (${Math.round(1000 / ms)} qps)`);
    }
    const info = await page.evaluate(() => `${window.__mobius.quality} | ${window.__mobius.renderer}`);
    console.log(`${width}x${height}  partida ${boot} ms  qualidade ${info}`);
    for (const line of results) console.log(`  ${line}`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
