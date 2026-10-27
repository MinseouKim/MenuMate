-- menumate DB 상태 확인 (import:real-data 이후 실행). 각 쿼리 옆 주석이 정상값.
SET NAMES utf8mb4;
USE kiosk_dev;

-- 1) 마이그레이션 기록: 001~005 다섯 줄
SELECT filename, applied_at FROM schema_migrations ORDER BY filename;

-- 2) 매장: ururu-headquarters 한 줄
SELECT id, slug, name FROM stores;

-- 3) 메뉴: 전체 80 / [예시] 0 / external_id 없음 0 / kind 없음 0
SELECT COUNT(*)                                        AS `전체_메뉴수`,
       SUM(name LIKE '[예시]%')                         AS `예시_메뉴수`,
       SUM(external_id IS NULL)                        AS `external_id_없음`,
       SUM(kind IS NULL)                               AS `kind_없음`
FROM menus WHERE store_id = (SELECT id FROM stores WHERE slug = 'ururu-headquarters');

-- 4) 리뷰 근거: 근거 있는 메뉴 57 / 근거 없는 메뉴 23 (ururu-menu/menu_reviews.json 기준)
SELECT SUM(has_ev)     AS `리뷰근거_있는_메뉴`,
       SUM(1 - has_ev) AS `리뷰근거_없는_메뉴`
FROM (
  SELECT m.id, (COUNT(e.id) > 0) AS has_ev
  FROM menus m
  LEFT JOIN menu_evidences e ON e.menu_id = m.id AND e.source_type = 'manual_public_review_aggregate'
  WHERE m.store_id = (SELECT id FROM stores WHERE slug = 'ururu-headquarters')
  GROUP BY m.id
) t;

-- 5) 리뷰 근거 예시 몇 개 눈으로 확인
SELECT m.external_id, m.name, e.mention_count AS `직접언급`, e.sample_size AS `전체근거`, e.collected_at AS `기준일`, e.source_summary
FROM menu_evidences e JOIN menus m ON m.id = e.menu_id
WHERE e.source_type = 'manual_public_review_aggregate'
ORDER BY e.mention_count DESC LIMIT 10;

-- 6) 재료 정보가 비어 있는 메뉴 (제외 재료 요청 시 서버가 걸러내지 못함 — 매장 확인 필요)
SELECT m.external_id, m.name
FROM menus m LEFT JOIN menu_ingredient_notices n ON n.menu_id = m.id
WHERE m.store_id = (SELECT id FROM stores WHERE slug = 'ururu-headquarters')
GROUP BY m.id HAVING COUNT(n.id) = 0;

-- 7) 점주 계정 (seed:admin 이후): owner 한 줄. password_hash는 bcrypt 해시여야 함($2로 시작)
SELECT username, display_name, LEFT(password_hash, 4) AS `해시앞부분` FROM store_owners;
