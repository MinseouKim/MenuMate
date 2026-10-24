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

## 나이 추정 (확정: 후보 B, 사용자 승인 2026-10-25, D35)

`models/age/age_estimator.onnx` 하나로 고정. 어떤 후보인지는 ONNX 입력 이름으로 자동 인식한다.
`models:setup` 기본값은 후보 B다 (`scripts/model-sources.mjs`의 `SELECTED_AGE_MODEL`). 후보 A는 gram 대책으로 `--age=insightface-genderage`로 남겨 둔다.
**상업화 때는 후보 B의 학습 데이터(UTKFace, 비상업 연구용) 라이선스 검토가 필요하다.**

| 항목 | 후보 A `insightface-genderage` (gram 대책용) | **후보 B `vit-age-gender` (확정)** |
|------|------|------|
| 이름 | InsightFace buffalo_l genderage | age-gender-prediction (ViT-B/16) ONNX |
| 출처 | https://huggingface.co/public-data/insightface (커밋 `33c1063c49c785b7652d3fd529f86fa4f149392b`, `models/buffalo_l/genderage.onnx`) | https://huggingface.co/onnx-community/age-gender-prediction-ONNX (커밋 `6c138f6454d37dd55e5d4648e23e1ec23844e705`, `onnx/model.onnx`). 원본 `abhilash88/age-gender-prediction` |
| 라이선스 | **비상업 연구용만** (InsightFace 사전학습 모델) | Apache-2.0. **학습 데이터 UTKFace는 비상업 연구용** |
| 크기 | 1,322,532 bytes (1.3MB) | 344,969,849 bytes (345MB) |
| SHA-256 | `4fde69b1c810857b88c64a335084f1c3fe8f01246c9a191b48c7bb756d6652fb` | `0c35c868ea8ffba6d5fe727c1a6b82d9da600e690342d58ca268270560e28304` |

## gram(Windows, 외장 GPU 없음) 이전 때 대책 (전시 이후, PM 결정 2026-10-24)
대상 기기: LG gram 15Z95U-GS5HK (사용자 응답, 2024년형 추정). Intel Core Ultra + 내장 Intel Arc 그래픽일 가능성이 높아 Windows Chrome에서 **WebGPU가 될 수도 있다** → D22의 "외장 GPU 없음 → WASM만" 가정이 바뀔 수 있다. 실측은 전시 이후.
후보 B는 WebGPU가 없으면 프레임당 약 1.2초(Mac WASM 1스레드 기준)라 5프레임 확정에 약 6초가 걸린다. 순서대로 시도한다.
1. **먼저 실기기에서 WebGPU 여부를 확인한다.** gram Chrome에서 `npm run demo -w ai` → "카메라 켜기" → 데모의 "백엔드" 줄이 `webgpu`인지 본다 (`gate.backend`). `webgpu`이고 추론 간격이 약 167ms(6fps)면 할 일 없음.
2. 안 되면 프론트 `.env`에서 `VITE_AI_STABLE_FRAMES=3`.
3. 그래도 느리면 gram에서만 `npm run models:setup -w ai -- --age=insightface-genderage` (후보 A, 2ms). 파일 이름이 같고 입력 이름으로 자동 인식하므로 코드 수정 없음. 단 정확도가 낮고 비상업 라이선스.
4. WASM 멀티스레드는 페이지가 crossOriginIsolated여야 한다. Backend가 COOP/COEP 헤더를 붙여야 하므로 gram 이전 때 Backend와 함께 다룬다.

## 런타임 (npm 패키지에서 복사)

| 패키지 | 버전 | 라이선스 | 복사 위치 |
|--------|------|----------|-----------|
| `@mediapipe/tasks-vision` | 1.1.1 | Apache-2.0 | `models/mediapipe-wasm/` (`wasm/*.js`, `*.wasm`) |
| `onnxruntime-web` | 1.30.0 | MIT | `models/ort-wasm/` (`dist/ort-wasm*.mjs`, `*.wasm`) |
