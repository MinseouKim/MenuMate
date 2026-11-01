/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 서버 주소 (예: https://menumate-api.onrender.com). 비우면 같은 origin. LLM·TTS 키는 서버 .env에만 둡니다. */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_FACE_MODEL_URL?: string;
  readonly VITE_LANDMARKER_MODEL_URL?: string;
  readonly VITE_AGE_MODEL_URL?: string;
  readonly VITE_MEDIAPIPE_WASM_URL?: string;
  readonly VITE_ORT_WASM_URL?: string;
  readonly VITE_STT_MODEL_URL?: string;
  readonly VITE_AI_STABLE_FRAMES?: string;
  readonly VITE_AI_MIN_CONFIDENCE?: string;
  readonly VITE_AI_DECIDE_TIMEOUT_MS?: string;
  readonly VITE_AI_NO_FACE_GRACE_MS?: string;
  readonly VITE_IDLE_RESET_MS?: string;
  readonly VITE_DONE_RESET_MS?: string;
  readonly VITE_TTS_RATE?: string;
  readonly VITE_TTS_SERVER?: string;
  readonly VITE_CHAT_SERVER?: string;
  readonly VITE_FACE_SIGNALS?: string;
  readonly VITE_DEV_SHORTCUTS?: string;
  /** 휴대폰에서 열 수 있는 영수증 배포 주소 */
  readonly VITE_RECEIPT_BASE_URL?: string;
  /** 휴대폰 영수증 아래 설문 링크 */
  readonly VITE_SURVEY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
