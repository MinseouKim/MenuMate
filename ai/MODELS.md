# 모델 정보 (D35)

`npm run models:setup -w ai`가 아래 파일을 받아 SHA-256을 확인하고 `ai/models/`에 둔다. 모델 파일은 git에 올리지 않는다.
비교와 선택 근거는 [`docs/model-comparison.md`](docs/model-comparison.md).

## 얼굴 검출 (확정)

| 항목 | 값 |
|------|-----|
| 이름 | MediaPipe Face Detector `blaze_face_short_range` (float16, 버전 1) |
| 출처 | https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite |
| 라이선스 | Apache-2.0 |
| 크기 | 229,746 bytes (0.2MB) |
| SHA-256 | `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f` |
| 위치 | `models/face/blaze_face_short_range.tflite` |

## 나이 추정 (PM 승인 대기, 권고: 후보 B)

`models/age/age_estimator.onnx` 하나로 고정. 어떤 후보인지는 ONNX 입력 이름으로 자동 인식한다.
지금 `models:setup` 기본값은 후보 A다 (승인 후 B로 변경 예정). `--age=<id>`로 고를 수 있다.

| 항목 | 후보 A `insightface-genderage` | 후보 B `vit-age-gender` |
|------|------|------|
| 이름 | InsightFace buffalo_l genderage | age-gender-prediction (ViT-B/16) ONNX |
| 출처 | https://huggingface.co/public-data/insightface (커밋 `33c1063c49c785b7652d3fd529f86fa4f149392b`, `models/buffalo_l/genderage.onnx`) | https://huggingface.co/onnx-community/age-gender-prediction-ONNX (커밋 `6c138f6454d37dd55e5d4648e23e1ec23844e705`, `onnx/model.onnx`). 원본 `abhilash88/age-gender-prediction` |
| 라이선스 | **비상업 연구용만** (InsightFace 사전학습 모델) | Apache-2.0. **학습 데이터 UTKFace는 비상업 연구용** |
| 크기 | 1,322,532 bytes (1.3MB) | 344,969,849 bytes (345MB) |
| SHA-256 | `4fde69b1c810857b88c64a335084f1c3fe8f01246c9a191b48c7bb756d6652fb` | `0c35c868ea8ffba6d5fe727c1a6b82d9da600e690342d58ca268270560e28304` |

## 런타임 (npm 패키지에서 복사)

| 패키지 | 버전 | 라이선스 | 복사 위치 |
|--------|------|----------|-----------|
| `@mediapipe/tasks-vision` | 1.1.1 | Apache-2.0 | `models/mediapipe-wasm/` (`wasm/*.js`, `*.wasm`) |
| `onnxruntime-web` | 1.30.0 | MIT | `models/ort-wasm/` (`dist/ort-wasm*.mjs`, `*.wasm`) |
