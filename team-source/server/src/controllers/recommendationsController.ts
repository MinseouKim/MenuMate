import type { Request, Response } from "express";
import type { MenuRepository, StoreRepository } from "../repositories/types.js";
import { asyncHandler } from "../middleware/validate.js";
import { resolveStoreOrThrow } from "./storesController.js";
import type { RecommendationRequestBody } from "../schemas/conditions.schema.js";
import { recommend } from "../services/recommendationService.js";
import { ALLERGY_SAFETY_NOTICE } from "../types/order.js";

export function createRecommendationsController(
  storeRepository: StoreRepository,
  menuRepository: MenuRepository,
) {
  return {
    recommend: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      const { conditions, vision } = req.body as RecommendationRequestBody;

      const menu = await menuRepository.listByStore(store.id);
      const recommendations = recommend({
        conditions,
        vision: vision ?? { status: "unavailable", reason: "비전 추정이 제공되지 않았습니다." },
        menu,
      });

      res.json({
        recommendations,
        // 알레르기/교차접촉 비보장 원칙 — 모든 추천 응답에 항상 포함한다.
        allergy_safety_notice: ALLERGY_SAFETY_NOTICE,
        safety_flags: { allergy_safety_guaranteed: false },
      });
    }),
  };
}
