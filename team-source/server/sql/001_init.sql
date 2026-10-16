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
