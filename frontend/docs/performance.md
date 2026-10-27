# 로딩·구조 점검 (v2)

- 작성: Frontend / 2026-10-27 / 관련 결정: D79, D46(모델 로딩 중에도 대기 화면)
- 기준: `vercel-react-best-practices` 규칙 중 이 앱(키오스크, SPA, 로컬 실행)에 해당하는 것

## 1. 빌드 묶음 (`VITE_MOCK_*=false`, production)

| 묶음 | 크기 (gzip) | 언제 받나 |
|------|------------|----------|
| `index` (앱 코드) | 38 KB (12 KB) | 처음 |
| `react` | 219 KB (68 KB) | 처음 (modulepreload) |
| `src` (@menumate/ai) | 9 KB (4 KB) | 대기 화면이 뜬 뒤 동적 import |
| `mediapipe` | 154 KB (45 KB) | 위와 같이, 병렬로 |
| `onnxruntime` | 403 KB (109 KB) | 위와 같이, 병렬로 |
| ONNX WASM, 나이 모델(약 345MB) | | AI 모듈이 받는다 (`/models/*`) |

- 이전에는 AI 묶음이 566 KB 한 덩어리였다(500 KB 경고). `vite.config.ts`의 `codeSplitting.groups`(`src/mocks/buildChunks.ts`)로 나눴다. 묶음 규칙은 테스트로 고정.
- 처음 받는 것은 앱 + React뿐이다. AI 묶음과 모델은 대기 화면을 그린 뒤 받으므로, 모델을 받는 동안에도 대기 화면·버튼·단축키가 바로 동작한다 (D46, 테스트로 고정).
- 서체: Pretendard는 글자 범위별로 나뉜 파일이라 화면에 쓰는 글자의 파일만 받는다. Black Han Sans는 한글 1개 파일.

## 2. 점검 결과

| 규칙 | 결과 |
|------|------|
| `bundle-dynamic-imports`, `bundle-conditional` | AI 모듈은 `loadAi()`에서만 동적 import. 가짜 Backend·가짜 AI는 production 빌드에 들어가지 않음 (빌드 가드) |
| `advanced-init-once` | AI 모듈과 모델은 앱당 한 번만 불러옴 (`loadAi` 캐시). 개발 모드 StrictMode에서도 두 번 받지 않음 |
| `async-parallel` | 메뉴와 질문은 `Promise.all`로 동시에. 음성과 판정기도 따로 준비돼 음성이 모델을 기다리지 않음 |
| `rerender-derived-state-no-effect` | 메뉴판 쪽 번호, 깨진 사진 처리를 effect 대신 렌더 중 계산으로 |
| `rerender-move-effect-to-event` | 담기·빼기 음성은 누른 순간(명령 함수)에서, 화면 안내 음성만 화면 전환 effect에서 |
| `client-event-listeners` | 전역 리스너는 pointerdown(무입력 타이머)과 keydown(시연 단축키) 두 개, 각각 한 번만 등록 |
| `rendering-conditional-render` | 숫자 0이 그대로 그려지는 `count && …` 패턴 없음 |
| 사진 자리 | `<img width height>`로 4:3 자리를 미리 잡아 사진이 늦게 와도 화면이 움직이지 않음 |

## 3. 남은 것
- 실제 21인치 모니터와 gram(Windows)에서 첫 화면까지 걸리는 시간 측정 (10/31 최종 점검)
- 나이 모델(약 345MB) 첫 로딩 시간은 AI 모듈 몫. 로딩 중에도 흐름은 막히지 않는다
