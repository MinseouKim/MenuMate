import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { dbConnectionOptions } from "./connection.js";
import { buildEvidenceRows, REVIEW_EVIDENCE_SOURCE_TYPE, type MergedMenuReviews } from "./menuReviewEvidence.js";

/**
 * 병합 리뷰 데이터(ururu-menu/menu_reviews.json)를 menu_evidences로 넣는다.
 * 메뉴는 external_id(menus.json의 id)로 짝을 맞춘다 — 먼저 npm run import:real-menu가 되어 있어야 한다.
 *
 * 다시 실행해도 안전하다: 해당 매장의 manual_public_review_aggregate 근거만 지우고 새로 넣는다
 * (팀 시식·점주 확인 같은 다른 근거는 건드리지 않는다).
 * 주의: import:real-menu는 메뉴를 지우고 다시 만들면서 근거도 함께 지우므로, 그 뒤에는 이것도 다시 실행한다
 *       (npm run import:real-data 가 두 개를 순서대로 실행한다).
 *
 * 사용법: npm run import:evidences -- --slug ururu-headquarters [--file ../../ururu-menu/menu_reviews.json]
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.resolve(__dirname, "../../../../ururu-menu/menu_reviews.json");

function readArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  return process.argv[idx + 1];
}

async function main() {
  const slug = readArg("--slug", "ururu-headquarters");
  const file = path.resolve(readArg("--file", DEFAULT_FILE));
  const data = JSON.parse(readFileSync(file, "utf-8")) as MergedMenuReviews;
  const rows = buildEvidenceRows(data);

  const connection = await mysql.createConnection({ ...dbConnectionOptions(), });

  try {
    const [storeRows] = await connection.query<RowDataPacket[]>("SELECT id FROM stores WHERE slug = ? LIMIT 1", [slug]);
    const store = storeRows[0];
    if (!store) throw new Error(`매장을 찾을 수 없습니다: ${slug} (먼저 npm run migrate)`);

    const [menuRows] = await connection.query<RowDataPacket[]>(
      "SELECT id, external_id FROM menus WHERE store_id = ? AND external_id IS NOT NULL",
      [store.id],
    );
    if (menuRows.length === 0) {
      throw new Error("external_id가 있는 메뉴가 없습니다. 먼저 npm run import:real-menu 를 실행하세요.");
    }
    const idByExternal = new Map(menuRows.map((r) => [r.external_id as string, r.id as number]));

    await connection.beginTransaction();
    const [del] = await connection.query<mysql.ResultSetHeader>(
      `DELETE e FROM menu_evidences e JOIN menus m ON m.id = e.menu_id
       WHERE m.store_id = ? AND e.source_type = ?`,
      [store.id, REVIEW_EVIDENCE_SOURCE_TYPE],
    );

    const missing: string[] = [];
    let inserted = 0;
    for (const row of rows) {
      const menuId = idByExternal.get(row.external_id);
      if (!menuId) {
        missing.push(row.external_id);
        continue;
      }
      await connection.query(
        `INSERT INTO menu_evidences
           (menu_id, field_name, source_type, source_summary, sample_size, mention_count, collected_at, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        [menuId, row.field_name, row.source_type, row.source_summary, row.sample_size, row.mention_count, row.collected_at],
      );
      inserted += 1;
    }
    await connection.commit();

    console.log(`[import-evidences] ${file}`);
    console.log(`[import-evidences] 기존 리뷰 집계 ${del.affectedRows}건 삭제 → ${inserted}개 메뉴에 리뷰 근거를 넣었습니다 (매장: ${slug}).`);
    console.log(`[import-evidences] 리뷰 근거 없는 메뉴 ${data.menus.length - rows.length}개는 근거를 넣지 않았습니다 (추천에서 '근거 없음'으로 처리).`);
    if (missing.length) console.warn(`[import-evidences] DB에 없는 메뉴 ${missing.length}개 건너뜀: ${missing.join(", ")}`);
  } catch (err) {
    await connection.rollback().catch(() => undefined);
    throw err;
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("[import-evidences] 실패:", err);
  process.exitCode = 1;
});
