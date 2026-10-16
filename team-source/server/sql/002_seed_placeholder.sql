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
