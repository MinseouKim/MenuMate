-- kiosk_app 접속 비밀번호를 .env 의 DB_PASSWORD 와 같게 다시 맞춘다 (Workbench에서 root로 실행).
-- "Access denied for user 'kiosk_app'@'localhost'" 오류가 날 때 쓴다. 데이터는 건드리지 않는다.
CREATE USER IF NOT EXISTS 'kiosk_app'@'localhost';
CREATE USER IF NOT EXISTS 'kiosk_app'@'127.0.0.1';

-- ▼▼▼ 비밀번호는 이 두 줄에만 있다. 두 줄 모두 .env 의 DB_PASSWORD 값으로 바꾼다. ▼▼▼
ALTER USER 'kiosk_app'@'localhost' IDENTIFIED BY 'ENV에-적은-비밀번호';
ALTER USER 'kiosk_app'@'127.0.0.1' IDENTIFIED BY 'ENV에-적은-비밀번호';
-- ▲▲▲ ------------------------------------------------------------------------- ▲▲▲

GRANT ALL PRIVILEGES ON kiosk_dev.* TO 'kiosk_app'@'localhost';
GRANT ALL PRIVILEGES ON kiosk_dev.* TO 'kiosk_app'@'127.0.0.1';
FLUSH PRIVILEGES;
