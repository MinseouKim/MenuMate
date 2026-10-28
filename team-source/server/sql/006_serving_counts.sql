-- 006_serving_counts.sql
-- 인원수 맞춤 조합 추천(키오스크 화면 prototype/recommendation.ts를 서버로 옮김)에 필요한 숫자 정보.
-- serving_size는 "2~3인 기준", "8개입 · 2~3인"처럼 사람이 읽는 글자라 수량 계산에 쓸 수 없어서,
-- menus.json의 servingPeople / servingMin을 숫자로 따로 둔다. 비어 있으면 1인분으로 본다.
--   serving_people: 이 메뉴 1개가 몇 명 분량인지 (수량 = 인원 ÷ serving_people 올림)
--   serving_min   : 최소 몇 명 분량인지 (인원보다 너무 많은 양인지 판단할 때 사용)

SET NAMES utf8mb4;

ALTER TABLE menus
  ADD COLUMN serving_people TINYINT UNSIGNED NULL AFTER serving_size,
  ADD COLUMN serving_min    TINYINT UNSIGNED NULL AFTER serving_people;
