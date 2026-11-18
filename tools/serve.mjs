#!/usr/bin/env node
// Servidor estático mínimo, sem dependências, para ver a página no computador.
//
//   node tools/serve.mjs            serve em http://localhost:5173
//   node tools/serve.mjs --open     também abre o navegador
//   node tools/serve.mjs --port 8080

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exec } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function createStaticServer(root = ROOT) {
  return createServer(async (req, res) => {
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = normalize(join(root, pathname));
      const inside = file === root || file.startsWith(root + sep);
      const hidden = pathname.split('/').some((part) => part.startsWith('.'));
      if (!inside || hidden) return send(403, 'Acesso negado');
      const info = await stat(file);
      if (info.isDirectory()) {
        res.writeHead(301, { Location: `${pathname}/` });
        return res.end();
      }
      send(200, await readFile(file), TYPES[extname(file).toLowerCase()] || 'application/octet-stream');
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') send(404, 'Não encontrado');
      else send(500, 'Erro interno');
    }
  });
}

/** Sobe o servidor na primeira porta livre a partir de `port`. Porta 0 pede uma qualquer. */
export function listen(server, port, attempts = 20) {
  return new Promise((resolvePort, reject) => {
    const tryPort = (candidate, left) => {
      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE' && left > 0 && candidate !== 0) tryPort(candidate + 1, left - 1);
        else reject(error);
      });
      server.listen(candidate, '127.0.0.1', () => resolvePort(server.address().port));
    };
    tryPort(port, attempts);
  });
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runDirectly) {
  const args = process.argv.slice(2);
  const portFlag = args.indexOf('--port');
  const wanted = Number(portFlag >= 0 ? args[portFlag + 1] : process.env.PORT) || 5173;
  const port = await listen(createStaticServer(), wanted);
  const url = `http://localhost:${port}/`;
  console.log(`Fita de Möbius em ${url}  (Ctrl+C para encerrar)`);
  if (args.includes('--open')) {
    const opener =
      process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(opener);
  }
}
