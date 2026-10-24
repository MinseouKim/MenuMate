import { buildApp, type AppDeps } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { testPrisma } from './helpers.js';
import { backendDir } from './setup/db-url.js';

export function testConfig(env: NodeJS.ProcessEnv = {}): Config {
  // 정적 폴더는 기본적으로 없는 경로를 가리킨다 (static.test.ts에서 따로 지정)
  return loadConfig(
    {
      MODEL_DIR: './data/__no_models__',
      FRONTEND_DIST: './data/__no_dist__',
      MENU_IMAGE_DIR: './data/__no_images__',
      PAYMENT_SIM_DELAY_MS: '0',
      ...env,
    },
    backendDir,
  );
}

export async function makeApp(overrides: Partial<AppDeps> = {}) {
  const app = await buildApp({ prisma: testPrisma, config: testConfig(), logger: false, ...overrides });
  await app.ready();
  return app;
}
