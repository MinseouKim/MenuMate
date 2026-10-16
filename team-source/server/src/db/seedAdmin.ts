import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { env } from "../config/env.js";

/**
 * 점주 로그인 계정을 만들거나(없으면) 비밀번호를 갱신한다(있으면).
 * 비밀번호를 평문으로 DB에 저장하지 않기 위해, 반드시 이 스크립트(또는 동일한 해시 로직)를 통해서만
 * store_owners.password_hash를 채운다.
 *
 * 사용법:
 *   npm run seed:admin -- --slug ururu-headquarters --username owner --password <비밀번호> --name "우루루 본점 사장님"
 * 인자를 생략하면 아래 기본값을 사용한다 (전시 전에는 반드시 실제 비밀번호로 바꿀 것).
 */
function readArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  return process.argv[idx + 1];
}

async function main() {
  const slug = readArg("--slug", "ururu-headquarters");
  const username = readArg("--username", "owner");
  const password = readArg("--password", "change-me-1234");
  const displayName = readArg("--name", "우루루 본점 사장님");

  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  try {
    const [storeRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT id FROM stores WHERE slug = ? LIMIT 1",
      [slug],
    );
    const store = storeRows[0];
    if (!store) {
      throw new Error(`매장을 찾을 수 없습니다: ${slug} (먼저 npm run migrate로 스키마/시드를 적용했는지 확인하세요)`);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await connection.query(
      `INSERT INTO store_owners (store_id, username, password_hash, display_name)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), display_name = VALUES(display_name)`,
      [store.id, username, passwordHash, displayName],
    );

    console.log(`[seed:admin] store_owners 계정 준비 완료 — username: ${username} (매장: ${slug})`);
    console.log("[seed:admin] 위 비밀번호를 안전한 곳에 적어두고, 전시 전에는 기본값을 그대로 쓰지 마세요.");
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("[seed:admin] 실패:", err);
  process.exitCode = 1;
});
