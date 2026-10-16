import type { Request, Response } from "express";
import type { MenuRepository, StoreRepository } from "../repositories/types.js";
import { asyncHandler } from "../middleware/validate.js";
import { resolveStoreOrThrow } from "./storesController.js";
import type { MenuEvidenceInput } from "../schemas/menuEvidence.schema.js";
import { ApiError } from "../types/api.js";

export function createMenusController(
  storeRepository: StoreRepository,
  menuRepository: MenuRepository,
) {
  return {
    listByStore: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      const menus = await menuRepository.listByStore(store.id);
      res.json({ store, menus });
    }),

    addEvidence: asyncHandler(async (req: Request, res: Response) => {
      // 매장 존재 여부도 함께 확인해, 엉뚱한 slug로 다른 매장의 메뉴에 근거를 붙이는 실수를 막는다.
      await resolveStoreOrThrow(storeRepository, req.params.slug);

      const menuId = Number(req.params.menuId);
      if (!Number.isInteger(menuId) || menuId <= 0) {
        throw ApiError.validation("menuId는 양의 정수여야 합니다.");
      }

      const menu = await menuRepository.findById(menuId);
      if (!menu) {
        throw ApiError.notFound(`메뉴를 찾을 수 없습니다: ${menuId}`);
      }

      const input = req.body as MenuEvidenceInput;
      await menuRepository.addEvidence(menuId, {
        field_name: input.field_name,
        source_type: input.source_type,
        source_summary: input.source_summary,
        sample_size: input.sample_size ?? null,
        mention_count: input.mention_count ?? null,
        collected_at: input.collected_at ?? null,
        verified_at: input.verified_at ?? null,
      });

      res.status(201).json({ ok: true });
    }),
  };
}
