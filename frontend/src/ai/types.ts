// docs/contracts/ai-output.md 의 공개 인터페이스. 구현은 @menumate/ai 가 제공한다.

export type AgeGroupResult = 'senior' | 'non_senior';

export interface AgeGateConfig {
  faceModelUrl: string;
  ageModelUrl: string;
  mediapipeWasmUrl: string;
  ortWasmUrl: string;
  seniorAge?: number;
  stableFrames?: number;
  minConfidence?: number;
  decideTimeoutMs?: number;
  fps?: number;
}

export type AgeGateUpdate =
  | { type: 'no_face' }
  | { type: 'detecting'; frameGroup: AgeGroupResult | 'low_confidence';
      run: number; required: number; elapsedMs: number }
  | { type: 'decided'; group: AgeGroupResult; confidence: number; source: 'model' | 'forced' }
  | { type: 'timeout' }
  | { type: 'error'; code: 'inference_failed'; message: string };

export interface AgeGate {
  start(video: HTMLVideoElement): void;
  stop(): void;
  reset(): void;
  force(group: AgeGroupResult): void;
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

export interface AiModule {
  createAgeGate(config: AgeGateConfig): Promise<AgeGate>;
  createSpeaker(config?: SpeakerConfig): Promise<Speaker>;
}
