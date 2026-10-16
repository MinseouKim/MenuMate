import type { Request, Response } from "express";
import type { FeaturedSetRepository, MenuRepository, StoreRepository } from "../repositories/types.js";
import { asyncHandler } from "../middleware/validate.js";
import { resolveStoreOrThrow } from "./storesController.js";
import type { RecommendationRequestBody } from "../schemas/conditions.schema.js";
import { recommend, type FeaturedSetForRecommendation } from "../services/recommendationService.js";
import { ALLERGY_SAFETY_NOTICE } from "../types/order.js";
import type { MenuWithDetails } from "../types/menu.js";

export function createRecommendationsController(
  storeRepository: StoreRepository,
  menuRepository: MenuRepository,
  featuredSetRepository: FeaturedSetRepository,
) {
  return {
    recommend: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      const { conditions, vision } = req.body as RecommendationRequestBody;

      const menu = await menuRepository.listByStore(store.id);
      const menuById = new Map<number, MenuWithDetails>(menu.map((m) => [m.id, m]));

      const activeFeaturedSets = await featuredSetRepository.listByStore(store.id);
      const featuredSets: FeaturedSetForRecommendation[] = activeFeaturedSets
        .filter((set) => set.active)
        .map((set) => ({
          name: set.name,
          // 세트에 담긴 메뉴 id가 어떤 이유로든(삭제 등) 더 이상 없으면 그 항목만 조용히 빠진다.
          items: set.items
            .map((item) => {
              const resolved = menuById.get(item.menu_id);
              return resolved ? { menu: resolved, quantity: item.quantity } : null;
            })
            .filter((item): item is { menu: MenuWithDetails; quantity: number } => item !== null),
        }))
        .filter((set) => set.items.length > 0);

      const recommendations = recommend({
        conditions,
        vision: vision ?? { status: "unavailable", reason: "비전 추정이 제공되지 않았습니다." },
        menu,
        featuredSets,
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
