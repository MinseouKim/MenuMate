import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, testConfig } from './app-helpers.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menumate-static-'));
const dirs = { models: path.join(tmp, 'models'), images: path.join(tmp, 'images'), dist: path.join(tmp, 'dist') };
function put(file: string, body: string | Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}
put(path.join(dirs.models, 'ort-wasm', 'ort-wasm-simd.wasm'), Buffer.from([0, 97, 115, 109]));
put(path.join(dirs.models, 'face', 'blaze_face_short_range.tflite'), 'tflite');
put(path.join(dirs.images, 'm001.jpg'), 'jpg');
put(path.join(dirs.dist, 'index.html'), '<!doctype html><title>MenuMate</title>');
put(path.join(dirs.dist, 'assets', 'app.js'), 'console.log(1)');

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp({
    config: testConfig({ MODEL_DIR: dirs.models, MENU_IMAGE_DIR: dirs.images, FRONTEND_DIST: dirs.dist }),
  });
});
afterAll(async () => {
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const expectNotFound = (r: { statusCode: number; json: () => any }) => {
  expect(r.statusCode).toBe(404);
  expect(r.json()).toEqual({ error: { code: 'NOT_FOUND', message: '잠시 문제가 생겼어요. 직원을 불러 주세요.' } });
};

describe('/models/*', () => {
  it('.wasm은 application/wasm으로 보낸다', async () => {
    const r = await app.inject('/models/ort-wasm/ort-wasm-simd.wasm');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/wasm');
  });

  it('모델 파일을 보낸다', async () => {
    const r = await app.inject('/models/face/blaze_face_short_range.tflite');
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe('tflite');
  });

  it('없는 파일은 JSON 404', async () => {
    expectNotFound(await app.inject('/models/age/none.onnx'));
  });
});

describe('/static/menu-images/*', () => {
  it('메뉴 사진을 보낸다', async () => {
    const r = await app.inject('/static/menu-images/m001.jpg');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('image/jpeg');
  });

  it('없는 사진과 폴더 밖 경로는 JSON 404', async () => {
    expectNotFound(await app.inject('/static/menu-images/none.jpg'));
    expectNotFound(await app.inject('/static/menu-images/..%2f..%2fdist%2findex.html'));
  });
});

describe('프론트 빌드 (FRONTEND_DIST)', () => {
  it('/ 는 index.html', async () => {
    const r = await app.inject('/');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/html/);
    expect(r.body).toContain('MenuMate');
  });

  it('빌드 파일을 보낸다', async () => {
    const r = await app.inject('/assets/app.js');
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe('console.log(1)');
  });

  it('프론트 라우트는 index.html로 돌려준다', async () => {
    const r = await app.inject('/order/done');
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('MenuMate');
  });

  it('/api, /static, /models 아래 없는 경로는 index.html이 아니라 JSON 404', async () => {
    expectNotFound(await app.inject('/api/nope'));
    expectNotFound(await app.inject({ method: 'POST', url: '/api/nope', payload: {} }));
    expectNotFound(await app.inject('/static/other.txt'));
    expectNotFound(await app.inject('/models'));
  });

  it('GET이 아닌 요청은 index.html로 돌려주지 않는다', async () => {
    expectNotFound(await app.inject({ method: 'POST', url: '/order/done', payload: {} }));
  });

  it('API는 그대로 동작한다', async () => {
    expect((await app.inject('/api/health')).json()).toEqual({ ok: true });
  });
});

describe('프론트 빌드 없이 사진·모델 폴더만 있을 때 (개발 중 기본 상태)', () => {
  it('사진과 모델 파일을 그대로 보낸다', async () => {
    const noFront = await makeApp({ config: testConfig({ MODEL_DIR: dirs.models, MENU_IMAGE_DIR: dirs.images }) });
    const img = await noFront.inject('/static/menu-images/m001.jpg');
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    const wasm = await noFront.inject('/models/ort-wasm/ort-wasm-simd.wasm');
    expect(wasm.statusCode).toBe(200);
    expect(wasm.headers['content-type']).toBe('application/wasm');
    await noFront.close();
  });
});

describe('폴더가 없을 때', () => {
  it('서버는 뜨고, 정적 경로는 JSON 404', async () => {
    const bare = await makeApp(); // testConfig 기본값은 없는 폴더를 가리킨다
    expectNotFound(await bare.inject('/'));
    expectNotFound(await bare.inject('/models/x.wasm'));
    expectNotFound(await bare.inject('/static/menu-images/m001.jpg'));
    expect((await bare.inject('/api/health')).statusCode).toBe(200);
    await bare.close();
  });
});
