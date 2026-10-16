import type { Request, Response } from "express";
import type { OrderRepository, StoreRepository } from "../repositories/types.js";
import { asyncHandler } from "../middleware/validate.js";
import { resolveStoreOrThrow } from "./storesController.js";
import type { OrderCreateInput } from "../schemas/order.schema.js";

/**
 * 결제 완료 주문 저장 — 키오스크는 손님용 공개 기기라 로그인 없이 호출한다(점주 관리자 API와 다름).
 * 이 호출이 실패해도 키오스크 쪽 결제 완료 화면은 그대로 진행된다(KioskApp.tsx complete() 참고) —
 * 네트워크가 끊겨도 손님 응대가 막히면 안 되기 때문에, 서버 저장은 "최선을 다해 보는" 보조 기록이다.
 */
export function createOrdersController(storeRepository: StoreRepository, orderRepository: OrderRepository) {
  return {
    create: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      const input = req.body as OrderCreateInput;
      const order = await orderRepository.create(store.id, input);
      res.status(201).json({ order });
    }),
  };
}
