import { z } from "zod";

/**
 * 결제 완료 주문 저장 입력. 키오스크(KioskApp.tsx complete())가 결제를 끝낸 직후 보낸다.
 * 메뉴 항목은 menus 테이블을 참조하지 않고 이름/가격을 그대로 받는다 — 나중에 메뉴 가격이
 * 바뀌거나 삭제돼도 이미 결제된 주문의 내용은 그대로 남아야 하기 때문이다.
 */
export const orderItemInputSchema = z.object({
  menu_external_id: z.string().min(1).max(50).nullable().optional(),
  name: z.string().min(1).max(200),
  price: z.number().int().nonnegative().max(1_000_000),
  quantity: z.number().int().positive().max(99),
  option: z.string().max(100).nullable().optional(),
});

export const orderCreateInputSchema = z.object({
  order_number: z.string().min(1).max(20),
  total_amount: z.number().int().nonnegative().max(10_000_000),
  payment_method: z.string().min(1).max(30),
  dine_type: z.enum(["dine_in", "takeout"]),
  items: z.array(orderItemInputSchema).min(1),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type OrderCreateInput = z.infer<typeof orderCreateInputSchema>;
