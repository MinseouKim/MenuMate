# @menumate/ai

브라우저 안에서 도는 연령 판정 모듈과 음성 안내 모듈. 프론트가 import해서 쓴다.

- 공개 API 계약: [`docs/contracts/ai-output.md`](../docs/contracts/ai-output.md) (여기 적은 내용과 다르면 계약이 우선)
- 모델 정보·후보 비교: [`MODELS.md`](MODELS.md)
- 규칙: [`RULES.md`](RULES.md)

```ts
import { createAgeGate, createSpeaker, ageGateReducer } from '@menumate/ai';
```

빌드하지 않고 TypeScript 소스를 그대로 export한다. 프론트의 Vite가 함께 번들한다.

## 처음 설치

```bash
npm install
npm run models:setup -w ai      # 모델·WASM을 ai/models/ 에 받는다. 이 명령만 인터넷 필요
npm test -w ai
npm run demo -w ai              # http://localhost:5175/demo/ 웹캠으로 판정·TTS 확인
```

`ai/models/`는 git에 올리지 않는다. 전시 노트북에서도 `models:setup`을 한 번 돌려 두면 이후로는 인터넷 없이 동작한다 (D32).

## 프론트에서 쓰는 법

```ts
const gate = await createAgeGate({
  faceModelUrl: import.meta.env.VITE_FACE_MODEL_URL,
  ageModelUrl: import.meta.env.VITE_AGE_MODEL_URL,
  mediapipeWasmUrl: import.meta.env.VITE_MEDIAPIPE_WASM_URL,
  ortWasmUrl: import.meta.env.VITE_ORT_WASM_URL,
  stableFrames: Number(import.meta.env.VITE_AI_STABLE_FRAMES),
  minConfidence: Number(import.meta.env.VITE_AI_MIN_CONFIDENCE),
  decideTimeoutMs: Number(import.meta.env.VITE_AI_DECIDE_TIMEOUT_MS),
}); // 실패하면 AgeGateError → 터치로 일반 메뉴판 (D46)

const off = gate.onUpdate((u) => dispatch({ type: 'AI', update: u }));
gate.start(videoElement); // 카메라는 프론트가 연다 (getUserMedia)
// 초기화 때: gate.reset()   시연 단축키: gate.force('senior')

const speaker = await createSpeaker({ rate: Number(import.meta.env.VITE_TTS_RATE) });
if (speaker.available) await speaker.speak(question.text);
```

## 파이프라인 명세

```
웹캠 <video> ──(fps마다 1장)──▶ MediaPipe Face Detector ──▶ 가장 큰 얼굴 1개 (D18)
                                   │ 얼굴 없음 → no_face
                                   ▼
               정사각 크롭(박스 긴 변 × 배율, 밖은 검정) → 모델 입력 크기로 축소 → Float32 NCHW
                                   ▼
                         ONNX Runtime Web (WebGPU, 안 되면 WASM)
                                   ▼  추정 나이 (모듈 밖으로 안 나감, D2)
               ageGateReducer: 55세 기준 연령대 · 연속 N프레임 · 신뢰도 · 8초 타임아웃
                                   ▼
               onUpdate: no_face / detecting / decided / timeout / error
```

| 항목 | 값 |
|------|-----|
| 입력 | 프론트가 넘긴 `HTMLVideoElement` (카메라 스트림). 권장 1280×720, 최소 640×480 |
| 처리 주기 | 기본 6fps (`fps`). 추론이 주기보다 오래 걸리면 끝나는 대로 다음 프레임 |
| 얼굴 검출 | MediaPipe `blaze_face_short_range` (2m 이내 얼굴용), 최소 검출 점수 0.5, GPU(WebGL) → CPU 순 |
| 얼굴 선택 | 박스 면적이 가장 큰 1개만 나이 추정 |
| 프레임 신뢰도 | 검출 점수 × min(1, 얼굴 폭 px / 80). 얼굴이 작으면(멀리 있으면) 낮아져 판정에 안 쓴다 |
| 나이 모델 입력 | 후보별 다름. [`src/ageModels.ts`](src/ageModels.ts)와 [`MODELS.md`](MODELS.md) |
| 확정 | 같은 연령대가 연속 `stableFrames`(기본 5)프레임. `decided.confidence`는 그 프레임 신뢰도 평균 |
| 타임아웃 | 얼굴이 처음 보인 뒤 `decideTimeoutMs`(기본 8000ms) 안에 확정 못 하면 `timeout` (D16) |
| 확정 뒤 | `reset()` 전까지 추론을 멈춘다 (CPU 절약, D18) |
| 지연 목표 | 얼굴이 보인 뒤 확정까지 **2초 이내** (6fps × 5프레임 ≈ 0.8초 + 여유) |
| 로드 시간 | 모델 받기 + 준비 실행. 앱 시작 때 한 번 (대기 화면 동안) |

### 이벤트 규칙 (계약 보충)
- `no_face`는 얼굴이 **있다가 사라질 때 한 번** 보낸다. 대기 중 계속 얼굴이 없으면 이벤트가 없다.
- `detecting`은 얼굴이 보이는 프레임마다 보낸다 (`frameGroup: 'low_confidence'`이면 연속 기록이 0으로 끊긴 것).
- 확정과 타임아웃이 같은 프레임에 겹치면 확정이 이긴다.
- `error`는 추론이 연속으로 실패하는 동안 **첫 번째 한 번만** 보내고, 루프는 계속 돈다. 성공하면 다시 알릴 수 있는 상태로 돌아간다.
- `force()`는 언제든 즉시 `decided(source: 'forced', confidence: 1)`를 보내고, `reset()` 전까지 모델 판정을 멈춘다.

### 개인정보 (D2)
- 프레임은 크롭용 캔버스 1개에 그렸다가 추론 직후 지운다. 입력 버퍼도 0으로 덮는다.
- 저장, `console.log`, 서버 전송 없음. 추정 나이 숫자는 이벤트에 넣지 않는다 (테스트로 확인).

### 실행 환경 (D22, D27)
- WebGPU가 있으면 WebGPU, 없거나 실패하면 WASM(CPU). `gate.backend`로 확인.
- WASM 멀티스레드는 페이지가 `crossOriginIsolated`일 때만 켜진다 (COOP/COEP 헤더). 아니면 1스레드.

## 음성 (TTS)
- `speechSynthesis` 음성 중 `localService === true`인 한국어 음성만 쓴다. 우선순위: 유나(macOS) → 해미(Windows) → 소라 → 그 밖의 로컬 한국어 음성.
- 없으면 `available === false`, `speak()`는 바로 끝난다. 프론트는 글자만 보여 준다.
- `speak()`는 다 읽거나 `cancel()`되거나 새 `speak()`가 시작되면 resolve된다.

## 폴더
```
src/          모듈 소스와 테스트 (vitest)
scripts/      setup-models.mjs (모델·WASM 준비)
demo/         웹캠 데모와 속도 비교 (개발용, 전시 앱에서 쓰지 않음)
eval/         후보 모델 정확도 비교 스크립트 (Python, 평가 전용)
models/       git 제외. models:setup이 채움
```
