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
