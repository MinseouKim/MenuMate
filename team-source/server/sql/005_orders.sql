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
