import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { env } from "../config/env.js";

/**
 * sql/ 폴더의 *.sql 파일을 파일명 순서(001_, 002_, ...)대로 실행하는 아주 단순한 마이그레이션 러너.
 * 별도 마이그레이션 프레임워크/ORM을 쓰지 않기로 한 결정에 맞춘 최소 구현이다.
 *
 * 사용법: npm run migrate  (.env의 DB_* 값을 사용해 접속)
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
    for (const file of files) {
      const sql = await readFile(path.join(sqlDir, file), "utf-8");
      console.log(`[migrate] applying ${file} ...`);
      await connection.query(sql);
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
