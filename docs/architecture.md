# 시스템 아키텍처

- 작성: Frontend, Backend, AI 공동 / 승인: PM
- 상태: v1 (2026-10-24)
- 관련 결정: D2, D22, D27, D31, D32, D34, D35, D36

## 1. 전체 구성

노트북 한 대 안에서 모두 돌고, 인터넷을 쓰지 않는다 (D32).

```mermaid
flowchart LR
  subgraph HW[전시 하드웨어 D31]
    CAM[웹캠<br/>모니터 위]
    MON[21인치 세로 모니터<br/>1080x1920 터치]
    SPK[스피커]
  end

  subgraph Chrome[Chrome 키오스크 모드]
    UI[Frontend<br/>React + TS + Vite<br/>화면 상태 리듀서]
    subgraph AI["@menumate/ai (브라우저 안 On-device)"]
      FD[MediaPipe<br/>Face Detector]
      AGE[ONNX Runtime Web<br/>나이 추정]
      GATE[ageGateReducer<br/>55+ 판정·8초 타임아웃]
      TTS[Speaker<br/>OS 내장 한국어 음성]
    end
  end

  subgraph Server["Backend (Node.js + Fastify) :4000"]
    API[/api/*<br/>메뉴·질문·추천·주문·결제/]
    PAY[PaymentGateway<br/>시뮬레이션]
    STATIC[/models/*, /static/*, 프론트 빌드/]
    DB[(SQLite<br/>Prisma)]
  end

  CAM -- 영상 프레임 --> FD --> AGE --> GATE
  GATE -- "senior / non_senior / timeout<br/>(나이 숫자·이미지 없음)" --> UI
  UI -- 질문 문구 --> TTS --> SPK
  UI <-- 터치 --> MON
  UI -- "JSON (연령 정보 없음)" --> API
  API --> PAY
  API --> DB
  STATIC -- 모델·WASM 파일 --> AI
  STATIC -- 화면 파일 --> UI
```

## 2. 데이터 흐름과 개인정보 경계 (D2)

| 데이터 | 생기는 곳 | 가는 곳 | 저장 |
|--------|-----------|---------|------|
| 카메라 프레임 | 브라우저 video | `@menumate/ai` 내부 | **안 함** (추론 후 폐기) |
| 추정 나이 숫자 | `@menumate/ai` 내부 | 모듈 밖으로 안 나감 | **안 함** |
| 연령대 (senior/non_senior) | `@menumate/ai` | Frontend 상태 | 세션 메모리. 초기화 시 삭제. 서버로 안 보냄 |
| 취향 답변 | Frontend | `POST /api/recommendations` | **안 함** (계산만) |
| 주문·결제 결과 | Backend | SQLite | 저장 (메뉴, 수량, 금액, 매장/포장, 주문번호) |

## 3. 폴더 구조 (npm workspaces)

```
MenuMate_V.2.0.0/
  package.json          workspaces: frontend, backend, ai
  docs/                 PM 문서, 계약, 이 문서
    contracts/          menu-schema, api, ai-output, questions, kiosk-flow
  frontend/             Vite React 앱 (@menumate/frontend)
    prototype/          버려질 프로토타입
  backend/              Fastify 서버 (@menumate/backend)
    prisma/  seed/  data/(git 제외)
  ai/                   브라우저 추론 라이브러리 (@menumate/ai)
    src/  models/(git 제외)  MODELS.md
```

- `ai`는 빌드하지 않고 TypeScript 소스를 그대로 export한다. 프론트의 Vite가 함께 번들한다.
- 각 역할은 **자기 폴더만** 고친다. 루트 `package.json`이나 `docs/contracts/`를 고칠 때는 PM 승인을 받는다.
- 루트 `package-lock.json`은 세 브랜치에서 서로 충돌하므로 **각자 브랜치에서는 커밋하지 않는다.** 통합할 때 PM이 한 번 생성해 커밋한다.

## 4. 실행 방법

| 상황 | 명령 | 접속 |
|------|------|------|
| 개발 | `npm run dev -w backend` + `npm run dev -w frontend` | `http://localhost:3000` (Vite가 `/api`, `/static`, `/models`를 `:4000`으로 프록시) |
| 전시 (단일 실행) | `npm run build -w frontend` 후 `npm run start -w backend` | `http://localhost:4000` |
| 키오스크 화면 | Chrome `--kiosk --app=http://localhost:4000` | |

- 카메라는 보안 컨텍스트가 필요한데, `localhost`는 HTTPS 없이도 허용된다.
- Chrome에서 카메라 권한을 한 번 허용해 두면 전시 중 다시 묻지 않는다. 리허설 때 확인한다.

## 5. 역할 간 연결 지점

| 연결 | 계약 | 주관 |
|------|------|------|
| Frontend ↔ Backend | `contracts/api.md` | Backend |
| Frontend ↔ AI | `contracts/ai-output.md` | AI |
| 메뉴 데이터 | `contracts/menu-schema.md` | Backend |
| 질문·추천 점수 | `contracts/questions.md` | AI (계산 구현은 Backend) |
| 화면 흐름 | `contracts/kiosk-flow.md` | Frontend |

## 6. 통합 일정
- 10/24~10/26: 각자 브랜치에서 계약 기준으로 개발. 상대 쪽은 계약대로 만든 가짜 구현(mock)으로 대신한다.
- 10/26(월) 저녁: 세 브랜치를 합쳐 실제로 연결.
- 10/27(화): 최종 점검 (D29).
