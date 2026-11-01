// 설정은 .env (VITE_*) 에서만 읽는다. 키와 기본값은 docs/env-guide.md 4장.
const env = import.meta.env;

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback;
};
const bool = (v: string | undefined, fallback: boolean) => (v === undefined || v === '' ? fallback : v === 'true');

/** 서버 주소. 비우면 같은 origin (개발 중에는 Vite 프록시가 /api·/models·/static을 :4000으로 보냄) */
const apiBaseUrl = (env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export const config = {
  apiBaseUrl,
  faceModelUrl: env.VITE_FACE_MODEL_URL ?? `${apiBaseUrl}/models/face/blaze_face_short_range.tflite`,
  landmarkerModelUrl: env.VITE_LANDMARKER_MODEL_URL ?? `${apiBaseUrl}/models/face/face_landmarker.task`,
  ageModelUrl: env.VITE_AGE_MODEL_URL ?? `${apiBaseUrl}/models/age/age_estimator.onnx`,
  mediapipeWasmUrl: env.VITE_MEDIAPIPE_WASM_URL ?? `${apiBaseUrl}/models/mediapipe-wasm`,
  ortWasmUrl: env.VITE_ORT_WASM_URL ?? `${apiBaseUrl}/models/ort-wasm/`,
  sttModelRoot: env.VITE_STT_MODEL_URL ?? `${apiBaseUrl}/models/stt/`,
  aiStableFrames: num(env.VITE_AI_STABLE_FRAMES, 5),
  aiMinConfidence: num(env.VITE_AI_MIN_CONFIDENCE, 0.7),
  aiDecideTimeoutMs: num(env.VITE_AI_DECIDE_TIMEOUT_MS, 8000),
  aiNoFaceGraceMs: num(env.VITE_AI_NO_FACE_GRACE_MS, 0),
  idleResetMs: num(env.VITE_IDLE_RESET_MS, 60000),
  doneResetMs: num(env.VITE_DONE_RESET_MS, 15000),
  ttsRate: num(env.VITE_TTS_RATE, 0.85),
  /** 서버 음성 합성(Google TTS)을 먼저 시도. 실패하면 브라우저 TTS */
  ttsServer: bool(env.VITE_TTS_SERVER, true),
  /** 서버 대화형 추천(Gemini)을 쓴다. 실패하면 규칙 해석 */
  chatServer: bool(env.VITE_CHAT_SERVER, true),
  /** 메뉴 화면에서도 카메라를 켜 두고 얼굴 접근·찌푸림 신호로 큰 글씨를 제안한다 */
  faceSignals: bool(env.VITE_FACE_SIGNALS, true),
  devShortcuts: bool(env.VITE_DEV_SHORTCUTS, true),
} as const;

/** `/api/...` 같은 경로를 서버 주소에 붙인다 */
export const apiUrl = (path: string) => `${config.apiBaseUrl}${path}`;
