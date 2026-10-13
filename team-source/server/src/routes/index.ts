import { Router } from "express";
import type { MenuRepository, StoreRepository } from "../repositories/types.js";
import { createStoresController } from "../controllers/storesController.js";
import { createMenusController } from "../controllers/menusController.js";
import { createRecommendationsController } from "../controllers/recommendationsController.js";
import { conditionsController } from "../controllers/conditionsController.js";
import { validateBody } from "../middleware/validate.js";
import {
  recommendationRequestSchema,
  utteranceRequestSchema,
} from "../schemas/conditions.schema.js";
import { menuEvidenceInputSchema } from "../schemas/menuEvidence.schema.js";

export interface AppRepositories {
  storeRepository: StoreRepository;
  menuRepository: MenuRepository;
}

export function createApiRouter({ storeRepository, menuRepository }: AppRepositories): Router {
  const router = Router();

  const stores = createStoresController(storeRepository);
  const menus = createMenusController(storeRepository, menuRepository);
  const recommendations = createRecommendationsController(storeRepository, menuRepository);

  router.get("/stores", stores.list);
  router.get("/stores/:slug", stores.getBySlug);
  router.get("/stores/:slug/menus", menus.listByStore);
  router.post(
    "/stores/:slug/menus/:menuId/evidences",
    validateBody(menuEvidenceInputSchema),
    menus.addEvidence,
  );

  router.post("/condition-extraction", validateBody(utteranceRequestSchema), conditionsController.extract);

  router.post(
    "/stores/:slug/recommendations",
    validateBody(recommendationRequestSchema),
    recommendations.recommend,
  );

  return router;
}
