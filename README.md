# MenuMate — 우루루 평촌본점 대화형 추천 키오스크

중식 80개 메뉴 앞에서 망설이는 손님이 **직원과 이야기하듯 말로 대화하며** 메뉴를 3개까지 좁히고, 웹캠으로 연령대를 판정해 **글자 크기와 음성 안내를 자동으로 맞추는** 키오스크입니다.

기준 문서는 `docs/00_pm_decisions.md`, 에이전트 규칙은 `CLAUDE.md`입니다.

## 구성 (npm workspaces)

| 폴더 | 역할 | 기술 |
| --- | --- | --- |
| `frontend/` | 키오스크 화면 (`src/kiosk-next/`), 우루루 메뉴·사진·리뷰 데이터 (`src/prototype/menu/`) | React 19 · TypeScript · Vite |
| `backend/` | 메뉴·주문·결제(시뮬레이션) API, 대화(Gemini)·음성(Google TTS)·상황(날씨·시간대·혼잡도) API, 모델 파일 제공 | Fastify 5 · Prisma · SQLite |
| `ai/` | 브라우저 안에서 도는 얼굴 검출·연령대 판정·불편 신호 (`@menumate/ai`) | MediaPipe · ONNX Runtime Web |
| `docs/` | PM 결정, 아키텍처, 환경 변수, 공모전 문서 | |

## 빠른 시작

```bash
npm ci
npm run models:setup -w ai          # 얼굴·연령 모델 내려받기 (최초 1회)
cp backend/.env.example backend/.env  # GEMINI_API_KEY, GOOGLE_TTS_API_KEY 입력
cp frontend/.env.example frontend/.env
npm run db:migrate -w backend && npm run db:seed -w backend
npm run dev -w backend              # http://127.0.0.1:4000
npm run dev -w frontend             # http://localhost:3000  (Chrome, 카메라·마이크 허용)
```

테스트는 워크스페이스마다 `npm test -w <ai|backend|frontend>`.

## 배포

- 프론트: Vercel (`vercel.json`, `main` 브랜치)
- 백엔드: Render (`render.yaml`, 무료 플랜 · SQLite 휘발성)

자세한 환경 변수는 `docs/env-guide.md`, 구조는 `docs/architecture.md`.

## 브랜치 규칙

`main`에는 직접 커밋하지 않고 PR로만 합칩니다. 작업은 `AI` 브랜치에서 하고, push·PR 병합·배포는 사람이 직접 승인합니다 (`CLAUDE.md` 2번).
