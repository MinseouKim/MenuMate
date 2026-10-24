// 나이 추정 모델 후보별 전처리·후처리. 파일 이름은 age_estimator.onnx로 고정이므로
// ONNX 입력 이름으로 어떤 후보인지 알아낸다. 후보 비교는 ai/MODELS.md.

export interface AgeModelSpec {
  id: 'insightface-genderage' | 'vit-age-gender';
  inputName: string;
  /** 정사각 입력 한 변 (px) */
  inputSize: number;
  /** 얼굴 박스 긴 변 대비 잘라낼 정사각 영역 배율 */
  cropScale: number;
  /** 채널별 (픽셀값(0~255) × scale − mean) / std, RGB 순서, NCHW */
  scale: number;
  mean: readonly [number, number, number];
  std: readonly [number, number, number];
  /** 출력 텐서 데이터 → 추정 나이 */
  readAge(output: ArrayLike<number>): number;
}

export const AGE_MODELS: readonly AgeModelSpec[] = [
  {
    // InsightFace buffalo_l genderage.onnx: [1,3,96,96] 0~255 RGB → [female, male, age/100]
    id: 'insightface-genderage',
    inputName: 'data',
    inputSize: 96,
    cropScale: 1.5,
    scale: 1,
    mean: [0, 0, 0],
    std: [1, 1, 1],
    readAge: (out) => Number(out[2]) * 100,
  },
  {
    // onnx-community/age-gender-prediction-ONNX (ViT-B/16): [1,3,224,224] ImageNet 정규화 → [age, gender]
    id: 'vit-age-gender',
    inputName: 'pixel_values',
    inputSize: 224,
    cropScale: 1.3,
    scale: 1 / 255,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    readAge: (out) => Number(out[0]),
  },
];

export function findAgeModel(inputNames: readonly string[]): AgeModelSpec | null {
  return AGE_MODELS.find((m) => inputNames.includes(m.inputName)) ?? null;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 얼굴 박스 중심에 맞춘 정사각 잘라내기 영역. 영상 밖으로 나가도 된다
 * (drawImage가 밖은 비워 두므로 얼굴이 가장자리에 있어도 비율이 유지된다).
 */
export function squareCrop(face: Box, cropScale: number): Box {
  const side = Math.max(face.width, face.height) * cropScale;
  const cx = face.x + face.width / 2;
  const cy = face.y + face.height / 2;
  return { x: cx - side / 2, y: cy - side / 2, width: side, height: side };
}

/** RGBA 픽셀 → 모델 입력 Float32 NCHW. `out`을 넘기면 재사용한다. */
export function rgbaToTensor(
  rgba: Uint8ClampedArray,
  spec: Pick<AgeModelSpec, 'inputSize' | 'scale' | 'mean' | 'std'>,
  out?: Float32Array,
): Float32Array {
  const plane = spec.inputSize * spec.inputSize;
  if (rgba.length !== plane * 4) throw new Error(`픽셀 수가 맞지 않습니다: ${rgba.length / 4} != ${plane}`);
  const data = out && out.length === plane * 3 ? out : new Float32Array(plane * 3);
  const [mr, mg, mb] = spec.mean;
  const [sr, sg, sb] = spec.std;
  const k = spec.scale;
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    data[i] = (rgba[p]! * k - mr) / sr;
    data[plane + i] = (rgba[p + 1]! * k - mg) / sg;
    data[2 * plane + i] = (rgba[p + 2]! * k - mb) / sb;
  }
  return data;
}

/**
 * 판정 신뢰도. 나이 모델은 불확실도를 주지 않으므로 얼굴 검출 점수에
 * 얼굴 크기 보정을 곱한다. 화면에서 너무 작은 얼굴(멀리 지나가는 사람)은 신뢰도를 낮춘다.
 */
export function frameConfidence(detectionScore: number, faceWidthPx: number, minFacePx = 80): number {
  const sizeFactor = Math.min(1, Math.max(0, faceWidthPx / minFacePx));
  const c = detectionScore * sizeFactor;
  return Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0;
}
