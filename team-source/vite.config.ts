/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 상대 경로로 빌드해서 전시 PC(4173)와 Vercel 등 어디에 올려도 그대로 열리게 합니다.
  base: './',
  build: {
    // index.html: 키오스크 화면, receipt.html: QR로 여는 휴대폰 영수증(키오스크 코드를 불러오지 않는 가벼운 페이지)
    rollupOptions: { input: { index: resolve(__dirname, 'index.html'), receipt: resolve(__dirname, 'receipt.html') } },
    // 얼굴 나이 추정 모델 코드(약 1.3MB)는 카메라를 켤 때만 따로 불러옵니다.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // server/ 폴더(백엔드, 자체 vitest.config.ts + 실제 DB 연동 테스트 보유)는 프론트엔드 테스트 실행 시
    // 함께 수집되지 않도록 명시적으로 제외한다. 백엔드 테스트는 `cd server && npm test`로 별도 실행한다.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['server/**', 'node_modules/**'],
  },
})
