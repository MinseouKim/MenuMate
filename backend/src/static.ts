import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { errorBody } from './errors.js';

/** index.html로 돌려주지 않는 경로 (api.md "정적 파일") */
const RESERVED = /^\/(api|static|models)(\/|$|\?)/;

const isDir = (p: string) => fs.existsSync(p) && fs.statSync(p).isDirectory();

/**
 * /static/menu-images/*, /models/*, 프론트 빌드(SPA fallback)를 제공한다.
 * 폴더가 없으면 그 경로는 건너뛴다 (서버는 그대로 뜬다).
 */
export async function registerStatic(app: FastifyInstance, config: Config): Promise<void> {
  const hasFrontend = isDir(config.frontendDist) && fs.existsSync(path.join(config.frontendDist, 'index.html'));

  if (hasFrontend) {
    // reply.sendFile은 이 등록에서만 데코레이트한다 (SPA fallback에 사용)
    await app.register(fastifyStatic, { root: config.frontendDist, prefix: '/', wildcard: true });
  } else {
    app.log.warn(`FRONTEND_DIST 폴더가 없어 프론트 빌드를 건너뜁니다: ${config.frontendDist}`);
  }

  if (isDir(config.menuImageDir)) {
    await app.register(fastifyStatic, { root: config.menuImageDir, prefix: '/static/menu-images/', decorateReply: false });
  } else {
    app.log.warn(`MENU_IMAGE_DIR 폴더가 없어 메뉴 사진 제공을 건너뜁니다: ${config.menuImageDir}`);
  }

  if (isDir(config.modelDir)) {
    await app.register(fastifyStatic, {
      root: config.modelDir,
      prefix: '/models/',
      decorateReply: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.wasm')) res.setHeader('content-type', 'application/wasm');
      },
    });
  } else {
    app.log.warn(`MODEL_DIR 폴더가 없어 모델 파일 제공을 건너뜁니다: ${config.modelDir}`);
  }

  app.setNotFoundHandler((req, reply) => {
    const isPageRequest = req.method === 'GET' || req.method === 'HEAD';
    if (hasFrontend && isPageRequest && !RESERVED.test(req.url)) {
      return reply.sendFile('index.html', config.frontendDist);
    }
    return reply.status(404).send(errorBody('NOT_FOUND'));
  });
}
