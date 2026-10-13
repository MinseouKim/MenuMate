/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
