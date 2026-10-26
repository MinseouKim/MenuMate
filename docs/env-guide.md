# 환경 변수 관리 가이드

- 작성: Frontend, Backend, AI 공동 / 승인: PM
- 상태: v1 (2026-10-24)
- 관련 결정: D13, D28, D32, D35, D36

## 1. 원칙
1. 설정은 각 패키지 폴더의 `.env`에서만 읽는다. 코드에 경로, 포트, 키를 쓰지 않는다.
2. `.env`는 **커밋하지 않는다.** 키 이름과 기본값만 담은 `.env.example`을 커밋한다.
3. 새 변수를 추가하면 같은 커밋에서 `.env.example`과 이 문서를 함께 고친다.
4. 처음 설치할 때: 각 폴더에서 `.env.example`을 `.env`로 복사한다.
5. 경로는 `/`로 쓰고 패키지 폴더 기준 상대 경로로 둔다. Mac과 gram(Windows)에서 같은 `.env`가 동작해야 한다 (D22).

## 2. 외부 API 키
**현재 필요한 외부 API 키는 없다.**
- 결제는 시뮬레이션이다 (D13). PG를 붙이면 `PAYMENT_PG_*` 변수를 Backend에 추가한다.
- TTS는 OS 내장 음성, AI는 브라우저 안 추론이다 (D28, D27). 클라우드 AI 키를 쓰지 않는다.
- 나중에 키가 생기면 **Backend `.env`에만** 둔다. `VITE_`로 시작하는 변수는 빌드 결과물에 그대로 들어가 누구나 볼 수 있으므로 비밀 값을 절대 넣지 않는다.

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
| `TZ` | `Asia/Seoul` | 주문번호 날짜 기준 |

## 4. Frontend (`frontend/.env`)
모두 `VITE_` 접두사. **비밀 값 금지.**

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `VITE_API_BASE_URL` | (빈 값) | 빈 값이면 같은 origin. 개발 중에는 Vite 프록시가 `localhost:4000`으로 보냄 |
| `VITE_FACE_MODEL_URL` | `/models/face/blaze_face_short_range.tflite` | 얼굴 검출 모델 |
| `VITE_AGE_MODEL_URL` | `/models/age/age_estimator.onnx` | 나이 추정 모델 |
| `VITE_MEDIAPIPE_WASM_URL` | `/models/mediapipe-wasm` | MediaPipe WASM 폴더 |
| `VITE_ORT_WASM_URL` | `/models/ort-wasm/` | ONNX Runtime WASM 폴더 |
| `VITE_AI_STABLE_FRAMES` | `5` | 판정 확정에 필요한 연속 프레임 |
| `VITE_AI_MIN_CONFIDENCE` | `0.7` | 판정에 쓰는 최소 신뢰도 |
| `VITE_AI_DECIDE_TIMEOUT_MS` | `8000` | 판정 타임아웃 (D16) |
| `VITE_AI_NO_FACE_GRACE_MS` | `0` | 얼굴 검출이 잠깐 끊겨도 연속 기록을 유지하는 시간. 0이면 바로 no_face. 웹캠 실측 후 조정 |
| `VITE_IDLE_RESET_MS` | `60000` | 무입력 초기화 (D30) |
| `VITE_DONE_RESET_MS` | `15000` | 주문번호 화면 초기화 (D30, D68에서 15초로) |
| `VITE_TTS_RATE` | `0.85` | 음성 안내 속도 |
| `VITE_MOCK_AI` | `true` | 가짜 AgeGate/Speaker 사용. 통합 후 `false`. **production 빌드에서 true면 빌드 실패** |
| `VITE_MOCK_API` | `true` | 가짜 Backend 사용. 통합 후 `false`. **production 빌드에서 true면 빌드 실패** |
| `VITE_DEV_SHORTCUTS` | `true` | 시연용 단축키 (D24). 관람객용 빌드에서도 켜 두되 화면에는 표시 안 함 |

AI 판정 기준값(프레임, 신뢰도)은 AI가 실측 후 값을 정하고, 전시장에서 `.env`만 바꿔 조정한다.

## 5. AI (`ai/`)
AI 패키지는 프론트가 import하는 라이브러리라 자체 `.env`가 없다. 모델 URL과 기준값은 프론트 `.env`에서 넘겨받는다.

| 항목 | 위치 |
|------|------|
| 모델 파일 실제 위치 | `ai/models/` (git 제외). Backend `MODEL_DIR`이 가리킴 |
| 모델 받기 | `npm run models:setup -w ai` (이 명령만 인터넷 필요) |
| 모델 정보 | `ai/MODELS.md` (이름, 버전, 출처, 라이선스, 크기) |

## 6. git에서 제외하는 것
`.env`, `backend/data/`(SQLite 파일, 사진), `ai/models/`, `node_modules/`, `dist/`
