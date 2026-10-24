# 계약: AI 모듈 입출력

- 주관: AI / 검토: Frontend, Backend / 승인: PM
- 상태: v1.1 확정 (2026-10-24, AI 구현 보고의 이벤트 규칙 4개 반영)
- 관련 결정: D2, D3, D16, D18, D22, D24, D27, D28, D30, D35

AI는 npm workspace 패키지 `@menumate/ai`(`ai/` 폴더)로 제공한다. 프론트가 브라우저에서 import해서 쓰고, 서버는 이 모듈과 통신하지 않는다.

```ts
import { createAgeGate, createSpeaker, ageGateReducer } from '@menumate/ai';
```

## 1. 연령 판정: `createAgeGate`

### 설정
```ts
interface AgeGateConfig {
  faceModelUrl: string;      // 예: "/models/face/blaze_face_short_range.tflite"
  ageModelUrl: string;       // 예: "/models/age/age_estimator.onnx"
  mediapipeWasmUrl: string;  // 예: "/models/mediapipe-wasm"
  ortWasmUrl: string;        // 예: "/models/ort-wasm/"
  seniorAge?: number;        // 기본 55 (D3)
  stableFrames?: number;     // 기본 5. 같은 판정이 연속 몇 프레임이면 확정
  minConfidence?: number;    // 기본 0.7. 이 미만 프레임은 버리고 연속 기록을 끊음
  decideTimeoutMs?: number;  // 기본 8000 (D16). 얼굴이 처음 보인 뒤부터 잼
  fps?: number;              // 기본 6. 추론 주기
  noFaceGraceMs?: number;    // 기본 0 (v1.1). 0보다 크면 얼굴이 마지막으로 보인 뒤 이 시간 안의 빈 프레임은
                             // 이벤트 없이 무시하고 연속 기록 유지. 타임아웃 시간은 계속 흐름
}
function createAgeGate(config: AgeGateConfig): Promise<AgeGate>;
```
- 모델과 WASM은 전부 로컬 URL에서 받는다. CDN 금지 (D32).
- WebGPU가 없으면 WASM(CPU)로 돌린다. gram에서도 동작해야 한다 (D22).
- 로드 실패 시 Promise가 `AgeGateError`(`code: 'model_load_failed' | 'backend_unsupported'`)로 reject된다.

### 객체
```ts
interface AgeGate {
  start(video: HTMLVideoElement): void;  // 카메라 영상이 붙은 video 요소. 카메라 열기는 프론트 담당
  stop(): void;                          // 추론 중지 (카메라는 끄지 않음)
  reset(): void;                         // 판정 상태 초기화. 다음 손님 맞을 때 호출
  force(group: 'senior' | 'non_senior'): void; // 시연용 강제 판정 (D24). 즉시 decided 이벤트
  onUpdate(cb: (u: AgeGateUpdate) => void): () => void; // 구독 해제 함수 반환
  readonly backend: 'webgpu' | 'wasm';
}
```

### 이벤트
```ts
type AgeGateUpdate =
  | { type: 'no_face' }
  | { type: 'detecting'; frameGroup: 'senior' | 'non_senior' | 'low_confidence';
      run: number; required: number; elapsedMs: number }
  | { type: 'decided'; group: 'senior' | 'non_senior'; confidence: number; source: 'model' | 'forced' }
  | { type: 'timeout' }   // decideTimeoutMs 안에 확정 실패 → 프론트는 일반 화면 (D16)
  | { type: 'error'; code: 'inference_failed'; message: string };
```

규칙:
- `decided`나 `timeout`이 한 번 나오면 `reset()` 전까지 더 이상 판정하지 않는다 (D18: 세션 중 재판정 없음). `force()`는 언제든 동작한다.
- 얼굴이 사라지면 `no_face`를 보내고 연속 기록과 타이머를 초기화한다. 단, `decided` 이후에는 보내지 않는다.
- 여러 얼굴이 보이면 박스 면적이 가장 큰 얼굴 1개만 쓴다 (D18).
- `no_face`는 얼굴이 있다가 없어질 때 한 번만 보낸다. 계속 없으면 이벤트 없음. (v1.1)
- `error`는 연속 실패 중 첫 번째만 보내고 추론은 계속 시도한다. 프론트는 판정 전이면 timeout과 같이 처리한다. (v1.1)
- `decided` 또는 `timeout` 뒤에는 `reset()` 전까지 추론을 멈춘다. `force()`는 그 뒤에도 `decided`를 다시 보낸다. (v1.1)
- `decided.confidence` = 확정에 쓴 연속 프레임 신뢰도의 평균. 프레임 신뢰도 = 얼굴 검출 점수 × min(1, 얼굴 폭 / 80px). (v1.1)
- **원본 나이 숫자는 이벤트에 넣지 않는다.** 모듈 밖으로 나가는 것은 연령대(`senior`/`non_senior`)와 신뢰도뿐이다 (D2).
- 프레임 이미지는 추론 후 바로 버린다. 저장, `console.log`, 캔버스 덤프 금지.

### 순수 판정 로직: `ageGateReducer`
카메라 없이 테스트할 수 있게 판정 로직을 순수 함수로 분리해 export한다. `createAgeGate`는 내부에서 이 함수를 쓴다.

```ts
interface FaceObservation { area: number; age: number; confidence: number } // age는 모듈 내부 전용
interface FrameInput { t: number; faces: FaceObservation[] }               // t: ms
function ageGateReducer(state: AgeGateState, input: FrameInput, config: Required<...>):
  { state: AgeGateState; update: AgeGateUpdate | null };
function initialAgeGateState(): AgeGateState;
```
프로토타입(`frontend/prototype/flow-logic-PROTOTYPE.html`)의 `FRAME` 처리와 같은 규칙에 8초 타임아웃을 더한 것이다.

## 2. 음성 안내: `createSpeaker`

```ts
interface SpeakerConfig { lang?: string /* 기본 'ko-KR' */; rate?: number /* 기본 0.85 */ }
interface Speaker {
  readonly available: boolean;    // 로컬 한국어 음성이 없으면 false
  readonly voiceName: string | null;
  speak(text: string): Promise<void>; // 읽기가 끝나거나 cancel되면 resolve
  cancel(): void;
}
function createSpeaker(config?: SpeakerConfig): Promise<Speaker>;
```
- `speechSynthesis` 음성 중 `localService === true`인 한국어 음성만 쓴다. 네트워크 음성(예: "Google 한국의")은 쓰지 않는다 (D28, D32).
- `available === false`이면 프론트는 소리 없이 글자만 보여 주고 흐름은 그대로 진행한다. 이 경우 AI가 PM에게 알린다.
- 음성 인식(STT)은 만들지 않는다 (D28, 2차 범위).

## 3. 모델 파일 배치
```
ai/models/                      (git에 올리지 않음)
  face/blaze_face_short_range.tflite
  age/age_estimator.onnx        (10/26 확정 모델로 이름 고정)
  mediapipe-wasm/               (@mediapipe/tasks-vision 패키지의 wasm 폴더 복사)
  ort-wasm/                     (onnxruntime-web 패키지의 wasm 파일 복사)
```
- `npm run models:setup -w ai`로 한 번에 받는다. 이 명령만 인터넷이 필요하고, 실행 중에는 필요 없다.
- Backend가 이 폴더를 `/models/*`로 제공한다 (`api.md`).
- 모델 이름, 버전, 출처, 라이선스, 크기는 `ai/MODELS.md`에 적고 PM 문서에도 남긴다 (D35).
