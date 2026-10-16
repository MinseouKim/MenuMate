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
