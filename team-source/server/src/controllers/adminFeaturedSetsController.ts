import type { Request, Response } from "express";
import type { FeaturedSetRepository, MenuRepository, StoreRepository } from "../repositories/types.js";
import { asyncHandler } from "../middleware/validate.js";
import { ensureOwnerMatchesStore } from "../middleware/auth.js";
import { resolveStoreOrThrow } from "./storesController.js";
import { parsePositiveInt } from "./adminShared.js";
import type { FeaturedSetInput } from "../schemas/featuredSet.schema.js";
import { ApiError } from "../types/api.js";

/** 세트에 담긴 메뉴가 전부 같은 매장 소속인지 확인한다 (다른 매장 메뉴를 몰래 끼워 넣는 것 방지). */
async function assertItemsBelongToStore(
  menuRepository: MenuRepository,
  storeId: number,
  items: FeaturedSetInput["items"],
): Promise<void> {
  for (const item of items) {
    const menu = await menuRepository.findById(item.menu_id);
    if (!menu || menu.store_id !== storeId) {
      throw ApiError.validation(`세트에 포함된 메뉴를 찾을 수 없습니다: ${item.menu_id}`);
    }
  }
}

export function createAdminFeaturedSetsController(
  storeRepository: StoreRepository,
  menuRepository: MenuRepository,
  featuredSetRepository: FeaturedSetRepository,
) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      ensureOwnerMatchesStore(req, store.id);
      const featuredSets = await featuredSetRepository.listByStore(store.id);
      res.json({ featuredSets });
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      ensureOwnerMatchesStore(req, store.id);

      const input = req.body as FeaturedSetInput;
      await assertItemsBelongToStore(menuRepository, store.id, input.items);
      const featuredSet = await featuredSetRepository.create(store.id, input);
      res.status(201).json({ featuredSet });
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      ensureOwnerMatchesStore(req, store.id);

      const setId = parsePositiveInt(req.params.setId, "setId");
      const existing = await featuredSetRepository.findById(setId);
      if (!existing || existing.store_id !== store.id) {
        throw ApiError.notFound(`추천 세트를 찾을 수 없습니다: ${req.params.setId}`);
      }

      const input = req.body as FeaturedSetInput;
      await assertItemsBelongToStore(menuRepository, store.id, input.items);
      const featuredSet = await featuredSetRepository.update(setId, input);
      res.json({ featuredSet });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      ensureOwnerMatchesStore(req, store.id);

      const setId = parsePositiveInt(req.params.setId, "setId");
      const existing = await featuredSetRepository.findById(setId);
      if (!existing || existing.store_id !== store.id) {
        throw ApiError.notFound(`추천 세트를 찾을 수 없습니다: ${req.params.setId}`);
      }

      await featuredSetRepository.remove(setId);
      res.status(204).send();
    }),
  };
}
