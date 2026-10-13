import type { Pool, RowDataPacket } from "mysql2/promise";
import type { StoreRow } from "../types/menu.js";
import type { StoreRepository } from "./types.js";

interface StoreQueryRow extends RowDataPacket {
  id: number;
  slug: string;
  name: string;
  dataset_as_of: string | null;
}

export function createMysqlStoreRepository(pool: Pool): StoreRepository {
  return {
    async findBySlug(slug: string): Promise<StoreRow | null> {
      const [rows] = await pool.query<StoreQueryRow[]>(
        "SELECT id, slug, name, dataset_as_of FROM stores WHERE slug = ? LIMIT 1",
        [slug],
      );
      const row = rows[0];
      return row ? { id: row.id, slug: row.slug, name: row.name, dataset_as_of: row.dataset_as_of } : null;
    },

    async list(): Promise<StoreRow[]> {
      const [rows] = await pool.query<StoreQueryRow[]>(
        "SELECT id, slug, name, dataset_as_of FROM stores ORDER BY id",
      );
      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        dataset_as_of: row.dataset_as_of,
      }));
    },
  };
}
