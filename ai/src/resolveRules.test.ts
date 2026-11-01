import { describe, expect, it } from 'vitest';
import { resolveFps, resolveRules } from './resolveRules';
import { DEFAULT_FPS, DEFAULT_RULES } from './types';

const urls = { faceModelUrl: 'f', ageModelUrl: 'a', mediapipeWasmUrl: 'm', ortWasmUrl: 'o' };

describe('resolveRules', () => {
  it('값이 없으면 기본값 (bandEdges [35, 55])', () => {
    expect(resolveRules(urls)).toEqual(DEFAULT_RULES);
    expect(DEFAULT_RULES.bandEdges).toEqual([35, 55]);
  });

  it('seniorAge가 없으면 bandEdges[1]을 쓴다', () => {
    expect(resolveRules({ ...urls, bandEdges: [30, 60] })).toMatchObject({ seniorAge: 60, bandEdges: [30, 60] });
    expect(resolveRules({ ...urls, seniorAge: 50 })).toMatchObject({ seniorAge: 50, bandEdges: [35, 55] });
  });

  it('잘못된 bandEdges(순서가 틀리거나 숫자가 아님)는 기본값', () => {
    expect(resolveRules({ ...urls, bandEdges: [60, 30] }).bandEdges).toEqual([35, 55]);
    expect(resolveRules({ ...urls, bandEdges: [Number.NaN, 55] as [number, number] }).bandEdges).toEqual([35, 55]);
  });

  it('설정값을 그대로 쓴다 (noFaceGraceMs 포함)', () => {
    const r = resolveRules({ ...urls, seniorAge: 60, stableFrames: 3, minConfidence: 0.5, decideTimeoutMs: 6000, noFaceGraceMs: 500 });
    expect(r).toEqual({ seniorAge: 60, stableFrames: 3, minConfidence: 0.5, decideTimeoutMs: 6000, noFaceGraceMs: 500, bandEdges: [35, 55] });
  });

  it('숫자가 아닌 값(빈 .env를 Number로 바꾼 NaN 등)은 기본값으로', () => {
    const r = resolveRules({ ...urls, stableFrames: Number.NaN, noFaceGraceMs: Number.NaN });
    expect(r.stableFrames).toBe(DEFAULT_RULES.stableFrames);
    expect(r.noFaceGraceMs).toBe(0);
  });
});

describe('resolveFps', () => {
  it('없거나 숫자가 아니거나 0 이하면 기본 6fps', () => {
    expect(resolveFps(urls)).toBe(DEFAULT_FPS);
    expect(resolveFps({ ...urls, fps: Number.NaN })).toBe(DEFAULT_FPS);
    expect(resolveFps({ ...urls, fps: 0 })).toBe(DEFAULT_FPS);
  });
  it('설정값을 쓴다', () => {
    expect(resolveFps({ ...urls, fps: 3 })).toBe(3);
  });
});
