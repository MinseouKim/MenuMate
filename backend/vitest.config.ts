import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/setup/global.ts'],
    // 테스트 파일들이 SQLite 테스트 DB 하나를 같이 쓰므로 순서대로 돌린다
    fileParallelism: false,
    env: { TZ: 'Asia/Seoul' },
  },
});
