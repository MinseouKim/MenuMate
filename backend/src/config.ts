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
  /** 허용할 브라우저 출처 (쉼표 구분). 비우면 모든 출처 허용 (개발용) */
  corsOrigins: string[] | true;
  /** 대화형 추천 (Gemini). 키가 없으면 /api/chat은 503 */
  geminiApiKey: string | null;
  geminiModel: string;
  /** Google Cloud Text-to-Speech. 키가 없으면 /api/tts는 503 */
  googleTtsApiKey: string | null;
  ttsVoice: string;
  /** 매장 좌표 (Open-Meteo 날씨). 기본은 우루루 평촌본점 근처 */
  weatherLat: number;
  weatherLon: number;
  /** 혼잡도 계산에 볼 최근 결제 완료 주문 시간 창 (분) */
  crowdWindowMin: number;
  /** 대화·추천이 읽는 우루루 메뉴 데이터 폴더 (menus.json, review/menu_reviews.json) */
  menuDataDir: string;
}

function num(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${key} 값이 올바르지 않아요: ${raw}`);
  return n;
}

const secret = (env: NodeJS.ProcessEnv, key: string): string | null => (env[key] && env[key]!.trim()) || null;

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
    menuImageDir: dir('MENU_IMAGE_DIR', './seed/menu-images'),
    modelDir: dir('MODEL_DIR', '../ai/models'),
    frontendDist: dir('FRONTEND_DIST', '../frontend/dist'),
    paymentMode: oneOf(env, 'PAYMENT_MODE', ['simulate'] as const, 'simulate'),
    paymentSimResult: oneOf(env, 'PAYMENT_SIM_RESULT', ['success', 'fail'] as const, 'success'),
    paymentSimDelayMs: int(env, 'PAYMENT_SIM_DELAY_MS', 1500),
    engineFile: dir('ENGINE_FILE', './engine/menu-features.json'),
    corsOrigins: env.CORS_ORIGIN?.trim()
      ? env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
      : true,
    geminiApiKey: secret(env, 'GEMINI_API_KEY'),
    // 키오스크는 응답 속도가 중요해 기본은 가장 빠른 모델. 품질을 올리려면 GEMINI_MODEL=gemini-3.8-flash
    geminiModel: env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
    googleTtsApiKey: secret(env, 'GOOGLE_TTS_API_KEY'),
    ttsVoice: env.TTS_VOICE?.trim() || 'ko-KR-Chirp3-HD-Leda',
    weatherLat: num(env, 'WEATHER_LAT', 37.3943),
    weatherLon: num(env, 'WEATHER_LON', 126.9568),
    crowdWindowMin: int(env, 'CONTEXT_CROWD_WINDOW_MIN', 15),
    menuDataDir: dir('MENU_DATA_DIR', '../frontend/src/prototype/menu'),
  };
}
