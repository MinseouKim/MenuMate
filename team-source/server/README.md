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
  scripts/
    buildUruruSeed.ts      # (레거시) menus.json → sql/seeds/ururu_menus.sql. kind/external_id/is_featured는 채우지 않음
  sql/
    001_init.sql           # 스키마
    002_seed_placeholder.sql # 플레이스홀더(예시) 시드 데이터 — "우루루 본점"
    003_admin.sql           # 점주 로그인 계정 + 추천 세트 테이블
    004_kind_and_external_id.sql # menus에 kind/external_id/is_featured/featured_rank 컬럼 추가
    seeds/ururu_menus.sql   # scripts/buildUruruSeed.ts 결과물(수동 실행, migrate 대상 아님)
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
# .env 수정 후 (ADMIN_JWT_SECRET은 전시/배포 전 반드시 고유 값으로 바꿀 것):
npm install
npm run migrate   # sql/ 아래 *.sql을 파일명 순서대로 적용 (schema_migrations에 기록, 재실행해도 안전)
```

이미 과거에 `001`~`003`을 수동으로 적용해 둔 DB에 이 마이그레이션 추적 기능을 처음 도입하는 경우, 먼저 `npm run migrate:bootstrap`으로 "이미 적용됨"만 기록한 뒤(SQL을 다시 실행하지 않음) `npm run migrate`를 실행한다.

### 1-1. 실제 메뉴 데이터 넣기 (선택)

키오스크 화면의 메뉴 데이터(`team-source/src/prototype/menu/menus.json`)를 관리자 DB로 가져오면, 관리자 화면에서 이름/가격/kind/맵기/품절/추천 여부를 고칠 때 키오스크가 `external_id`로 짝을 맞춰 그 값을 실시간으로 반영한다.

```bash
npm run import:real-menu -- --slug ururu-headquarters
```

다시 실행하면 해당 매장의 기존 메뉴를 지우고 menus.json 내용으로 새로 채운다(메뉴판이 바뀌면 다시 실행). 점주 관리자 로그인 계정이 필요하면 `npm run seed:admin`도 실행한다.

`scripts/buildUruruSeed.ts`(`npm run seed:build`)는 더 단순한 과거 경로로 남겨 두었다 — `kind`/`external_id`/`is_featured`/`featured_rank`를 채우지 않으므로, 관리자 화면에서 메뉴를 고칠 계획이 없을 때만 쓴다.

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
| POST | `/api/stores/:slug/orders` | 결제 완료 주문 저장(매출 집계·영수증 재발급용). 키오스크가 손님 응대 중 호출하는 공개 API라 로그인 없음. 1분당 요청 수 제한 없음(관리자 로그인과 달리 브루트포스 대상이 아님) |

### 점주 관리자 API (로그인 필요, `Authorization: Bearer <token>`)

| Method | Path | 설명 |
| --- | --- | --- |
| POST | `/api/admin/login` | `{ username, password }` → JWT 발급 |
| POST | `/api/admin/stores/:slug/menus` | 메뉴 추가 |
| PATCH | `/api/admin/stores/:slug/menus/:menuId` | 메뉴 수정 (이름/가격/kind/맵기/품절/추천 여부·순위 등 일부 필드) |
| DELETE | `/api/admin/stores/:slug/menus/:menuId` | 메뉴 삭제 |
| POST/DELETE | `/api/admin/stores/:slug/menus/:menuId/ingredient-notices[/:ingredientName]` | 재료 노티스 추가/삭제 |
| GET/POST | `/api/admin/stores/:slug/featured-sets` | 추천 세트 목록/생성 |
| PATCH/DELETE | `/api/admin/stores/:slug/featured-sets/:setId` | 추천 세트 수정/삭제 |

`is_featured`/`featured_rank`로 지정한 메뉴와 추천 세트는 `recommendationService.ts`의 점수 계산에서 가점(`OWNER_FEATURED_BONUS`)을 받지만, 품절·제외 재료 등 안전 하드 필터는 그대로 적용된다. 점주 관리자 화면은 별도 패키지 `admin-app/`(React + Vite)에 있다 — `npm --prefix admin-app install && npm --prefix admin-app run dev`로 실행하고 `admin-app/.env`의 `VITE_API_BASE`가 이 서버를 가리키게 한다.

## 키오스크 ↔ 서버 실시간 연동

`VITE_API_BASE_URL`이 설정돼 있으면 키오스크(`team-source/src/prototype`)는:

- 조건 해석을 이 서버의 LLM(실패 시 규칙 기반)으로 한 번 더 보강하고 (`POST /api/condition-extraction`),
- 1분마다 `GET /api/stores/:slug/menus`를 불러와 **이름/가격/종류/맵기/품절/추천 지정 여부**만 `external_id`로 짝을 맞춰 겹쳐 쓰고(`src/prototype/menuLive.ts`) — 설명·리뷰·사진 같은 전시용 콘텐츠는 이 DB에 애초에 없는 필드라 항상 번들된 `menus.json` 그대로 쓴다,
- 점주가 "추천 메뉴"로 지정한 메뉴(`is_featured`)는 키오스크 자체 추천 로직(`recommendation.ts`)에서 가점을 받는다,
- 결제가 끝나면 주문을 `POST /api/stores/:slug/orders`로 저장한다(`src/prototype/orderClient.ts`, 실패해도 결제 완료 화면은 그대로 진행).

서버가 없거나 응답이 없으면 전부 조용히 포기하고 번들 데이터·클라이언트 규칙으로만 동작한다 — 키오스크는 네트워크가 끊겨도 손님 응대를 계속해야 하기 때문이다.

## 운영 배포 전 보안 체크리스트

- `NODE_ENV=production`으로 띄우면 `ADMIN_JWT_SECRET`이 비어 있을 때 서버가 시작하지 않는다 — `openssl rand -hex 32` 같은 고유 값을 반드시 넣어야 한다. (개발/테스트에서는 비워 두면 알려진 개발용 기본값을 쓴다.)
- `CORS_ORIGIN`을 실제 키오스크·관리자 화면 배포 도메인으로 좁혀야 한다(쉼표로 여러 개 가능). `production`에서 여전히 `localhost`면 시작 로그에 경고가 찍힌다.
- `POST /api/admin/login`(IP당 15분 10회)과 `POST /api/condition-extraction`(IP당 1분 20회)에 rate limit이 걸려 있다(`src/middleware/rateLimit.ts`) — brute-force·LLM 비용 남용 방지용. 여러 서버 인스턴스로 수평 확장하면 메모리 기반 저장소를 Redis 등 공유 저장소로 바꿔야 한다.
- DB 계정은 예시(`kiosk_app`/`1234`)를 그대로 쓰지 말고 운영용 비밀번호로 바꾼다.

## 남은 작업 / 교체 필요

- `sql/002_seed_placeholder.sql`은 전부 `[예시]`로 표시된 플레이스홀더다. `npm run import:real-menu`로 실제 "우루루 본점" 메뉴로 교체할 수 있다(위 1-1절).
- 실제 결제(PG 연동)는 아직 없다 — 지금의 "결제 완료"는 전시 체험용으로, 버튼을 누르면 바로 완료 처리된다. 실제 서비스로 가려면 PG사 연동과 결제 상태(대기/완료/실패) 추적이 필요하다.
- 여러 대의 키오스크가 한 매장에 있을 때, 품절 처리 같은 변경이 더 빠르게 퍼지길 원하면 1분 polling보다 짧은 주기나 웹소켓/SSE push로 바꾸는 걸 고려할 수 있다.
