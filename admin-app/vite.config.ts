import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 점주 관리자 화면 전용 앱 — 키오스크(team-source) 프론트와는 완전히 분리된 별도 Vite 프로젝트다.
// 점주는 터치스크린이 아니라 PC/태블릿 브라우저로 접속하는 것을 가정한다.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
});
