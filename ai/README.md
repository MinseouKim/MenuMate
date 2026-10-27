# @menumate/ai

브라우저 안에서 도는 연령 판정 모듈과 음성 안내 모듈. 프론트가 import해서 쓴다.

- 공개 API 계약: [`docs/contracts/ai-output.md`](../docs/contracts/ai-output.md) (여기 적은 내용과 다르면 계약이 우선)
- 모델 정보: [`MODELS.md`](MODELS.md), 후보 비교: [`docs/model-comparison.md`](docs/model-comparison.md)
- 파이프라인 입출력 명세: [`docs/pipeline-io.md`](docs/pipeline-io.md)
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
  // noFaceGraceMs: 실측 후 정함. 기본 0. 빈 값·숫자가 아닌 값은 모두 기본값으로 처리된다
}); // 실패하면 AgeGateError → 터치로 일반 메뉴판 (D46)

const off = gate.onUpdate((u) => dispatch({ type: 'AI', update: u }));
gate.start(videoElement); // 카메라는 프론트가 연다 (getUserMedia)
// 초기화 때: gate.reset()   시연 단축키: gate.force('55plus' | '35to54' | 'under35')  (Shift+S / N / Y)
// decided 이벤트: { group: 'senior' | 'non_senior', ageBand: 'under35' | '35to54' | '55plus', confidence, source }

const speaker = await createSpeaker({ rate: Number(import.meta.env.VITE_TTS_RATE) });
if (speaker.available) await speaker.speak(question.text);
```

## 파이프라인 명세
입력 프레임, 전처리, 모델 입출력 텐서, 후처리, 판정 규칙, 지연 시간 목표는 [`docs/pipeline-io.md`](docs/pipeline-io.md).
후보 모델 비교는 [`docs/model-comparison.md`](docs/model-comparison.md).

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
docs/         파이프라인 명세, 모델 비교
models/       git 제외. models:setup이 채움
```
