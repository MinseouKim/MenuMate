import { describe, expect, it } from 'vitest';
import { AGE_MODELS, FACE_MODEL, SELECTED_AGE_MODEL, parseSetupArgs } from './model-sources.mjs';

describe('model-sources', () => {
  it('기본 나이 모델은 사용자가 승인한 후보 B (D35)', () => {
    expect(SELECTED_AGE_MODEL).toBe('vit-age-gender');
    expect(parseSetupArgs([])).toEqual({ age: 'vit-age-gender', candidates: false });
  });

  it('gram 대책으로 후보 A를 옵션으로 고를 수 있다', () => {
    expect(parseSetupArgs(['--age=insightface-genderage'])).toEqual({ age: 'insightface-genderage', candidates: false });
  });

  it('--candidates로 비교용 후보도 받는다', () => {
    expect(parseSetupArgs(['--candidates']).candidates).toBe(true);
  });

  it('모르는 모델 이름은 오류', () => {
    expect(() => parseSetupArgs(['--age=nope'])).toThrow(/nope/);
  });

  it('모든 파일은 고정 버전 URL과 SHA-256을 가진다', () => {
    for (const m of [FACE_MODEL, ...Object.values(AGE_MODELS)]) {
      expect(m.url).toMatch(/^https:\/\//);
      expect(m.url).not.toMatch(/\/(main|latest)\//);
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
