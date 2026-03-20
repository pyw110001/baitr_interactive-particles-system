/**
 * Windows 桌面一体化入口：HTTP 静态站（Vite 产物 exe-public）+ 粒子同步 WS（8081）
 * 由 esbuild 打 bundle 为 desktop.cjs，再由 pkg 封装为 .exe
 */
import http from 'node:http';
import path from 'node:path';

import express from 'express';
import { WebSocketServer } from 'ws';

import { attachParticleSyncRelay } from './particle-sync-relay.ts';

/** esbuild CJS bundle  closure 内会注入正确的 __dirname（勿用 import.meta.url，pkg 下会失效） */
declare const __dirname: string;
const PROJECT_ROOT = __dirname;

const HTTP_PORT = Number(process.env.HTTP_PORT || 3000);
const SYNC_PORT = Number(process.env.SYNC_PORT || 8081);
const STATIC_DIR = path.join(PROJECT_ROOT, 'exe-public');

function main() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.static(STATIC_DIR));

  // SPA：无对应静态文件时回退 index.html（需在 express.static 之后）
  app.get('*', (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });

  const server = http.createServer(app);

  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`[desktop] HTTP  http://0.0.0.0:${HTTP_PORT}/`);
    console.log(`[desktop] 静态目录 ${STATIC_DIR}`);
  });

  const syncWss = new WebSocketServer({ host: '0.0.0.0', port: SYNC_PORT });
  syncWss.on('connection', (ws) => {
    attachParticleSyncRelay(ws);
  });
  console.log(`[desktop] Sync  ws://0.0.0.0:${SYNC_PORT}/`);

  const shutdown = () => {
    console.log('\n[desktop] 正在退出…');
    try {
      syncWss.close();
    } catch {
      // ignore
    }
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
