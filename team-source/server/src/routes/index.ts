import { Router } from "express";
import type {
  FeaturedSetRepository,
  MenuRepository,
  StoreOwnerRepository,
  StoreRepository,
} from "../repositories/types.js";
import { createStoresController } from "../controllers/storesController.js";
import { createMenusController } from "../controllers/menusController.js";
import { createRecommendationsController } from "../controllers/recommendationsController.js";
import { conditionsController } from "../controllers/conditionsController.js";
import { createAuthController } from "../controllers/authController.js";
import { createAdminMenusController } from "../controllers/adminMenusController.js";
import { createAdminFeaturedSetsController } from "../controllers/adminFeaturedSetsController.js";
import { validateBody } from "../middleware/validate.js";
import { requireStoreOwner } from "../middleware/auth.js";
import {
  recommendationRequestSchema,
  utteranceRequestSchema,
} from "../schemas/conditions.schema.js";
import { menuEvidenceInputSchema } from "../schemas/menuEvidence.schema.js";
import { loginInputSchema } from "../schemas/auth.schema.js";
import {
  ingredientNoticeInputSchema,
  menuCreateInputSchema,
  menuUpdateInputSchema,
} from "../schemas/adminMenu.schema.js";
import { featuredSetInputSchema } from "../schemas/featuredSet.schema.js";

export interface AppRepositories {
  storeRepository: StoreRepository;
  menuRepository: MenuRepository;
  storeOwnerRepository: StoreOwnerRepository;
  featuredSetRepository: FeaturedSetRepository;
}

export function createApiRouter({
  storeRepository,
  menuRepository,
  storeOwnerRepository,
  featuredSetRepository,
}: AppRepositories): Router {
  const router = Router();

  const stores = createStoresController(storeRepository);
  const menus = createMenusController(storeRepository, menuRepository);
  const recommendations = createRecommendationsController(
    storeRepository,
    menuRepository,
    featuredSetRepository,
  );
  const auth = createAuthController(storeOwnerRepository);
  const adminMenus = createAdminMenusController(storeRepository, menuRepository);
  const adminFeaturedSets = createAdminFeaturedSetsController(
    storeRepository,
    menuRepository,
    featuredSetRepository,
  );

  // --- 손님용 공개 API (기존) ---
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

  // --- 점주 관리자 API (로그인 필요) ---
  router.post("/admin/login", validateBody(loginInputSchema), auth.login);

  router.post(
    "/admin/stores/:slug/menus",
    requireStoreOwner,
    validateBody(menuCreateInputSchema),
    adminMenus.create,
  );
  router.patch(
    "/admin/stores/:slug/menus/:menuId",
    requireStoreOwner,
    validateBody(menuUpdateInputSchema),
    adminMenus.update,
  );
  router.delete("/admin/stores/:slug/menus/:menuId", requireStoreOwner, adminMenus.remove);
  router.post(
    "/admin/stores/:slug/menus/:menuId/ingredient-notices",
    requireStoreOwner,
    validateBody(ingredientNoticeInputSchema),
    adminMenus.addIngredientNotice,
  );
  router.delete(
    "/admin/stores/:slug/menus/:menuId/ingredient-notices/:ingredientName",
    requireStoreOwner,
    adminMenus.removeIngredientNotice,
  );

  router.get("/admin/stores/:slug/featured-sets", requireStoreOwner, adminFeaturedSets.list);
  router.post(
    "/admin/stores/:slug/featured-sets",
    requireStoreOwner,
    validateBody(featuredSetInputSchema),
    adminFeaturedSets.create,
  );
  router.patch(
    "/admin/stores/:slug/featured-sets/:setId",
    requireStoreOwner,
    validateBody(featuredSetInputSchema),
    adminFeaturedSets.update,
  );
  router.delete(
    "/admin/stores/:slug/featured-sets/:setId",
    requireStoreOwner,
    adminFeaturedSets.remove,
  );

  return router;
}
