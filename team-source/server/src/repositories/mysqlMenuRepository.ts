import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  MenuCreateInput,
  MenuEvidence,
  MenuIngredientNotice,
  MenuIngredientNoticeInput,
  MenuRow,
  MenuTag,
  MenuUpdateInput,
  MenuWithDetails,
} from "../types/menu.js";
import type { MenuRepository } from "./types.js";

interface MenuQueryRow extends RowDataPacket, Omit<MenuRow, "sold_out" | "is_featured"> {
  sold_out: number | boolean;
  is_featured: number | boolean;
}
interface MenuTagRow extends RowDataPacket, MenuTag {
  menu_id: number;
}
interface MenuPairingRow extends RowDataPacket {
  menu_id: number;
  paired_menu_id: number;
}
interface MenuIngredientNoticeRow extends RowDataPacket, MenuIngredientNotice {
  menu_id: number;
}
interface MenuEvidenceRow extends RowDataPacket, MenuEvidence {
  menu_id: number;
}

function toMenuRow(row: MenuQueryRow): MenuRow {
  return {
    id: row.id,
    store_id: row.store_id,
    name: row.name,
    price: row.price,
    category: row.category,
    kind: row.kind,
    external_id: row.external_id,
    spicy_level: row.spicy_level,
    serving_size: row.serving_size,
    sold_out: Boolean(row.sold_out),
    is_featured: Boolean(row.is_featured),
    featured_rank: row.featured_rank,
  };
}

const MENU_SELECT_COLUMNS =
  "id, store_id, name, price, category, kind, external_id, spicy_level, serving_size, sold_out, is_featured, featured_rank";

/** 여러 메뉴 id에 대해 태그/페어링/노티스/근거를 한 번씩만 조회한 뒤 메뉴별로 묶어 MenuWithDetails[]를 만든다. */
async function attachDetails(pool: Pool, menuRows: MenuQueryRow[]): Promise<MenuWithDetails[]> {
  if (menuRows.length === 0) return [];
  const menuIds = menuRows.map((r) => r.id);
  const placeholders = menuIds.map(() => "?").join(",");

  const [tagRows] = await pool.query<MenuTagRow[]>(
    `SELECT menu_id, tag_type, tag FROM menu_tags WHERE menu_id IN (${placeholders})`,
    menuIds,
  );
  const [pairingRows] = await pool.query<MenuPairingRow[]>(
    `SELECT menu_id, paired_menu_id FROM menu_pairings WHERE menu_id IN (${placeholders})`,
    menuIds,
  );
  const [noticeRows] = await pool.query<MenuIngredientNoticeRow[]>(
    `SELECT menu_id, ingredient_name, status, source_type, verified_at
       FROM menu_ingredient_notices WHERE menu_id IN (${placeholders})`,
    menuIds,
  );
  const [evidenceRows] = await pool.query<MenuEvidenceRow[]>(
    `SELECT menu_id, field_name, source_type, source_summary, sample_size, mention_count, collected_at, verified_at
       FROM menu_evidences WHERE menu_id IN (${placeholders})`,
    menuIds,
  );

  return menuRows.map((menuRow) => {
    const menu = toMenuRow(menuRow);
    const tagsForMenu = tagRows.filter((t) => t.menu_id === menu.id);

    return {
      ...menu,
      flavor_tags: tagsForMenu.filter((t) => t.tag_type === "flavor").map((t) => t.tag),
      texture_tags: tagsForMenu.filter((t) => t.tag_type === "texture").map((t) => t.tag),
      keyword_tags: tagsForMenu.filter((t) => t.tag_type === "keyword").map((t) => t.tag),
      synonym_tags: tagsForMenu.filter((t) => t.tag_type === "synonym").map((t) => t.tag),
      dietary_tags: tagsForMenu.filter((t) => t.tag_type === "dietary").map((t) => t.tag),
      pairing_menu_ids: pairingRows
        .filter((p) => p.menu_id === menu.id)
        .map((p) => p.paired_menu_id),
      ingredient_notices: noticeRows
        .filter((n) => n.menu_id === menu.id)
        .map((n) => ({
          ingredient_name: n.ingredient_name,
          status: n.status,
          source_type: n.source_type,
          verified_at: n.verified_at,
        })),
      evidences: evidenceRows
        .filter((e) => e.menu_id === menu.id)
        .map((e) => ({
          field_name: e.field_name,
          source_type: e.source_type,
          source_summary: e.source_summary,
          sample_size: e.sample_size,
          mention_count: e.mention_count,
          collected_at: e.collected_at,
          verified_at: e.verified_at,
        })),
    } satisfies MenuWithDetails;
  });
}

export function createMysqlMenuRepository(pool: Pool): MenuRepository {
  return {
    async listByStore(storeId: number): Promise<MenuWithDetails[]> {
      const [menuRows] = await pool.query<MenuQueryRow[]>(
        `SELECT ${MENU_SELECT_COLUMNS} FROM menus WHERE store_id = ? ORDER BY category, id`,
        [storeId],
      );
      return attachDetails(pool, menuRows);
    },

    async findById(menuId: number): Promise<MenuWithDetails | null> {
      const [menuRows] = await pool.query<MenuQueryRow[]>(
        `SELECT ${MENU_SELECT_COLUMNS} FROM menus WHERE id = ? LIMIT 1`,
        [menuId],
      );
      const [withDetails] = await attachDetails(pool, menuRows);
      return withDetails ?? null;
    },

    async addEvidence(menuId: number, evidence: MenuEvidence): Promise<void> {
      await pool.query(
        `INSERT INTO menu_evidences
           (menu_id, field_name, source_type, source_summary, sample_size, mention_count, collected_at, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          menuId,
          evidence.field_name,
          evidence.source_type,
          evidence.source_summary,
          evidence.sample_size,
          evidence.mention_count,
          evidence.collected_at,
          evidence.verified_at,
        ],
      );
    },

    async create(storeId: number, input: MenuCreateInput): Promise<MenuWithDetails> {
      const [result] = await pool.query<import("mysql2/promise").ResultSetHeader>(
        `INSERT INTO menus (store_id, name, price, category, kind, spicy_level, serving_size, sold_out)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          storeId,
          input.name,
          input.price,
          input.category,
          input.kind ?? null,
          input.spicy_level,
          input.serving_size ?? null,
          input.sold_out ?? false,
        ],
      );
      const created = await this.findById(result.insertId);
      // create 직후 조회는 반드시 성공해야 한다 — 실패하면 pool/스키마 자체의 문제이므로 그대로 던진다.
      return created!;
    },

    async update(menuId: number, patch: MenuUpdateInput): Promise<MenuWithDetails> {
      const fields: string[] = [];
      const values: unknown[] = [];
      const columnByKey: Record<keyof MenuUpdateInput, string> = {
        name: "name",
        price: "price",
        category: "category",
        kind: "kind",
        spicy_level: "spicy_level",
        serving_size: "serving_size",
        sold_out: "sold_out",
        is_featured: "is_featured",
        featured_rank: "featured_rank",
      };
      for (const key of Object.keys(patch) as (keyof MenuUpdateInput)[]) {
        const value = patch[key];
        if (value === undefined) continue;
        fields.push(`${columnByKey[key]} = ?`);
        values.push(value);
      }
      if (fields.length > 0) {
        values.push(menuId);
        await pool.query(`UPDATE menus SET ${fields.join(", ")} WHERE id = ?`, values);
      }
      const updated = await this.findById(menuId);
      return updated!;
    },

    async remove(menuId: number): Promise<void> {
      // menu_tags/menu_pairings/menu_ingredient_notices/menu_evidences는 ON DELETE CASCADE로 함께 정리된다.
      await pool.query(`DELETE FROM menus WHERE id = ?`, [menuId]);
    },

    async addIngredientNotice(menuId: number, notice: MenuIngredientNoticeInput): Promise<void> {
      // 같은 재료에 대해 다시 입력하면 최신 확인 결과로 덮어쓴다 (중복 행이 쌓이지 않게).
      await pool.query(
        `INSERT INTO menu_ingredient_notices (menu_id, ingredient_name, status, source_type, verified_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), source_type = VALUES(source_type), verified_at = VALUES(verified_at)`,
        [menuId, notice.ingredient_name, notice.status, notice.source_type, notice.verified_at],
      );
    },

    async removeIngredientNotice(menuId: number, ingredientName: string): Promise<void> {
      await pool.query(
        `DELETE FROM menu_ingredient_notices WHERE menu_id = ? AND ingredient_name = ?`,
        [menuId, ingredientName],
      );
    },
  };
}
