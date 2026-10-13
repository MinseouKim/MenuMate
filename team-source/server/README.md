# kiosk-server

음성인식 메뉴 추천 키오스크 — 백엔드 (Node.js + TypeScript + Express + MySQL 8, ORM 미사용).

## 특징

- SQL 마이그레이션 + Repository 패턴 (ORM 없음, `mysql2/promise` 커넥션 풀로 직접 파라미터 바인딩 쿼리)
- 메뉴 데이터는 특정 매장에 코드가 고정되지 않도록 `stores` 테이블로 매장을 분리 — 다른 매장을 추가할 때 메뉴/태그/근거 행만 추가하면 추천 엔진·API 코드는 그대로 재사용된다.
- `menu_ingredient_notices`는 "알레르기 안전 보장" 테이블이 아니다. `confirmed`/`inferred_from_menu_name` 상태만 추천 하드 필터 근거로 쓰고, `unknown`은 쓰지 않는다. 모든 추천 응답에는 `allergy_safety_notice`("알레르기 및 교차접촉 여부는 매장에 직접 확인해 주세요. 본 추천은 안전성을 보장하지 않습니다.")를 항상 포함한다.
- `menu_evidences.source_type = manual_public_review_aggregate`(팀이 수기로 집계한 공개 리뷰 경향)는 맛/식감/선호 경향에만 쓸 수 있고, 가격·품절·재료·알레르기 관련 필드에는 쓸 수 없다 — zod 스키마(`src/schemas/menuEvidence.schema.ts`)가 이를 거부한다.
- LLM API 호출은 이 서버에서만 수행한다. 프론트엔드의 `VITE_` 환경변수에는 비밀 키를 두지 않는다.
- 조건 추출/추천 로직은 프론트엔드 프로토타입(`work/src/services/...`)의 규칙 기반 로직을 그대로 포팅해 일관성을 유지했다.

## 폴더 구조

```
server/
  src/
    app.ts            # Express 앱 조립 (의존성 주입: repositories를 인자로 받음)
    server.ts          # 실제 MySQL 풀로 앱을 띄우는 진입점
    config/env.ts       # 환경변수 zod 검증
    db/pool.ts          # mysql2/promise 커넥션 풀
    db/runMigrations.ts  # sql/*.sql을 순서대로 적용하는 간단한 마이그레이션 러너
    routes/              # Express 라우터
    controllers/          # 요청 처리 (얇게 — 검증된 입력을 서비스/레포지토리로 전달)
    services/             # 조건 추출(규칙기반/LLM), 추천 엔진 — 순수 로직 위주
    repositories/          # DB 접근 — 인터페이스(types.ts) + MySQL 구현체
    schemas/               # zod 입력 검증 스키마
    middleware/            # 공통 에러 핸들러, zod 검증 미들웨어
    types/                 # 도메인 타입
  sql/
    001_init.sql           # 스키마
    002_seed_placeholder.sql # 플레이스홀더(예시) 시드 데이터 — "우루루 본점"
  tests/
    unit/                  # DB 없이 도는 순수 로직 테스트
    integration/            # 실제 MySQL/MariaDB가 필요한 테스트
    api.test.ts              # 인메모리 레포지토리로 API 레이어만 검증 (DB 불필요)
    fakes/                    # 테스트용 인메모리 Repository 구현
```

## 실행 방법

### 1. DB 준비 (MySQL 8 또는 호환 MariaDB)

```sql
CREATE DATABASE kiosk_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'kiosk_app'@'%' IDENTIFIED BY '원하는_비밀번호';
GRANT ALL PRIVILEGES ON kiosk_dev.* TO 'kiosk_app'@'%';
```

`.env.example`을 복사해 `.env`로 만들고 DB 접속 정보를 채운다.

```bash
cp .env.example .env
# .env 수정 후:
npm install
npm run migrate   # sql/001_init.sql, 002_seed_placeholder.sql 순서대로 적용
```

### 2. 서버 실행

```bash
npm run dev     # 개발 서버 (tsx watch)
npm run build   # 프로덕션 빌드 (tsc) → dist/
npm start       # 빌드된 서버 실행
```

### 3. 테스트

```bash
npm test
```

`tests/api.test.ts`(인메모리 레포지토리)는 DB 없이 바로 돈다. `tests/unit/*`도 DB가 필요 없는 순수 로직 테스트다.
`tests/integration/*`는 실제 MySQL/MariaDB가 필요하다 — `kiosk_test`라는 이름의 별도 DB를 하나 더 만들고 동일하게 마이그레이션을 적용한 뒤, `vitest.config.ts`가 자동으로 읽는 `.env.test`(이미 포함되어 있음 — 로컬 테스트 전용 값이라 git에 포함해도 안전)의 값으로 접속한다.

```sql
CREATE DATABASE kiosk_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'kiosk_app'@'%' IDENTIFIED BY 'kiosk_app_pw';
GRANT ALL PRIVILEGES ON kiosk_test.* TO 'kiosk_app'@'%';
```

```bash
DB_NAME=kiosk_test DB_USER=kiosk_app DB_PASSWORD=kiosk_app_pw npm run migrate
npm test
```

개발 중 이 저장소를 작업한 클라우드 환경에서는 로컬 MariaDB 10.11에 `kiosk_dev`/`kiosk_test` 두 DB를 만들어 실제로 마이그레이션 적용 + 전체 테스트(31개, 유닛+실제 DB 연동 통합 테스트 포함) 통과를 확인했다.

## API

모든 에러 응답은 다음 형식이다:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/health` | 헬스체크 |
| GET | `/api/stores` | 매장 목록 |
| GET | `/api/stores/:slug` | 매장 단건 |
| GET | `/api/stores/:slug/menus` | 매장의 메뉴(+태그/페어링/재료 노티스/근거) 목록 |
| POST | `/api/condition-extraction` | `{ utterance }` → 구조화된 조건(JSON) 추출. LLM 미설정 시 규칙 기반 |
| POST | `/api/stores/:slug/recommendations` | `{ conditions, vision? }` → 추천 결과 + `allergy_safety_notice` |
| POST | `/api/stores/:slug/menus/:menuId/evidences` | 메뉴 근거 추가 (관리용, `manual_public_review_aggregate` 제약 검증) |

## 남은 작업 / 교체 필요

- `sql/002_seed_placeholder.sql`은 전부 `[예시]`로 표시된 플레이스홀더다. 실제 "우루루 본점" 메뉴/가격/재료/근거로 교체해야 한다 (팀 시식 → 점주 확인 → 동의 후기 순으로 수집).
- 프론트엔드가 아직 이 API를 호출하지 않는다 (이번 작업 범위는 백엔드 + 프론트엔드 안내문구 최소 수정까지). 프론트엔드의 로컬 `menu.sample.json`/`ruleBasedEngine`을 이 API 호출로 교체하는 작업이 남아있다.
- 프론트엔드 `src/services/conditionExtractor/llmConditionExtractor.ts`는 현재도 브라우저에서 `VITE_LLM_API_KEY`로 LLM을 직접 호출한다 — 이 저장소의 보안 원칙(LLM 키는 백엔드에만)과 어긋나므로, 프론트가 이 서버의 `POST /api/condition-extraction`을 호출하도록 바꾸고 `VITE_LLM_*` 환경변수는 제거하는 것을 권장한다 (이번 작업 범위 밖이라 코드는 건드리지 않음).
- 인증/권한 없이 모든 엔드포인트가 열려 있다 — 관리용 근거 추가 API(`POST .../evidences`)는 최소한 매장 관리자 인증이 붙어야 한다.
