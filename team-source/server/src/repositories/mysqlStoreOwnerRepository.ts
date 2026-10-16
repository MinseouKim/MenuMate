import type { Pool, RowDataPacket } from "mysql2/promise";
import type { StoreOwnerRow } from "../types/admin.js";
import type { StoreOwnerRepository } from "./types.js";

interface StoreOwnerQueryRow extends RowDataPacket {
  id: number;
  store_id: number;
  username: string;
  password_hash: string;
  display_name: string;
}

export function createMysqlStoreOwnerRepository(pool: Pool): StoreOwnerRepository {
  return {
    async findByUsername(username: string): Promise<StoreOwnerRow | null> {
      const [rows] = await pool.query<StoreOwnerQueryRow[]>(
        `SELECT id, store_id, username, password_hash, display_name
           FROM store_owners WHERE username = ? LIMIT 1`,
        [username],
      );
      const row = rows[0];
      return row
        ? {
            id: row.id,
            store_id: row.store_id,
            username: row.username,
            password_hash: row.password_hash,
            display_name: row.display_name,
          }
        : null;
    },
  };
}
