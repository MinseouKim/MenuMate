// docs/contracts/ai-output.md v1 의 타입. 계약을 바꾸지 않고는 여기 필드를 바꾸지 않는다 (D37).

export type AgeGroup = 'senior' | 'non_senior';

/** 연령대 3단계 (ai-output v2, D72). group === 'senior' ⇔ ageBand === '55plus' */
export type AgeBand = 'under35' | '35to54' | '55plus';

export interface AgeGateConfig {
  faceModelUrl: string;      // 예: "/models/face/blaze_face_short_range.tflite"
  ageModelUrl: string;       // 예: "/models/age/age_estimator.onnx"
  mediapipeWasmUrl: string;  // 예: "/models/mediapipe-wasm"
  ortWasmUrl: string;        // 예: "/models/ort-wasm/"
  seniorAge?: number;        // 기본 bandEdges[1] = 55 (D3)
  bandEdges?: [number, number]; // 기본 [35, 55] (v2, D72). [0]으로 under35/35to54를 나눈다
  stableFrames?: number;     // 기본 5
  minConfidence?: number;    // 기본 0.7
  decideTimeoutMs?: number;  // 기본 8000 (D16)
  fps?: number;              // 기본 6
  noFaceGraceMs?: number;    // 기본 0. 얼굴이 이 시간보다 짧게 빠지면 no_face로 보지 않음 (검출 깜빡임 대비, PM 요청 2026-10-24)
}

/** 판정 규칙에 쓰는 값. `ageGateReducer`의 세 번째 인자. */
export interface AgeGateRules {
  seniorAge: number;
  stableFrames: number;
  minConfidence: number;
  decideTimeoutMs: number;
  /** 없으면 0 (계약 v1과 같은 동작: 한 프레임만 빠져도 no_face) */
  noFaceGraceMs?: number;
  /** 없으면 [35, seniorAge] */
  bandEdges?: [number, number];
}

export const DEFAULT_RULES: Readonly<Required<AgeGateRules>> = Object.freeze({
  seniorAge: 55,
  stableFrames: 5,
  minConfidence: 0.7,
  decideTimeoutMs: 8000,
  noFaceGraceMs: 0,
  bandEdges: [35, 55] as [number, number],
});

export const DEFAULT_FPS = 6;

export interface AgeGate {
  start(video: HTMLVideoElement): void;
  stop(): void;
  reset(): void;
  /** 시연용 강제 판정. v2: ageBand도 받는다 ('non_senior'는 '35to54'로) */
  force(target: AgeGroup | AgeBand): void;
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
  | { type: 'decided'; group: AgeGroup; ageBand: AgeBand; confidence: number; source: 'model' | 'forced' }
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
  /** 연속 판정 프레임들의 추정 나이 (모듈 내부 전용, ageBand 중앙값 계산용. 이벤트로 나가지 않는다) */
  runAges: number[];
  /** 얼굴이 처음 보인 시각. 타임아웃 기준 (D16) */
  firstSeenAt: number | null;
  /** 얼굴이 마지막으로 보인 시각. 깜빡임 유예(noFaceGraceMs) 기준 */
  lastSeenAt: number | null;
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
