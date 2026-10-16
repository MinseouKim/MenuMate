import mysql from "mysql2/promise";
import { env } from "../config/env.js";

/**
 * 이번에 schema_migrations 추적 테이블을 처음 도입하면서, 이미 수동으로 적용되어 있던
 * 과거 마이그레이션(001~003)을 "적용됨"으로만 표시한다. SQL은 다시 실행하지 않는다
 * (이미 DB에 반영되어 있으므로 — 002는 INSERT라서 다시 실행하면 중복 키 오류가 난다).
 *
 * 이미 001~003을 적용해 둔 기존 DB에서 딱 한 번만 실행하면 된다.
 * 이후에는 npm run migrate 만으로 새 마이그레이션 파일(004부터)만 자동으로 적용된다.
 *
 * 사용법: npm run migrate:bootstrap
 */
const ALREADY_APPLIED = ["001_init.sql", "002_seed_placeholder.sql", "003_admin.sql"];

async function main() {
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    for (const file of ALREADY_APPLIED) {
      await connection.query(
        "INSERT IGNORE INTO schema_migrations (filename) VALUES (?)",
        [file],
      );
      console.log(`[bootstrap] ${file} 를 "적용됨"으로 표시했습니다`);
    }
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("[bootstrap] 실패:", err);
  process.exitCode = 1;
});
