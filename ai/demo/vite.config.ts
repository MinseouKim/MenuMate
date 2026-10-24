// AI 모듈 단독 확인용 데모 서버. `npm run demo -w ai` → http://localhost:5175/demo/
// ai/ 폴더를 루트로 두어 /models/* 를 Backend 없이 바로 제공한다.
// DEMO_ISOLATE=1 이면 COOP/COEP 헤더를 붙여 ONNX WASM 멀티스레드를 켠다 (속도 비교용).
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const isolate = process.env.DEMO_ISOLATE === '1';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: {
    port: Number(process.env.PORT ?? 5175),
    strictPort: true,
    open: '/demo/',
    headers: isolate
      ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }
      : {},
  },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
});
