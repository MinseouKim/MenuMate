import { describe, expect, it } from 'vitest';
import { AGE_MODELS, findAgeModel, frameConfidence, rgbaToTensor, squareCrop } from './ageModels';

describe('findAgeModel', () => {
  it('입력 이름으로 후보 모델을 알아낸다', () => {
    expect(findAgeModel(['data'])?.id).toBe('insightface-genderage');
    expect(findAgeModel(['pixel_values'])?.id).toBe('vit-age-gender');
    expect(findAgeModel(['input'])).toBeNull();
  });

  it('후보별 출력에서 나이를 읽는다', () => {
    expect(AGE_MODELS[0]!.readAge([0.2, 0.8, 0.57])).toBeCloseTo(57);
    expect(AGE_MODELS[1]!.readAge([41.3, 0.1])).toBeCloseTo(41.3);
  });
});

describe('squareCrop', () => {
  it('박스 중심에 긴 변 × 배율 정사각형을 만든다', () => {
    expect(squareCrop({ x: 100, y: 50, width: 80, height: 100 }, 1.5)).toEqual({ x: 65, y: 25, width: 150, height: 150 });
  });
});

describe('rgbaToTensor', () => {
  const spec = { inputSize: 2, scale: 1 / 255, mean: [0.5, 0.5, 0.5] as const, std: [0.5, 0.5, 0.5] as const };

  it('RGBA를 정규화한 NCHW 평면으로 바꾼다', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const t = rgbaToTensor(rgba, spec);
    expect(Array.from(t)).toEqual([1, -1, -1, 1, -1, 1, -1, 1, -1, -1, 1, 1]);
  });

  it('넘겨준 버퍼를 재사용한다', () => {
    const out = new Float32Array(12);
    expect(rgbaToTensor(new Uint8ClampedArray(16), spec, out)).toBe(out);
  });

  it('픽셀 수가 다르면 오류', () => {
    expect(() => rgbaToTensor(new Uint8ClampedArray(8), spec)).toThrow();
  });
});

describe('frameConfidence', () => {
  it('충분히 큰 얼굴은 검출 점수 그대로', () => {
    expect(frameConfidence(0.92, 200)).toBeCloseTo(0.92);
  });
  it('작은 얼굴은 크기에 비례해 낮춘다', () => {
    expect(frameConfidence(0.9, 40)).toBeCloseTo(0.45);
  });
  it('숫자가 아니면 0', () => {
    expect(frameConfidence(Number.NaN, 100)).toBe(0);
  });
});
