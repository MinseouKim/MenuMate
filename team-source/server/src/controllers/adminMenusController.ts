import type { Request, Response } from "express";
import type { MenuRepository, StoreRepository } from "../repositories/types.js";
import { asyncHandler } from "../middleware/validate.js";
import { ensureOwnerMatchesStore } from "../middleware/auth.js";
import { resolveStoreOrThrow } from "./storesController.js";
import { parsePositiveInt } from "./adminShared.js";
import type { IngredientNoticeInput, MenuCreateInput, MenuUpdateInput } from "../schemas/adminMenu.schema.js";
import { ApiError } from "../types/api.js";

async function resolveOwnedMenuOrThrow(menuRepository: MenuRepository, storeId: number, menuIdParam: string) {
  const menuId = parsePositiveInt(menuIdParam, "menuId");
  const menu = await menuRepository.findById(menuId);
  if (!menu || menu.store_id !== storeId) {
    throw ApiError.notFound(`메뉴를 찾을 수 없습니다: ${menuIdParam}`);
  }
  return menu;
}

export function createAdminMenusController(
  storeRepository: StoreRepository,
  menuRepository: MenuRepository,
) {
  return {
    create: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      ensureOwnerMatchesStore(req, store.id);

      const input = req.body as MenuCreateInput;
      const menu = await menuRepository.create(store.id, input);
      res.status(201).json({ menu });
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      ensureOwnerMatchesStore(req, store.id);
      await resolveOwnedMenuOrThrow(menuRepository, store.id, req.params.menuId);

      const patch = req.body as MenuUpdateInput;
      const menu = await menuRepository.update(Number(req.params.menuId), patch);
      res.json({ menu });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      ensureOwnerMatchesStore(req, store.id);
      await resolveOwnedMenuOrThrow(menuRepository, store.id, req.params.menuId);

      await menuRepository.remove(Number(req.params.menuId));
      res.status(204).send();
    }),

    addIngredientNotice: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      ensureOwnerMatchesStore(req, store.id);
      await resolveOwnedMenuOrThrow(menuRepository, store.id, req.params.menuId);

      const notice = req.body as IngredientNoticeInput;
      await menuRepository.addIngredientNotice(Number(req.params.menuId), {
        ingredient_name: notice.ingredient_name,
        status: notice.status,
        source_type: notice.source_type,
        verified_at: notice.verified_at ?? null,
      });
      res.status(201).json({ ok: true });
    }),

    removeIngredientNotice: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      ensureOwnerMatchesStore(req, store.id);
      await resolveOwnedMenuOrThrow(menuRepository, store.id, req.params.menuId);

      await menuRepository.removeIngredientNotice(
        Number(req.params.menuId),
        decodeURIComponent(req.params.ingredientName),
      );
      res.status(204).send();
    }),
  };
}
