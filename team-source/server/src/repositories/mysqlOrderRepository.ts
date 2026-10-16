import type { Pool, ResultSetHeader } from "mysql2/promise";
import type { OrderCreateInput } from "../schemas/order.schema.js";
import type { StoreOrderWithItems } from "../types/storeOrder.js";
import type { OrderRepository } from "./types.js";

export function createMysqlOrderRepository(pool: Pool): OrderRepository {
  return {
    async create(storeId: number, input: OrderCreateInput): Promise<StoreOrderWithItems> {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.query<ResultSetHeader>(
          `INSERT INTO orders (store_id, order_number, total_amount, payment_method, dine_type)
           VALUES (?, ?, ?, ?, ?)`,
          [storeId, input.order_number, input.total_amount, input.payment_method, input.dine_type],
        );
        const orderId = result.insertId;
        const values = input.items.flatMap((item) => [
          orderId,
          item.menu_external_id ?? null,
          item.name,
          item.price,
          item.quantity,
          item.option ?? null,
        ]);
        const placeholders = input.items.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
        await connection.query(
          `INSERT INTO order_items (order_id, menu_external_id, name, price, quantity, option_label)
           VALUES ${placeholders}`,
          values,
        );
        await connection.commit();
        return {
          id: orderId,
          store_id: storeId,
          order_number: input.order_number,
          total_amount: input.total_amount,
          payment_method: input.payment_method,
          dine_type: input.dine_type,
          status: "paid",
          created_at: new Date().toISOString(),
          items: input.items.map((item) => ({
            menu_external_id: item.menu_external_id ?? null,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            option_label: item.option ?? null,
          })),
        };
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    },
  };
}
