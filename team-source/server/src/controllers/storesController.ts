import type { Request, Response } from "express";
import type { StoreRepository } from "../repositories/types.js";
import type { StoreRow } from "../types/menu.js";
import { ApiError } from "../types/api.js";
import { asyncHandler } from "../middleware/validate.js";

export async function resolveStoreOrThrow(
  storeRepository: StoreRepository,
  slug: string,
): Promise<StoreRow> {
  const store = await storeRepository.findBySlug(slug);
  if (!store) {
    throw ApiError.notFound(`매장을 찾을 수 없습니다: ${slug}`);
  }
  return store;
}

export function createStoresController(storeRepository: StoreRepository) {
  return {
    list: asyncHandler(async (_req: Request, res: Response) => {
      const stores = await storeRepository.list();
      res.json({ stores });
    }),

    getBySlug: asyncHandler(async (req: Request, res: Response) => {
      const store = await resolveStoreOrThrow(storeRepository, req.params.slug);
      res.json({ store });
    }),
  };
}
