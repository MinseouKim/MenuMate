-- ============================================================================
-- menumate DB 처음부터 한 번에 설정 (MySQL Workbench에서 root로 이 파일 전체 실행)
-- ============================================================================
-- sql/001~005 마이그레이션을 순서대로 합치고, 마지막에 schema_migrations에 "적용됨"으로 기록한다.
-- 그래서 이 파일을 실행한 뒤 npm run migrate 를 돌려도 같은 SQL을 다시 실행하지 않는다
-- (새 마이그레이션 006_ 이후만 적용된다). migrate:bootstrap 은 필요 없다.
--
-- 이 파일은 sql/manual/ 안에 있어서 npm run migrate 가 자동으로 실행하지 않는다.
-- sql/0xx 파일을 고치면 이 파일도 다시 만들어야 한다 (내용은 그 파일들을 그대로 복사한 것).
--
-- 주의: 완전히 새로 시작할 때만 실행한다. 이미 kiosk_dev 를 만들어 썼다면 아래 0)의 DROP을
--       주석 해제해서 지우고 시작하거나, 이 파일 대신 npm run migrate:bootstrap → npm run migrate 를 쓴다.
--
-- 이 파일이 하지 않는 것 (터미널에서 team-source/server 폴더 기준):
--   1) 실제 메뉴 80개 + 리뷰 근거 넣기:  npm run import:real-data
--   2) 점주 로그인 계정 만들기:         npm run seed:admin -- --password <비밀번호>
--      (비밀번호 해시를 SQL 파일에 박아 두지 않으려고 계정 생성은 스크립트로만 한다)
-- ============================================================================

SET NAMES utf8mb4;  -- 한글(매장명·메뉴명)이 깨지지 않게 접속 문자셋을 맞춘다

-- 0) 데이터베이스 + 앱 전용 계정 ------------------------------------------------
-- DROP DATABASE IF EXISTS kiosk_dev;   -- 처음부터 다시 만들 때만 주석 해제

CREATE DATABASE IF NOT EXISTS kiosk_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ↓ 'change-this-db-password' 를 원하는 비밀번호로 바꾸고, team-source/server/.env 의
--   DB_USER=kiosk_app / DB_PASSWORD=<같은 비밀번호> 로 맞춘다.
CREATE USER IF NOT EXISTS 'kiosk_app'@'localhost' IDENTIFIED BY 'change-this-db-password';
CREATE USER IF NOT EXISTS 'kiosk_app'@'127.0.0.1' IDENTIFIED BY 'change-this-db-password';
GRANT ALL PRIVILEGES ON kiosk_dev.* TO 'kiosk_app'@'localhost';
GRANT ALL PRIVILEGES ON kiosk_dev.* TO 'kiosk_app'@'127.0.0.1';
FLUSH PRIVILEGES;

USE kiosk_dev;

-- ============================================================================
-- 001_init.sql
-- ============================================================================
-- 001_init.sql
-- 음성인식 메뉴 추천 키오스크 — 백엔드 초기 스키마
--
-- 설계 원칙:
-- - 특정 매장(가게)에 코드가 고정되지 않도록, 모든 메뉴/태그/근거 데이터는 stores.id 로만 연결된다.
--   나중에 다른 매장을 추가할 때는 stores + menus(+연관 테이블) 행만 추가하면 되고,
--   추천 엔진/API 코드는 그대로 재사용 가능해야 한다.
-- - menu_ingredient_notices 는 "알레르기 안전 여부 판단" 테이블이 아니다. 확인된 재료 정보만 기록하고,
--   추천 엔진은 이 테이블을 근거로 "안전하다"고 단정하지 않는다 (서비스 레이어에서 강제).
-- - menu_evidences 는 메뉴 속성(맛/식감/선호 경향 등)에 대한 근거만 저장하고, 리뷰 원문/작성자/링크/사진은
--   저장하지 않는다. manual_public_review_aggregate 소스는 가격/품절/재료/알레르기 필드에는 쓸 수 없다
--   (애플리케이션 레벨에서 zod 스키마로 검증).
--
-- 대상 DB: MySQL 8 (개발/통합 테스트는 호환성이 높은 MariaDB 10.11에서도 실행 확인함).

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- stores: 매장
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stores (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug          VARCHAR(100)    NOT NULL,
  name          VARCHAR(200)    NOT NULL,
  -- 이 매장의 메뉴 데이터셋 전체가 "언제 기준으로" 정리되었는지 (교수님 피드백: 수집 기준 시점 명시 필수)
  dataset_as_of DATE            NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stores_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- menus: 메뉴
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menus (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id    BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(200)    NOT NULL,
  price       INT UNSIGNED    NOT NULL,
  category    ENUM('main','side','drink') NOT NULL,
  -- 0 (안 매움) ~ 3 (아주 매움)
  spicy_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
  serving_size     VARCHAR(100)    NULL,
  sold_out    BOOLEAN         NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_menus_store_id (store_id),
  KEY idx_menus_store_category (store_id, category),
  CONSTRAINT fk_menus_store
    FOREIGN KEY (store_id) REFERENCES stores(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_menus_spicy_level CHECK (spicy_level BETWEEN 0 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- menu_tags: 메뉴 속성 태그 (맛/식감/키워드/동의어/식단)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_tags (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  menu_id   BIGINT UNSIGNED NOT NULL,
  tag_type  ENUM('flavor','texture','keyword','synonym','dietary') NOT NULL,
  tag       VARCHAR(100)    NOT NULL,
  PRIMARY KEY (id),
  KEY idx_menu_tags_menu_id (menu_id),
  KEY idx_menu_tags_type_tag (tag_type, tag),
  CONSTRAINT fk_menu_tags_menu
    FOREIGN KEY (menu_id) REFERENCES menus(id)
    ON DELETE CASCADE,
  CONSTRAINT uq_menu_tags_menu_type_tag UNIQUE (menu_id, tag_type, tag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- menu_pairings: 메인-사이드 조합 추천용
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_pairings (
  menu_id        BIGINT UNSIGNED NOT NULL,
  paired_menu_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (menu_id, paired_menu_id),
  CONSTRAINT fk_menu_pairings_menu
    FOREIGN KEY (menu_id) REFERENCES menus(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_menu_pairings_paired_menu
    FOREIGN KEY (paired_menu_id) REFERENCES menus(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_menu_pairings_not_self CHECK (menu_id <> paired_menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- menu_ingredient_notices: 확인된 재료 정보 (알레르기 "안전 보장" 테이블이 아님)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_ingredient_notices (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  menu_id         BIGINT UNSIGNED NOT NULL,
  ingredient_name VARCHAR(100)    NOT NULL,
  -- confirmed: 공식 메뉴판/점주 확인, inferred_from_menu_name: 메뉴명에서만 명백히 유추, unknown: 확인 불가
  status          ENUM('confirmed','inferred_from_menu_name','unknown') NOT NULL,
  source_type     ENUM('official_menu','owner_verified','menu_name') NOT NULL,
  verified_at     DATE NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ingredient_notices_menu_id (menu_id),
  CONSTRAINT fk_ingredient_notices_menu
    FOREIGN KEY (menu_id) REFERENCES menus(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- menu_evidences: 메뉴 속성별 근거
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_evidences (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  menu_id        BIGINT UNSIGNED NOT NULL,
  field_name     VARCHAR(100)    NOT NULL,
  source_type    ENUM(
                   'official_menu',
                   'manual_public_review_aggregate',
                   'team_tasting',
                   'owner_verified',
                   'consented_feedback'
                 ) NOT NULL,
  source_summary VARCHAR(500)    NOT NULL,
  sample_size    INT UNSIGNED    NULL,
  mention_count  INT UNSIGNED    NULL,
  collected_at   DATE            NULL,
  verified_at    DATE            NULL,
  created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_menu_evidences_menu_id (menu_id)
    ,
  CONSTRAINT fk_menu_evidences_menu
    FOREIGN KEY (menu_id) REFERENCES menus(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 주의: `manual_public_review_aggregate` 소스는 가격/품절/재료/알레르기 관련 필드(field_name)에는
-- 쓸 수 없다. 이 제약은 SQL CHECK로 완전히 표현하기 어려워 애플리케이션 레이어(zod 스키마 +
-- repository insert 전 검증)에서 강제한다 — sql/002_seed_placeholder.sql 의 주석, 그리고
-- src/schemas/menuEvidence.schema.ts 참고.

-- ============================================================================
-- 002_seed_placeholder.sql
-- ============================================================================
-- 002_seed_placeholder.sql
--
-- *** 이 파일은 전부 플레이스홀더/예시 데이터다. ***
-- 메뉴명 앞에 "[예시]"를 붙여 실제 검수된 메뉴가 아님을 명시했고, 근거(evidence)의 source_summary에도
-- 동일하게 명시했다. 제출/시연 전 팀 시식·점주 확인·동의 후기로 수집한 실제 데이터로 반드시 교체해야 한다.
-- 가격, 재료, 맛 설명 등 어떤 값도 실제 "우루루 본점" 메뉴판을 보고 지어낸 것이 아니며, 기존 프론트엔드
-- 프로토타입(src/data/menu.sample.json)에서 이미 "[샘플] placeholder"로 명시했던 항목을 그대로
-- 재사용해 스키마 동작을 보여주는 용도다.
--
-- 이 스크립트는 깨끗한(비어 있는) 스키마에 한 번 실행하는 것을 전제로 하며, auto_increment id를
-- 1부터로 가정해 가독성을 위해 숫자 FK를 그대로 사용했다. 운영 환경에서는 매장을 여러 개 추가할 수
-- 있으므로, 추천 엔진/리포지토리 코드는 절대 이 숫자 id에 의존하지 않고 stores.slug 로만 매장을 찾는다.

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- store: 우루루 본점 (첫 번째 시연용 데이터셋)
-- dataset_as_of는 아직 실제 수집이 끝나지 않아 NULL로 둔다 — 실제 데이터 교체 시 수집 기준일을 채울 것.
-- ---------------------------------------------------------------------------
INSERT INTO stores (id, slug, name, dataset_as_of) VALUES
  (1, 'ururu-headquarters', '우루루 본점', NULL);

-- ---------------------------------------------------------------------------
-- menus
-- ---------------------------------------------------------------------------
INSERT INTO menus (id, store_id, name, price, category, spicy_level, serving_size, sold_out) VALUES
  (1, 1, '[예시] 마라짬뽕',   11000, 'main', 3, '1인분',      FALSE),
  (2, 1, '[예시] 짜장면',      7000, 'main', 0, '1인분',      FALSE),
  (3, 1, '[예시] 삼선짬뽕',   12000, 'main', 2, '1인분',      FALSE),
  (4, 1, '[예시] 탕수육(소)', 18000, 'main', 0, '2~3인 기준', FALSE),
  (5, 1, '[예시] 볶음밥',      8000, 'main', 0, '1인분',      FALSE),
  (6, 1, '[예시] 군만두',      6000, 'side', 0, '6개',        FALSE),
  (7, 1, '[예시] 계란탕',      4000, 'side', 0, '1인분',      FALSE),
  (8, 1, '[예시] 중국식 자스민차', 2000, 'drink', 0, '1잔',   FALSE);

-- ---------------------------------------------------------------------------
-- menu_tags
-- ---------------------------------------------------------------------------
INSERT INTO menu_tags (menu_id, tag_type, tag) VALUES
  -- 마라짬뽕
  (1, 'flavor',  '마라 향'),
  (1, 'flavor',  '얼큰함'),
  (1, 'texture', '쫄깃함'),
  (1, 'keyword', '짬뽕'),
  (1, 'keyword', '면'),
  (1, 'keyword', '탕'),
  (1, 'synonym', '면 요리'),
  -- 짜장면
  (2, 'flavor',  '담백함'),
  (2, 'flavor',  '달큰함'),
  (2, 'texture', '쫄깃함'),
  (2, 'keyword', '짜장'),
  (2, 'keyword', '면'),
  (2, 'synonym', '면 요리'),
  -- 삼선짬뽕
  (3, 'flavor',  '얼큰함'),
  (3, 'flavor',  '시원한 국물'),
  (3, 'texture', '쫄깃함'),
  (3, 'texture', '탱글함'),
  (3, 'keyword', '짬뽕'),
  (3, 'keyword', '면'),
  (3, 'keyword', '탕'),
  (3, 'synonym', '면 요리'),
  -- 탕수육
  (4, 'flavor',  '새콤달콤함'),
  (4, 'texture', '바삭함'),
  (4, 'keyword', '탕수육'),
  (4, 'keyword', '튀김'),
  (4, 'synonym', '바삭바삭'),
  -- 볶음밥
  (5, 'flavor',  '고소함'),
  (5, 'flavor',  '담백함'),
  (5, 'texture', '고슬고슬함'),
  (5, 'keyword', '밥'),
  (5, 'keyword', '볶음밥'),
  -- 군만두
  (6, 'flavor',  '고소함'),
  (6, 'texture', '바삭함'),
  (6, 'keyword', '만두'),
  (6, 'keyword', '튀김'),
  -- 계란탕
  (7, 'flavor',  '담백함'),
  (7, 'flavor',  '시원함'),
  (7, 'texture', '부드러움'),
  (7, 'keyword', '탕'),
  -- 자스민차
  (8, 'flavor',  '은은한 향');

-- ---------------------------------------------------------------------------
-- menu_pairings (메인 ↔ 사이드)
-- ---------------------------------------------------------------------------
INSERT INTO menu_pairings (menu_id, paired_menu_id) VALUES
  (1, 6), (1, 7),   -- 마라짬뽕 — 군만두 / 계란탕
  (2, 6),           -- 짜장면 — 군만두
  (3, 6), (3, 7),   -- 삼선짬뽕 — 군만두 / 계란탕
  (5, 7);           -- 볶음밥 — 계란탕

-- ---------------------------------------------------------------------------
-- menu_ingredient_notices
--
-- 원칙: 메뉴명에서 "명백히" 드러나는 재료만 inferred_from_menu_name 으로 기록한다.
--  - 계란탕 → "계란"이 메뉴명에 그대로 들어있음 (inferred_from_menu_name)
--  - 짜장면/마라짬뽕/삼선짬뽕 → "면"이 메뉴명에 들어있어 밀가루(밀) 사용이 명백함 (inferred_from_menu_name)
--  - 삼선짬뽕 → "삼선(三鮮)"은 중식에서 관용적으로 해물 3종을 뜻하므로 해산물 사용이 메뉴명 관례상 명백함
--    (inferred_from_menu_name) — 실제 교체 시 점주 확인으로 격상할 것
--  - 그 외 돼지고기/갑각류/계란 등은 메뉴명만으로는 단정할 수 없으므로 unknown으로 둔다
--    (추천 엔진은 unknown을 하드 필터 근거로 쓰지 않는다)
--  - 군만두 → 돼지고기 1건만 "owner_verified / confirmed" 예시로 넣어 실제 점주 확인 흐름을 보여준다
--    (실제 데이터 교체 시 이 한 행의 ingredient/verified_at을 진짜 확인 결과로 바꿀 것)
-- ---------------------------------------------------------------------------
INSERT INTO menu_ingredient_notices (menu_id, ingredient_name, status, source_type, verified_at) VALUES
  (1, '해산물',   'unknown',                 'menu_name',     NULL),
  (1, '갑각류',   'unknown',                 'menu_name',     NULL),
  (2, '밀',       'inferred_from_menu_name', 'menu_name',     NULL),
  (2, '대두',     'unknown',                 'menu_name',     NULL),
  (3, '밀',       'inferred_from_menu_name', 'menu_name',     NULL),
  (3, '해산물',   'inferred_from_menu_name', 'menu_name',     NULL),
  (4, '돼지고기', 'unknown',                 'menu_name',     NULL),
  (4, '밀',       'unknown',                 'menu_name',     NULL),
  (5, '계란',     'unknown',                 'menu_name',     NULL),
  (6, '돼지고기', 'confirmed',               'owner_verified','2026-10-06'),
  (6, '밀',       'unknown',                 'menu_name',     NULL),
  (7, '계란',     'inferred_from_menu_name', 'menu_name',     NULL);

-- ---------------------------------------------------------------------------
-- menu_evidences
--
-- source_summary에 "[예시]"/"placeholder"를 표시했다. manual_public_review_aggregate는
-- 맛/식감/선호 경향 집계에만 쓰고, 가격·품절·재료·알레르기 관련 field_name에는 절대 쓰지 않는다
-- (서버의 zod 스키마가 이 조합을 거부한다 — src/schemas/menuEvidence.schema.ts 참고).
-- ---------------------------------------------------------------------------
INSERT INTO menu_evidences
  (menu_id, field_name, source_type, source_summary, sample_size, mention_count, collected_at, verified_at) VALUES
  (1, 'overall', 'team_tasting',
     '[예시] 팀원 3인 시식 기준 placeholder — 실제 제출 전 팀 시식/점주 확인으로 교체 필요.',
     3, NULL, '2026-10-06', '2026-10-06'),
  (2, 'overall', 'team_tasting',
     '[예시] placeholder — 실제 데이터로 교체 필요.',
     3, NULL, '2026-10-06', '2026-10-06'),
  (3, 'overall', 'owner_verified',
     '[예시] placeholder — 실제 데이터로 교체 필요.',
     1, NULL, '2026-10-06', '2026-10-06'),
  (4, 'overall', 'team_tasting',
     '[예시] placeholder — 실제 데이터로 교체 필요.',
     3, NULL, '2026-10-06', '2026-10-06'),
  (4, 'texture_profile:바삭함', 'manual_public_review_aggregate',
     '[예시] 공개 리뷰 수기 집계 placeholder — 팀이 직접 읽고 "바삭하다" 언급만 집계함. 리뷰 원문/작성자/링크/사진은 저장하지 않음. 실제 집계로 교체 필요.',
     12, 8, '2026-10-06', NULL),
  (5, 'overall', 'team_tasting',
     '[예시] placeholder — 실제 데이터로 교체 필요.',
     3, NULL, '2026-10-06', '2026-10-06'),
  (6, 'overall', 'team_tasting',
     '[예시] placeholder — 실제 데이터로 교체 필요.',
     3, NULL, '2026-10-06', '2026-10-06'),
  (7, 'overall', 'team_tasting',
     '[예시] placeholder — 실제 데이터로 교체 필요.',
     3, NULL, '2026-10-06', '2026-10-06'),
  (8, 'overall', 'team_tasting',
     '[예시] placeholder — 실제 데이터로 교체 필요.',
     3, NULL, '2026-10-06', '2026-10-06');

-- ============================================================================
-- 003_admin.sql
-- ============================================================================
-- 003_admin.sql
-- 점주 관리자 화면 지원: 메뉴 CRUD(이미 있는 menus 테이블 그대로 사용), 추천 메뉴/세트 우선 노출,
-- 점주 로그인 계정.
--
-- 설계 원칙(001과 동일하게 유지):
-- - store_owners/featured_sets 모두 store_id로만 연결한다. 매장이 여러 개로 늘어나도
--   코드가 특정 매장에 고정되지 않는다.
-- - is_featured/featured_rank는 추천 엔진에서 "우선순위 가점"으로만 쓰인다. 알레르기 등
--   안전 하드 필터는 점주 지정 메뉴/세트에도 동일하게 적용된다 (서비스 레이어에서 강제).

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- menus: 점주가 지정하는 "추천 메뉴" 표시
-- ---------------------------------------------------------------------------
ALTER TABLE menus
  ADD COLUMN is_featured   BOOLEAN          NOT NULL DEFAULT FALSE AFTER sold_out,
  ADD COLUMN featured_rank INT UNSIGNED     NULL     AFTER is_featured;

-- 같은 메뉴에 같은 재료를 다시 입력하면(관리자 화면에서 상태를 고치는 경우) 덮어쓰도록 유니크 제약 추가
ALTER TABLE menu_ingredient_notices
  ADD CONSTRAINT uq_ingredient_notices_menu_ingredient UNIQUE (menu_id, ingredient_name);

-- ---------------------------------------------------------------------------
-- store_owners: 점주 로그인 계정 (매장당 1계정을 가정하되 store_id로 연결해 확장 가능하게 둠)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_owners (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id      BIGINT UNSIGNED NOT NULL,
  username      VARCHAR(100)    NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,
  display_name  VARCHAR(100)    NOT NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_store_owners_username (username),
  KEY idx_store_owners_store_id (store_id),
  CONSTRAINT fk_store_owners_store
    FOREIGN KEY (store_id) REFERENCES stores(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- featured_sets: 점주가 지정한 "추천 세트" (메인+사이드 등 묶음)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS featured_sets (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id   BIGINT UNSIGNED NOT NULL,
  name       VARCHAR(200)    NOT NULL,
  -- 여러 세트가 있을 때 노출 우선순위 (작을수록 먼저). NULL이면 등록 순서.
  rank_order INT UNSIGNED    NULL,
  active     BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_featured_sets_store_id (store_id),
  CONSTRAINT fk_featured_sets_store
    FOREIGN KEY (store_id) REFERENCES stores(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS featured_set_items (
  set_id   BIGINT UNSIGNED NOT NULL,
  menu_id  BIGINT UNSIGNED NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (set_id, menu_id),
  CONSTRAINT fk_featured_set_items_set
    FOREIGN KEY (set_id) REFERENCES featured_sets(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_featured_set_items_menu
    FOREIGN KEY (menu_id) REFERENCES menus(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 004_kind_and_external_id.sql
-- ============================================================================
-- 004_kind_and_external_id.sql
-- 실제 매장 메뉴 데이터(키오스크 prototype/menu/menus.json)를 관리자 DB로 들여오기 위한 컬럼 추가.
--
-- kind: 음식 종류(베이징덕/생선, 딤섬, 야채, 냉채/샐러드, 스프/탕, 치킨, 돼지고기, 소고기, 면, 밥, 해산물).
--       기존 category(main/side/drink, 코스 구분)와는 다른 축이다 — 관리자 화면에서 점주가 직접 쓸 수 있다.
-- external_id: 키오스크 정적 데이터(menus.json)의 원래 문자열 id. 키오스크 화면이 이 값으로 자기
--       메뉴와 DB 메뉴를 짝지어, 이름/가격/종류/매운맛/품절/대표메뉴 같은 핵심 정보만 실시간으로 반영한다.
--       관리자 화면/생성 API로는 바꿀 수 없다 (가져오기 스크립트에서만 설정).

SET NAMES utf8mb4;

ALTER TABLE menus
  ADD COLUMN kind        VARCHAR(50) NULL AFTER category,
  ADD COLUMN external_id VARCHAR(50) NULL AFTER kind,
  ADD UNIQUE KEY uq_menus_external_id (external_id);

-- ============================================================================
-- 005_orders.sql
-- ============================================================================
-- 005_orders.sql
-- 결제 완료 주문을 서버 DB에 남긴다 (매출 집계·영수증 재발급·환불 처리용).
--
-- 설계 원칙:
-- - 키오스크는 네트워크가 끊겨도 주문을 계속 받아야 하므로, 주문 저장은 "결제 완료 표시" 자체를
--   막지 않는다 (POST /api/stores/:slug/orders 실패는 화면에서 조용히 무시 — ordersController 참고).
-- - order_number는 키오스크가 화면에 보여 주는 번호(기기별로 001부터 증가)를 그대로 라벨로만 저장한다.
--   여러 대의 키오스크가 같은 번호를 쓸 수 있으므로 유니크 제약을 걸지 않는다 — 내부 식별자는 id다.
-- - order_items는 menus.id를 외래키로 참조하지 않고 이름/가격을 그대로 복제해 둔다. 나중에 메뉴
--   가격이 바뀌거나 메뉴가 삭제돼도, 이미 결제된 주문의 영수증 내용은 바뀌지 않아야 하기 때문이다.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id       BIGINT UNSIGNED NOT NULL,
  order_number   VARCHAR(20)     NOT NULL,
  total_amount   INT UNSIGNED    NOT NULL,
  payment_method VARCHAR(30)     NOT NULL,
  dine_type      ENUM('dine_in','takeout') NOT NULL,
  status         ENUM('paid','cancelled') NOT NULL DEFAULT 'paid',
  created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_orders_store_created (store_id, created_at),
  CONSTRAINT fk_orders_store
    FOREIGN KEY (store_id) REFERENCES stores(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id        BIGINT UNSIGNED NOT NULL,
  -- 주문 당시 키오스크 쪽 메뉴 id(menus.json의 id / menus.external_id) — 참조용이라 외래키는 아니다.
  menu_external_id VARCHAR(50)    NULL,
  name            VARCHAR(200)    NOT NULL,
  price           INT UNSIGNED    NOT NULL,
  quantity        SMALLINT UNSIGNED NOT NULL,
  option_label    VARCHAR(100)    NULL,
  PRIMARY KEY (id),
  KEY idx_order_items_order_id (order_id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 마이그레이션 기록 — npm run migrate 가 001~005를 다시 실행하지 않게 한다
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   VARCHAR(255) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT IGNORE INTO schema_migrations (filename) VALUES
  ('001_init.sql'),
  ('002_seed_placeholder.sql'),
  ('003_admin.sql'),
  ('004_kind_and_external_id.sql'),
  ('005_orders.sql');

-- 끝. 이어서 터미널에서: npm run import:real-data → npm run seed:admin -- --password <비밀번호>
