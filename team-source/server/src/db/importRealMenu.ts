import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql, { type ResultSetHeader } from "mysql2/promise";
import { env } from "../config/env.js";

/**
 * 키오스크 정적 데이터(team-source/src/prototype/menu/menus.json)의 실제 우루루 메뉴를
 * 관리자 DB(MySQL)로 가져온다. 관리자 화면에서 핵심 정보(이름/가격/kind/매운맛/품절/대표메뉴)를
 * 고치면 키오스크 화면이 external_id로 짝을 맞춰 그 값을 실시간으로 반영한다.
 *
 * 이 스크립트를 다시 실행하면 해당 매장의 기존 메뉴 데이터를 전부 지우고 menus.json 내용으로
 * 새로 채운다 (menus.json이 최신 메뉴판으로 바뀌면 그대로 다시 실행해서 갱신하면 된다).
 *
 * 사용법: npm run import:real-menu -- --slug ururu-headquarters
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MENUS_JSON_PATH = path.resolve(__dirname, "../../../src/prototype/menu/menus.json");

interface RealMenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  kind: string;
  badge?: string;
  spicy: number;
  texture: string[];
  flavor: string[];
  ingredients: string[];
  quantityUnit: string;
  servingMin?: number;
  servingPeople: number;
  pairings: string[];
  description?: string;
  reviews?: string[];
}

function readArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  return process.argv[idx + 1];
}

function servingSizeFor(item: RealMenuItem): string {
  if (item.quantityUnit?.trim()) return item.quantityUnit.trim();
  const min = item.servingMin ?? item.servingPeople;
  return min === item.servingPeople ? `${item.servingPeople}인 기준` : `${min}~${item.servingPeople}인 기준`;
}

async function main() {
  const slug = readArg("--slug", "ururu-headquarters");
  const raw = readFileSync(MENUS_JSON_PATH, "utf-8");
  const items: RealMenuItem[] = JSON.parse(raw);

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
      throw new Error(`매장을 찾을 수 없습니다: ${slug} (먼저 npm run migrate로 스키마를 적용했는지 확인하세요)`);
    }
    const storeId = store.id as number;

    console.log(`[import-real-menu] ${slug} 매장의 기존 메뉴 데이터를 정리합니다...`);
    // ON DELETE CASCADE로 menu_tags/menu_pairings/menu_ingredient_notices/menu_evidences/featured_set_items도 함께 지워진다.
    await connection.query("DELETE FROM menus WHERE store_id = ?", [storeId]);

    const idMap = new Map<string, number>();

    for (const item of items) {
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO menus
           (store_id, name, price, category, kind, external_id, spicy_level, serving_size, sold_out, is_featured)
         VALUES (?, ?, ?, 'main', ?, ?, ?, ?, FALSE, ?)`,
        [storeId, item.name, item.price, item.kind, item.id, item.spicy, servingSizeFor(item), item.badge === "대표"],
      );
      const menuId = result.insertId;
      idMap.set(item.id, menuId);

      for (const tag of item.texture ?? []) {
        await connection.query(
          "INSERT IGNORE INTO menu_tags (menu_id, tag_type, tag) VALUES (?, 'texture', ?)",
          [menuId, tag],
        );
      }
      for (const tag of item.flavor ?? []) {
        await connection.query(
          "INSERT IGNORE INTO menu_tags (menu_id, tag_type, tag) VALUES (?, 'flavor', ?)",
          [menuId, tag],
        );
      }
      if (item.badge === "신규") {
        await connection.query(
          "INSERT IGNORE INTO menu_tags (menu_id, tag_type, tag) VALUES (?, 'keyword', ?)",
          [menuId, "신규"],
        );
      }

      // menus.json의 ingredients는 팀이 실제로 확인해 적어둔 정보이므로 confirmed/official_menu로 기록한다
      // (placeholder 데이터와 달리 메뉴명에서 추측한 값이 아니다).
      for (const ingredient of item.ingredients ?? []) {
        await connection.query(
          `INSERT INTO menu_ingredient_notices (menu_id, ingredient_name, status, source_type, verified_at)
           VALUES (?, ?, 'confirmed', 'official_menu', CURDATE())
           ON DUPLICATE KEY UPDATE status = VALUES(status), source_type = VALUES(source_type), verified_at = VALUES(verified_at)`,
          [menuId, ingredient],
        );
      }
    }

    // 두 번째 패스: pairings (지금은 menus.json에 전부 비어있지만, 나중에 채워지면 자동으로 반영된다).
    let pairingCount = 0;
    for (const item of items) {
      const fromId = idMap.get(item.id);
      if (!fromId) continue;
      for (const pairedExternalId of item.pairings ?? []) {
        const toId = idMap.get(pairedExternalId);
        if (!toId) continue;
        await connection.query(
          "INSERT IGNORE INTO menu_pairings (menu_id, paired_menu_id) VALUES (?, ?)",
          [fromId, toId],
        );
        pairingCount += 1;
      }
    }

    console.log(`[import-real-menu] ${items.length}개 메뉴를 가져왔습니다 (매장: ${slug}, 페어링 ${pairingCount}건).`);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("[import-real-menu] 실패:", err);
  process.exitCode = 1;
});
