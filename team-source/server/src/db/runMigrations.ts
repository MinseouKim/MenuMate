import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { env } from "../config/env.js";

/**
 * sql/ 폴더의 *.sql 파일을 파일명 순서(001_, 002_, ...)대로 실행하는 마이그레이션 러너.
 * 별도 마이그레이션 프레임워크/ORM을 쓰지 않기로 한 결정에 맞춘 최소 구현이지만,
 * 이미 적용한 파일은 schema_migrations 테이블에 기록해 두고 다시 실행하지 않는다.
 * (기록이 없으면 npm run migrate를 두 번째 실행할 때 002_seed_placeholder.sql 같은
 *  비멱등 INSERT 스크립트가 중복 키 오류로 매번 실패한다 — 실제로 한 번 겪은 문제다.)
 *
 * 사용법: npm run migrate  (.env의 DB_* 값을 사용해 접속)
 * 이미 수동으로 적용되어 있던 과거 마이그레이션을 다시 실행하지 않고 "적용됨"으로만
 * 표시하려면 npm run migrate:bootstrap 을 먼저 한 번 실행한다 (src/db/bootstrapMigrationTracking.ts 참고).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(__dirname, "../../sql");

async function main() {
  const files = (await readdir(sqlDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT filename FROM schema_migrations",
    );
    const applied = new Set(rows.map((r) => r.filename as string));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] skip ${file} (이미 적용됨)`);
        continue;
      }
      const sql = await readFile(path.join(sqlDir, file), "utf-8");
      console.log(`[migrate] applying ${file} ...`);
      await connection.query(sql);
      await connection.query(
        "INSERT INTO schema_migrations (filename) VALUES (?)",
        [file],
      );
      console.log(`[migrate] ${file} done`);
    }
    console.log("[migrate] all migrations applied");
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exitCode = 1;
});
