import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

// 테스트는 .env.test의 값을 사용한다 (kiosk_test DB). vitest가 테스트 파일을 import하기 전에
// 여기서 먼저 process.env에 주입해 두면, src/config/env.ts의 dotenv/config가 이 값을 덮어쓰지 않는다
// (dotenv는 이미 설정된 process.env 값을 기본적으로 덮어쓰지 않음).
loadDotenv({ path: ".env.test" });

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 15000,
  },
});
