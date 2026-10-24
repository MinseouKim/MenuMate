// config(.env에서 온 값)를 판정 규칙으로. 빈 값이나 숫자가 아닌 값은 기본값으로 둔다.
import { DEFAULT_FPS, DEFAULT_RULES, type AgeGateConfig, type AgeGateRules } from './types';

const pick = (v: number | undefined, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export function resolveRules(config: AgeGateConfig): Required<AgeGateRules> {
  return {
    seniorAge: pick(config.seniorAge, DEFAULT_RULES.seniorAge),
    stableFrames: pick(config.stableFrames, DEFAULT_RULES.stableFrames),
    minConfidence: pick(config.minConfidence, DEFAULT_RULES.minConfidence),
    decideTimeoutMs: pick(config.decideTimeoutMs, DEFAULT_RULES.decideTimeoutMs),
    noFaceGraceMs: pick(config.noFaceGraceMs, DEFAULT_RULES.noFaceGraceMs),
  };
}

export function resolveFps(config: AgeGateConfig): number {
  const fps = pick(config.fps, DEFAULT_FPS);
  return fps > 0 ? fps : DEFAULT_FPS;
}
