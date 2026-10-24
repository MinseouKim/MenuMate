// docs/contracts/ai-output.md v1 의 타입. 계약을 바꾸지 않고는 여기 필드를 바꾸지 않는다 (D37).

export type AgeGroup = 'senior' | 'non_senior';

export interface AgeGateConfig {
  faceModelUrl: string;      // 예: "/models/face/blaze_face_short_range.tflite"
  ageModelUrl: string;       // 예: "/models/age/age_estimator.onnx"
  mediapipeWasmUrl: string;  // 예: "/models/mediapipe-wasm"
  ortWasmUrl: string;        // 예: "/models/ort-wasm/"
  seniorAge?: number;        // 기본 55 (D3)
  stableFrames?: number;     // 기본 5
  minConfidence?: number;    // 기본 0.7
  decideTimeoutMs?: number;  // 기본 8000 (D16)
  fps?: number;              // 기본 6
}

/** 판정 규칙에 쓰는 값. `ageGateReducer`의 세 번째 인자. */
export interface AgeGateRules {
  seniorAge: number;
  stableFrames: number;
  minConfidence: number;
  decideTimeoutMs: number;
}

export const DEFAULT_RULES: Readonly<AgeGateRules> = Object.freeze({
  seniorAge: 55,
  stableFrames: 5,
  minConfidence: 0.7,
  decideTimeoutMs: 8000,
});

export const DEFAULT_FPS = 6;

export interface AgeGate {
  start(video: HTMLVideoElement): void;
  stop(): void;
  reset(): void;
  force(group: AgeGroup): void;
  onUpdate(cb: (u: AgeGateUpdate) => void): () => void;
  readonly backend: 'webgpu' | 'wasm';
}

export type AgeGateUpdate =
  | { type: 'no_face' }
  | {
      type: 'detecting';
      frameGroup: AgeGroup | 'low_confidence';
      run: number;
      required: number;
      elapsedMs: number;
    }
  | { type: 'decided'; group: AgeGroup; confidence: number; source: 'model' | 'forced' }
  | { type: 'timeout' }
  | { type: 'error'; code: 'inference_failed'; message: string };

export type AgeGateErrorCode = 'model_load_failed' | 'backend_unsupported';

export class AgeGateError extends Error {
  readonly code: AgeGateErrorCode;
  constructor(code: AgeGateErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AgeGateError';
    this.code = code;
  }
}

/** 얼굴 1개의 관찰값. `age`는 모듈 내부 전용이고 이벤트로 나가지 않는다 (D2). */
export interface FaceObservation {
  area: number;
  age: number;
  confidence: number;
}

/** 프레임 1장의 관찰 결과. `t`는 ms. */
export interface FrameInput {
  t: number;
  faces: FaceObservation[];
}

export interface AgeGateState {
  phase: 'idle' | 'detecting' | 'decided' | 'timeout';
  /** 지금 이어지고 있는 연속 판정의 연령대 */
  runGroup: AgeGroup | null;
  run: number;
  /** 연속 판정 프레임들의 신뢰도 합. 확정 시 평균을 낸다. */
  runConfidenceSum: number;
  /** 얼굴이 처음 보인 시각. 타임아웃 기준 (D16) */
  firstSeenAt: number | null;
}

export interface SpeakerConfig {
  lang?: string;  // 기본 'ko-KR'
  rate?: number;  // 기본 0.85
}

export interface Speaker {
  readonly available: boolean;
  readonly voiceName: string | null;
  speak(text: string): Promise<void>;
  cancel(): void;
}
