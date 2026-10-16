/** 결제 완료 주문 1건 (DB에 저장된 뒤의 모습). 영수증 재발급·매출 집계에 쓴다. */
export interface StoreOrderRow {
  id: number;
  store_id: number;
  order_number: string;
  total_amount: number;
  payment_method: string;
  dine_type: "dine_in" | "takeout";
  status: "paid" | "cancelled";
  created_at: string;
}

export interface StoreOrderItemRow {
  menu_external_id: string | null;
  name: string;
  price: number;
  quantity: number;
  option_label: string | null;
}

export interface StoreOrderWithItems extends StoreOrderRow {
  items: StoreOrderItemRow[];
}
