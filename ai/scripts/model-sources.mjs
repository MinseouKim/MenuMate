// models:setup이 받는 파일 목록. 버전(커밋)과 SHA-256을 고정한다. 정보는 ai/MODELS.md와 같아야 한다.

/** 사용자 승인 2026-10-25 (D35). 후보 A는 gram 대책으로 --age=insightface-genderage 로 남긴다. */
export const SELECTED_AGE_MODEL = 'vit-age-gender';

export const FACE_MODEL = {
  file: 'face/blaze_face_short_range.tflite',
  url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
  sha256: 'b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f',
};

export const AGE_MODELS = {
  'insightface-genderage': {
    url: 'https://huggingface.co/public-data/insightface/resolve/33c1063c49c785b7652d3fd529f86fa4f149392b/models/buffalo_l/genderage.onnx',
    sha256: '4fde69b1c810857b88c64a335084f1c3fe8f01246c9a191b48c7bb756d6652fb',
  },
  'vit-age-gender': {
    url: 'https://huggingface.co/onnx-community/age-gender-prediction-ONNX/resolve/6c138f6454d37dd55e5d4648e23e1ec23844e705/onnx/model.onnx',
    sha256: '0c35c868ea8ffba6d5fe727c1a6b82d9da600e690342d58ca268270560e28304',
  },
};

/** `--age=<id>`, `--candidates` 해석. 모르는 모델이면 오류. */
export function parseSetupArgs(args) {
  const age = args.find((a) => a.startsWith('--age='))?.slice('--age='.length) ?? SELECTED_AGE_MODEL;
  if (!AGE_MODELS[age]) {
    throw new Error(`알 수 없는 나이 모델: ${age}. 가능한 값: ${Object.keys(AGE_MODELS).join(', ')}`);
  }
  return { age, candidates: args.includes('--candidates') };
}
