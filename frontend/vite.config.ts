/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { CHUNK_GROUPS } from './src/mocks/buildChunks.ts';
import { assertNoMocksInProduction } from './src/mocks/buildGuard.ts';
import { viteMockApi } from './src/mocks/viteMockApi.ts';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const BACKEND = 'http://localhost:4000';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, here('.'), 'VITE_');
  // 통합(10/26) 전에는 AI·Backend 브랜치가 없으므로 기본값은 가짜(true). 통합 후 .env 에서 false 로 바꾼다.
  const mockAi = (env.VITE_MOCK_AI ?? 'true') === 'true';
  const mockApiEnv = (env.VITE_MOCK_API ?? 'true') === 'true';
  assertNoMocksInProduction({ command, mode, mockAi, mockApi: mockApiEnv });
  const mockApi = mockApiEnv && mode !== 'test';

  return {
    plugins: [react(), mockApi && viteMockApi()],
    resolve: {
      alias: { '@menumate/ai': here(mockAi ? './src/mocks/ai.ts' : '../ai/src/index.ts') },
    },
    build: {
      // 큰 묶음 나누기 (D79): React·MediaPipe·ONNX Runtime 을 따로. AI 묶음은 대기 화면이 뜬 뒤 동적으로 불러온다
      rolldownOptions: { output: { codeSplitting: { groups: CHUNK_GROUPS } } },
    },
    server: {
      port: 5173,
      strictPort: true,
      // 가짜 API가 켜져 있으면 /api 는 개발 서버가 직접 응답한다
      proxy: { ...(mockApi ? {} : { '/api': BACKEND }), '/static': BACKEND, '/models': BACKEND },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
