import path from 'node:path';
import { resolveDatabaseUrl } from './env.js';

export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  menuSeedFile: string;
  menuImageDir: string;
  modelDir: string;
  frontendDist: string;
  paymentMode: 'simulate';
  paymentSimResult: 'success' | 'fail';
  paymentSimDelayMs: number;
  /** 리뷰 학습 엔진 결과 파일 (v2). 없으면 v1 점수 */
  engineFile: string;
}

function int(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${key} 값이 올바르지 않아요: ${raw}`);
  return n;
}

function oneOf<T extends string>(env: NodeJS.ProcessEnv, key: string, allowed: readonly T[], fallback: T): T {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new Error(`${key} 값은 ${allowed.join(' / ')} 중 하나여야 해요: ${raw}`);
  }
  return raw as T;
}

/** env-guide.md 3장의 변수와 기본값. 경로는 baseDir(backend/) 기준 절대 경로로 바꾼다. */
export function loadConfig(env: NodeJS.ProcessEnv, baseDir: string): Config {
  const dir = (key: string, fallback: string) => path.resolve(baseDir, env[key] || fallback);
  return {
    port: int(env, 'PORT', 4000),
    host: env.HOST || '127.0.0.1',
    databaseUrl: resolveDatabaseUrl(env.DATABASE_URL || 'file:./data/menumate.db', baseDir),
    menuSeedFile: dir('MENU_SEED_FILE', './seed/menu.dummy.json'),
    menuImageDir: dir('MENU_IMAGE_DIR', './data/menu-images'),
    modelDir: dir('MODEL_DIR', '../ai/models'),
    frontendDist: dir('FRONTEND_DIST', '../frontend/dist'),
    paymentMode: oneOf(env, 'PAYMENT_MODE', ['simulate'] as const, 'simulate'),
    paymentSimResult: oneOf(env, 'PAYMENT_SIM_RESULT', ['success', 'fail'] as const, 'success'),
    paymentSimDelayMs: int(env, 'PAYMENT_SIM_DELAY_MS', 1500),
    engineFile: dir('ENGINE_FILE', './engine/menu-features.json'),
  };
}
