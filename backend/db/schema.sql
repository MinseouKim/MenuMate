-- 우루루 키오스크: AI 추천에 필요한 메뉴 테이블 (MySQL 8 / 5.7 이상)
-- 팀 백엔드에 이미 menu 테이블이 있으면, 아래 컬럼 중 없는 것만 추가하면 됩니다.

CREATE DATABASE IF NOT EXISTS wooruru DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE wooruru;

CREATE TABLE IF NOT EXISTS menu (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  name            VARCHAR(100) NOT NULL,
  category        VARCHAR(20)  NOT NULL COMMENT '식사 | 요리 | 딤섬 | 코스 | 세트',
  price           INT          NOT NULL,
  price_verified  TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '실제 메뉴판 가격 확인 여부',
  serves          TINYINT      NULL     COMMENT '요리 몇 인분 (식사는 NULL)',
  spicy           TINYINT      NOT NULL DEFAULT 0 COMMENT '0 안 매움 ~ 3 아주 매움',
  aliases         JSON         NULL     COMMENT '["탕수육","북경식탕수육"] 손님이 부르는 다른 이름',
  tags            JSON         NULL     COMMENT '["noodle","seafood","signature"] 추천용 태그',
  ingredients     JSON         NULL     COMMENT '["밀가루","새우"] 알레르기·제외 재료 판단용',
  description     VARCHAR(200) NULL,
  image_url       VARCHAR(300) NULL,
  sold_out        TINYINT(1)   NOT NULL DEFAULT 0,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 얼굴 사진·영상·특징값은 어떤 테이블에도 저장하지 않습니다 (명세서 NFR-07).
-- 통계가 필요하면 아래처럼 개인을 알 수 없는 집계만 남깁니다 (FR-25).
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  day              DATE        NOT NULL,
  mode             VARCHAR(10) NOT NULL COMMENT 'basic | recommend | easy',
  sessions         INT         NOT NULL DEFAULT 0,
  accepted_recos   INT         NOT NULL DEFAULT 0 COMMENT '추천 메뉴를 담은 횟수',
  PRIMARY KEY (day, mode)
);
