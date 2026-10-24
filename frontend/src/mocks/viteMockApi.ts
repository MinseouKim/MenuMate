// VITE_MOCK_API=true 일 때 Vite 개발 서버의 /api/* 를 가짜 Backend로 응답한다 (vite.config.ts).
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { createMockBackend } from './mockBackend.ts';

const readJson = (req: IncomingMessage) => new Promise<unknown>(resolve => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : null); } catch { resolve(null); } });
});

export function viteMockApi(): Plugin {
  const backend = createMockBackend();
  return {
    name: 'menumate-mock-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const path = new URL(req.url, 'http://localhost').pathname;
        const { status, body } = await backend.handle(req.method ?? 'GET', path, await readJson(req));
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(body));
      });
    },
  };
}
