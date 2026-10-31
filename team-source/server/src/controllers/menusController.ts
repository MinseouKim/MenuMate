import type { Request, Response } from "express";
import type { MenuRepository, StoreRepository } from "../repositories/types.js";
import { asyncHandler } from "../middleware/validate.js";
import { resolveStoreOrThrow } from "./storesController.js";
import type { MenuEvidenceInput } from "../schemas/menuEvidence.schema.js";
import { ApiError } from "../types/api.js";
import { ensureOwnerMatchesStore } from "../middleware/auth.js";

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
      // 로그인한 점주의 매장과 요청 매장이 같아야 한다 (다른 매장 점주가 근거를 넣지 못하게).
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      ensureOwnerMatchesStore(req, store.id);

      const menuId = Number(req.params.menuId);
      if (!Number.isInteger(menuId) || menuId <= 0) {
        throw ApiError.validation("menuId는 양의 정수여야 합니다.");
      }

      const menu = await menuRepository.findById(menuId);
      // 다른 매장의 메뉴 id를 넣어도 이 매장 메뉴처럼 처리되지 않게 매장 소속까지 확인한다.
      if (!menu || menu.store_id !== store.id) {
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
