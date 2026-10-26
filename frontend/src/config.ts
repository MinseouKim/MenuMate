// 설정은 .env (VITE_*) 에서만 읽는다. 키와 기본값은 docs/env-guide.md 4장.
const env = import.meta.env;

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback;
};

export const config = {
  apiBaseUrl: env.VITE_API_BASE_URL ?? '',
  faceModelUrl: env.VITE_FACE_MODEL_URL ?? '/models/face/blaze_face_short_range.tflite',
  ageModelUrl: env.VITE_AGE_MODEL_URL ?? '/models/age/age_estimator.onnx',
  mediapipeWasmUrl: env.VITE_MEDIAPIPE_WASM_URL ?? '/models/mediapipe-wasm',
  ortWasmUrl: env.VITE_ORT_WASM_URL ?? '/models/ort-wasm/',
  aiStableFrames: num(env.VITE_AI_STABLE_FRAMES, 5),
  aiMinConfidence: num(env.VITE_AI_MIN_CONFIDENCE, 0.7),
  aiDecideTimeoutMs: num(env.VITE_AI_DECIDE_TIMEOUT_MS, 8000),
  aiNoFaceGraceMs: num(env.VITE_AI_NO_FACE_GRACE_MS, 0),
  idleResetMs: num(env.VITE_IDLE_RESET_MS, 60000),
  doneResetMs: num(env.VITE_DONE_RESET_MS, 15000),
  ttsRate: num(env.VITE_TTS_RATE, 0.85),
  devShortcuts: (env.VITE_DEV_SHORTCUTS ?? 'true') === 'true',
} as const;
