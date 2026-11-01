/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { CHUNK_GROUPS } from './src/mocks/buildChunks.ts';
import { assertNoMocksInProduction } from './src/mocks/buildGuard.ts';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const BACKEND = 'http://localhost:4000';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, here('.'), 'VITE_');
  // VITE_MOCK_AI=true 이면 가짜 AI(단축키 판정만). 전시 빌드에서는 막힌다
  const mockAi = (env.VITE_MOCK_AI ?? 'false') === 'true';
  assertNoMocksInProduction({ command, mode, mockAi, mockApi: false });

  return {
    plugins: [react()],
    // 상대 경로로 빌드해서 전시 PC와 어디에 올려도 그대로 열리게 한다 (menumate_DL 방식)
    base: './',
    resolve: {
      alias: { '@menumate/ai': here(mockAi ? './src/mocks/ai.ts' : '../ai/src/index.ts') },
    },
    build: {
      // index.html: 키오스크 화면, receipt.html: QR로 여는 휴대폰 영수증(키오스크 코드를 불러오지 않는 가벼운 페이지)
      rolldownOptions: {
        input: { index: here('./index.html'), receipt: here('./receipt.html') },
        // 큰 묶음 나누기 (D79): React·MediaPipe·ONNX Runtime 을 따로. AI 묶음은 나이 판정을 시작할 때 동적으로 불러온다
        output: { codeSplitting: { groups: CHUNK_GROUPS } },
      },
      chunkSizeWarningLimit: 1500,
    },
    server: {
      port: 3000,
      strictPort: true,
      // AI 모델 파일과 메뉴 사진은 Backend 가 로컬 파일로 제공한다
      proxy: { '/api': BACKEND, '/static': BACKEND, '/models': BACKEND },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
