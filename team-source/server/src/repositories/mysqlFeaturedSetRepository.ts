import type { Pool, RowDataPacket } from "mysql2/promise";
import type { FeaturedSetInput, FeaturedSetItemRow, FeaturedSetWithItems } from "../types/admin.js";
import type { FeaturedSetRepository } from "./types.js";

interface FeaturedSetQueryRow extends RowDataPacket {
  id: number;
  store_id: number;
  name: string;
  rank_order: number | null;
  active: number | boolean;
}
interface FeaturedSetItemQueryRow extends RowDataPacket {
  set_id: number;
  menu_id: number;
  quantity: number;
}

async function attachItems(
  pool: Pool,
  setRows: FeaturedSetQueryRow[],
): Promise<FeaturedSetWithItems[]> {
  if (setRows.length === 0) return [];
  const setIds = setRows.map((r) => r.id);
  const placeholders = setIds.map(() => "?").join(",");
  const [itemRows] = await pool.query<FeaturedSetItemQueryRow[]>(
    `SELECT set_id, menu_id, quantity FROM featured_set_items WHERE set_id IN (${placeholders}) ORDER BY menu_id`,
    setIds,
  );
  return setRows.map((row) => ({
    id: row.id,
    store_id: row.store_id,
    name: row.name,
    rank_order: row.rank_order,
    active: Boolean(row.active),
    items: itemRows
      .filter((i) => i.set_id === row.id)
      .map((i) => ({ menu_id: i.menu_id, quantity: i.quantity })),
  }));
}

async function replaceItems(pool: Pool, setId: number, items: FeaturedSetItemRow[]): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`DELETE FROM featured_set_items WHERE set_id = ?`, [setId]);
    if (items.length > 0) {
      const values = items.flatMap((item) => [setId, item.menu_id, item.quantity]);
      const placeholders = items.map(() => "(?, ?, ?)").join(", ");
      await connection.query(
        `INSERT INTO featured_set_items (set_id, menu_id, quantity) VALUES ${placeholders}`,
        values,
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export function createMysqlFeaturedSetRepository(pool: Pool): FeaturedSetRepository {
  return {
    async listByStore(storeId: number): Promise<FeaturedSetWithItems[]> {
      const [setRows] = await pool.query<FeaturedSetQueryRow[]>(
        `SELECT id, store_id, name, rank_order, active FROM featured_sets
           WHERE store_id = ? ORDER BY (rank_order IS NULL), rank_order, id`,
        [storeId],
      );
      return attachItems(pool, setRows);
    },

    async findById(setId: number): Promise<FeaturedSetWithItems | null> {
      const [setRows] = await pool.query<FeaturedSetQueryRow[]>(
        `SELECT id, store_id, name, rank_order, active FROM featured_sets WHERE id = ? LIMIT 1`,
        [setId],
      );
      const [withItems] = await attachItems(pool, setRows);
      return withItems ?? null;
    },

    async create(storeId: number, input: FeaturedSetInput): Promise<FeaturedSetWithItems> {
      const [result] = await pool.query<import("mysql2/promise").ResultSetHeader>(
        `INSERT INTO featured_sets (store_id, name, rank_order, active) VALUES (?, ?, ?, ?)`,
        [storeId, input.name, input.rank_order ?? null, input.active ?? true],
      );
      await replaceItems(pool, result.insertId, input.items);
      const created = await this.findById(result.insertId);
      return created!;
    },

    async update(setId: number, input: FeaturedSetInput): Promise<FeaturedSetWithItems> {
      await pool.query(
        `UPDATE featured_sets SET name = ?, rank_order = ?, active = ? WHERE id = ?`,
        [input.name, input.rank_order ?? null, input.active ?? true, setId],
      );
      await replaceItems(pool, setId, input.items);
      const updated = await this.findById(setId);
      return updated!;
    },

    async remove(setId: number): Promise<void> {
      // featured_set_items는 ON DELETE CASCADE로 함께 정리된다.
      await pool.query(`DELETE FROM featured_sets WHERE id = ?`, [setId]);
    },
  };
}
