# 환경 변수 관리 가이드

- 작성: Frontend, Backend, AI 공동 / 승인: PM
- 상태: v2 (2026-11-02, D90~D96 반영)
- 관련 결정: D13, D28, D32, D35, D36, D90, D91, D92, D93, D94, D96

## 1. 원칙
1. 설정은 각 패키지 폴더의 `.env`에서만 읽는다. 코드에 경로, 포트, 키를 쓰지 않는다.
2. `.env`는 **커밋하지 않는다.** 키 이름과 기본값만 담은 `.env.example`을 커밋한다.
3. 새 변수를 추가하면 같은 커밋에서 `.env.example`과 이 문서를 함께 고친다.
4. 처음 설치할 때: 각 폴더에서 `.env.example`을 `.env`로 복사한다.
5. 경로는 `/`로 쓰고 패키지 폴더 기준 상대 경로로 둔다. Mac과 gram(Windows)에서 같은 `.env`가 동작해야 한다 (D22).

## 2. 외부 API 키 (D90으로 허용)
키는 **Backend `.env`에만** 둔다. `VITE_`로 시작하는 변수는 빌드 결과물에 그대로 들어가 누구나 볼 수 있으므로 비밀 값을 절대 넣지 않는다.

| 키 | 발급처 | 없으면 |
|----|--------|--------|
| `GEMINI_API_KEY` | Google AI Studio | (`LLM_PROVIDER=gemini`일 때) `/api/chat`·`/api/condition-extraction`이 503 → 프론트는 규칙 해석으로 진행 |
| `ANTHROPIC_API_KEY` | Claude Console (서비스 계정 키 권장) | (`LLM_PROVIDER=claude`일 때) 위와 같이 503. Render 무료 플랜은 ID 페더레이션(Managed OIDC, Pro 이상)이 없어 API 키를 쓴다 (D100) |
| `GOOGLE_TTS_API_KEY` | Google Cloud 콘솔 → Text-to-Speech API 활성화 → API 키 (키 제한에 이 API 포함) | `/api/tts`가 503 → 프론트는 브라우저 TTS로 진행 |
| (없음) 날씨 | Open-Meteo는 비상업 용도에 키가 필요 없다 | 실패 시 날씨 null |

- 결제는 시뮬레이션이다 (D13). PG를 붙이면 `PAYMENT_PG_*` 변수를 Backend에 추가한다.
- 얼굴 판정(연령대·불편 신호)은 여전히 브라우저 안 추론이라 키가 없다 (D27, D94).

## 3. Backend (`backend/.env`)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `4000` | API 서버 포트 |
| `HOST` | `127.0.0.1` | 같은 노트북에서만 접속 |
| `DATABASE_URL` | `file:./data/menumate.db` | **DB 접속정보.** SQLite 파일 경로 (Prisma 형식). 상대 경로는 **`backend/` 폴더 기준**이다 (Prisma 기본은 `prisma/` 기준이라 Backend가 래퍼로 맞춤). PostgreSQL로 바꾸면 `postgresql://user:pass@localhost:5432/menumate` 형식으로 바꾸고 `.env`는 절대 커밋하지 않음 |
| `MENU_SEED_FILE` | `./seed/menu.dummy.json` | 시드에 쓸 메뉴 JSON. 우루루 실데이터가 오면 이 값만 바꿈 (D33) |
| `MENU_IMAGE_DIR` | `./data/menu-images` | 메뉴 사진 폴더 → `/static/menu-images/*` |
| `MODEL_DIR` | `../ai/models` | **AI 모델 경로.** 이 폴더를 `/models/*`로 제공 |
| `FRONTEND_DIST` | `../frontend/dist` | 전시용 단일 실행 시 제공할 프론트 빌드 폴더 |
| `PAYMENT_MODE` | `simulate` | 지금은 `simulate`만 지원 |
| `PAYMENT_SIM_RESULT` | `success` | 요청에 `simulate`가 없을 때의 결과 (`success` / `fail`) |
| `PAYMENT_SIM_DELAY_MS` | `1500` | 결제 중 화면을 보여 줄 지연 시간 |
| `TZ` | `Asia/Seoul` | 주문번호 날짜·시간대(`/api/context`) 기준 |
| `CORS_ORIGIN` | (빈 값 = 모두 허용) | 허용할 브라우저 출처, 쉼표 구분. 배포: `https://menumate-dl.vercel.app` (D96) |
| `LLM_PROVIDER` | `gemini` | 대화형 추천 AI. `gemini` 또는 `claude` (D100). 다른 값이면 서버가 뜨기 전에 오류 |
| `ANTHROPIC_API_KEY` | (없음) | `LLM_PROVIDER=claude`일 때. 2장 참고 |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | 더 똑똑하게 `claude-opus-5-5`, 더 빠르고 싸게 `claude-haiku-5-5`(거절 시 대체 실행 없음) |
| `CLAUDE_EFFORT` | `medium` | 생각하는 깊이 `low`/`medium`/`high`/`xhigh`/`max`. 높을수록 느리고 비싸다 |
| `GEMINI_API_KEY` | (없음) | 대화형 추천 (D91). 2장 참고 |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | 가장 빠른 모델(키오스크 대기 시간 기준). 품질 우선이면 `gemini-3.8-flash` |
| `GOOGLE_TTS_API_KEY` | (없음) | 음성 안내 (D92). 2장 참고 |
| `TTS_VOICE` | `ko-KR-Chirp3-HD-Leda` | Google TTS 목소리 이름. ko-KR Chirp3-HD 30종 중 선택 |
| `WEATHER_LAT` / `WEATHER_LON` | `37.3943` / `126.9568` | 날씨를 볼 매장 좌표 (우루루 평촌본점 근처) |
| `CONTEXT_CROWD_WINDOW_MIN` | `15` | 혼잡도: 최근 N분 결제 완료 주문 수 (D93) |
| `MENU_DATA_DIR` | `../frontend/src/prototype/menu` | 대화가 읽는 우루루 메뉴·리뷰 데이터 폴더 |
| `CHAT_RECORD_DIR` | (빈 값 = 기록 안 함) | **로컬 시험 전용.** 값이 있으면 `/api/chat` 호출마다 이 폴더(`backend/` 기준)의 `<KST 날짜>.jsonl`에 대화·요청 조건·응답·걸린 시간을 한 줄씩 남긴다(실패는 `error`). 대화 글자만 남고 키·IP·얼굴·나이·날씨는 남지 않는다. **Render에는 넣지 않는다.** 예: `../eval/live/raw` → `npx tsx backend/scripts/live-cases.ts`로 대화 단위 케이스·채점(`eval/live/`), `... live-cases.ts replay [--offline]`로 지금 코드에 다시 넣어 보기 |

Render에서는 `HOST=0.0.0.0`으로 두고 `PORT`는 Render가 넣어 준다 (`render.yaml`).

## 4. Frontend (`frontend/.env`)
모두 `VITE_` 접두사. **비밀 값 금지.**

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `VITE_API_BASE_URL` | (빈 값) | 빈 값이면 같은 origin. 개발 중에는 Vite 프록시가 `/api`·`/models`·`/static`을 `localhost:4000`으로 보냄. Vercel 배포에서는 Render 주소 (D96) |
| `VITE_FACE_MODEL_URL` | `{API}/models/face/blaze_face_short_range.tflite` | 얼굴 검출 모델. 비우면 `VITE_API_BASE_URL` 아래 경로 |
| `VITE_LANDMARKER_MODEL_URL` | `{API}/models/face/face_landmarker.task` | 불편 신호(랜드마크) 모델 (D94) |
| `VITE_AGE_MODEL_URL` | `{API}/models/age/age_estimator.onnx` | 나이 추정 모델 |
| `VITE_MEDIAPIPE_WASM_URL` | `{API}/models/mediapipe-wasm` | MediaPipe WASM 폴더 |
| `VITE_ORT_WASM_URL` | `{API}/models/ort-wasm/` | ONNX Runtime WASM 폴더 |
| `VITE_STT_MODEL_URL` | `{API}/models/stt/` | Whisper 대체 수단 모델 폴더 (배포 서버에 없으면 대체 수단 꺼짐) |
| `VITE_TTS_SERVER` | `true` | 서버 Google TTS 먼저 (D92). `false`면 브라우저 TTS만 |
| `VITE_CHAT_SERVER` | `true` | 서버 대화형 추천 (D91). `false`면 규칙 해석만 |
| `VITE_FACE_SIGNALS` | `true` | 카메라 불편 신호 → 큰 글씨 제안 (D94). `false`면 연령 판정 뒤 카메라를 끔 |
| `VITE_AI_STABLE_FRAMES` | `5` | 판정 확정에 필요한 연속 프레임 |
| `VITE_AI_MIN_CONFIDENCE` | `0.7` | 판정에 쓰는 최소 신뢰도 |
| `VITE_AI_DECIDE_TIMEOUT_MS` | `8000` | 판정 타임아웃 (D16) |
| `VITE_AI_NO_FACE_GRACE_MS` | `0` | 얼굴 검출이 잠깐 끊겨도 연속 기록을 유지하는 시간. 0이면 바로 no_face. 웹캠 실측 후 조정 |
| `VITE_IDLE_RESET_MS` | `60000` | 무입력 초기화 (D30) |
| `VITE_DONE_RESET_MS` | `15000` | 주문번호 화면 초기화 (D30, D68에서 15초로) |
| `VITE_TTS_RATE` | `0.85` | 음성 안내 속도 |
| `VITE_MOCK_AI` | `false` | 가짜 AgeGate/Speaker/FaceSignals 사용(개발용). **production 빌드에서 true면 빌드 실패** |
| `VITE_MOCK_API` | `false` | 가짜 Backend 사용(개발용). **production 빌드에서 true면 빌드 실패** |
| `VITE_DEV_SHORTCUTS` | `true` | 시연용 단축키 (D24). 관람객용 빌드에서도 켜 두되 화면에는 표시 안 함 |
| `VITE_RECOMMEND_LAYOUT` | `a` | 간편주문(말로 추천) 화면 안. `a` 직원과 마주 앉기 / `b` 눌러서 답하기(큰 선택 카드, 글자 1.2배) / `c` 한눈에 정리(이해한 것 패널). 주소 `?rec=b`가 우선 (2026-11-02 캔버스 3안) |

AI 판정 기준값(프레임, 신뢰도)은 AI가 실측 후 값을 정하고, 전시장에서 `.env`만 바꿔 조정한다.

## 5. AI (`ai/`)
AI 패키지는 프론트가 import하는 라이브러리라 자체 `.env`가 없다. 모델 URL과 기준값은 프론트 `.env`에서 넘겨받는다.

| 항목 | 위치 |
|------|------|
| 모델 파일 실제 위치 | `ai/models/` (git 제외). Backend `MODEL_DIR`이 가리킴 |
| 모델 받기 | `npm run models:setup -w ai` (얼굴 검출·랜드마크·나이 모델과 WASM. Render 빌드에서도 실행) |
| 모델 정보 | `ai/MODELS.md` (이름, 버전, 출처, 라이선스, 크기) |

## 6. git에서 제외하는 것
`.env`, `backend/data/`(SQLite 파일, 사진), `ai/models/`, `node_modules/`, `dist/`
