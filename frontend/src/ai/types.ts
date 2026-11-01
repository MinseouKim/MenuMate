// docs/contracts/ai-output.md 의 공개 인터페이스. 구현은 @menumate/ai 가 제공한다.

export type AgeGroupResult = 'senior' | 'non_senior';
/** 연령대 3단계 (D72). group === 'senior' ⇔ ageBand === '55plus' */
export type AgeBand = 'under35' | '35to54' | '55plus';
export const AGE_BANDS: readonly AgeBand[] = ['under35', '35to54', '55plus'];

export interface AgeGateConfig {
  faceModelUrl: string;
  ageModelUrl: string;
  mediapipeWasmUrl: string;
  ortWasmUrl: string;
  seniorAge?: number;
  stableFrames?: number;
  minConfidence?: number;
  decideTimeoutMs?: number;
  noFaceGraceMs?: number;  // 얼굴이 잠깐 안 보여도 no_face 로 보지 않는 시간 (env-guide VITE_AI_NO_FACE_GRACE_MS)
  fps?: number;
}

export type AgeGateUpdate =
  | { type: 'no_face' }
  | { type: 'detecting'; frameGroup: AgeGroupResult | 'low_confidence';
      run: number; required: number; elapsedMs: number }
  // ageBand: ai-output v2 (D72). 지금 AI 모듈은 force(ageBand) 의 값을 group 자리에 그대로 넣는다
  | { type: 'decided'; group: AgeGroupResult | AgeBand; ageBand?: AgeBand; confidence: number; source: 'model' | 'forced' }
  | { type: 'timeout' }
  | { type: 'error'; code: 'inference_failed'; message: string };

export interface AgeGate {
  start(video: HTMLVideoElement): void;
  stop(): void;
  reset(): void;
  force(target: AgeGroupResult | AgeBand): void; // ai-output v2: force(ageBand) 도 받는다
  onUpdate(cb: (u: AgeGateUpdate) => void): () => void;
  readonly backend: 'webgpu' | 'wasm';
}

export interface SpeakerConfig { lang?: string; rate?: number }
export interface Speaker {
  readonly available: boolean;
  readonly voiceName: string | null;
  speak(text: string): Promise<void>;
  cancel(): void;
}

/** 불편 신호 (2026-11-02): 얼굴이 화면에 가까워짐 / 눈 찌푸림. 좌표·이미지는 나오지 않는다 (D2 확장) */
export type FaceSignal = 'approach' | 'squint';
export interface FaceSignalsConfig { landmarkerModelUrl: string; mediapipeWasmUrl: string; fps?: number }
export interface FaceSignals {
  start(video: HTMLVideoElement): void;
  stop(): void;
  onSignal(cb: (s: FaceSignal) => void): () => void;
}

export interface AiModule {
  createAgeGate(config: AgeGateConfig): Promise<AgeGate>;
  createSpeaker(config?: SpeakerConfig): Promise<Speaker>;
  createFaceSignals(config: FaceSignalsConfig): Promise<FaceSignals>;
}
