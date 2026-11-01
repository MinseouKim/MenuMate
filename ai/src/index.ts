// @menumate/ai 공개 API. 계약: docs/contracts/ai-output.md
export { createAgeGate } from './createAgeGate';
export { createSpeaker } from './createSpeaker';
export { createFaceSignals, type FaceSignals, type FaceSignalsConfig } from './createFaceSignals';
export { signalReducer, initialSignalState, DEFAULT_SIGNAL_RULES, type FaceSignal, type SignalFrame, type SignalRules, type SignalState } from './faceSignalsCore';
export { ageGateReducer, initialAgeGateState } from './ageGateReducer';
export { AgeGateError, DEFAULT_RULES, DEFAULT_FPS } from './types';
export type {
  AgeGate,
  AgeBand,
  AgeGateConfig,
  AgeGateErrorCode,
  AgeGateRules,
  AgeGateState,
  AgeGateUpdate,
  AgeGroup,
  FaceObservation,
  FrameInput,
  Speaker,
  SpeakerConfig,
} from './types';
