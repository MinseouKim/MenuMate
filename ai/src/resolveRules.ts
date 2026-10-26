// config(.env에서 온 값)를 판정 규칙으로. 빈 값이나 숫자가 아닌 값은 기본값으로 둔다.
import { DEFAULT_FPS, DEFAULT_RULES, type AgeGateConfig, type AgeGateRules } from './types';

const pick = (v: number | undefined, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

function resolveBandEdges(v: unknown): [number, number] {
  if (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) && v[0] < v[1]) {
    return [v[0], v[1]];
  }
  return [...DEFAULT_RULES.bandEdges] as [number, number];
}

export function resolveRules(config: AgeGateConfig): Required<AgeGateRules> {
  const bandEdges = resolveBandEdges(config.bandEdges);
  return {
    seniorAge: pick(config.seniorAge, bandEdges[1]),
    stableFrames: pick(config.stableFrames, DEFAULT_RULES.stableFrames),
    minConfidence: pick(config.minConfidence, DEFAULT_RULES.minConfidence),
    decideTimeoutMs: pick(config.decideTimeoutMs, DEFAULT_RULES.decideTimeoutMs),
    noFaceGraceMs: pick(config.noFaceGraceMs, DEFAULT_RULES.noFaceGraceMs),
    bandEdges,
  };
}

export function resolveFps(config: AgeGateConfig): number {
  const fps = pick(config.fps, DEFAULT_FPS);
  return fps > 0 ? fps : DEFAULT_FPS;
}
