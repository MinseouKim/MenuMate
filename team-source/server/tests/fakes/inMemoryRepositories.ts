import type {
  MenuCreateInput,
  MenuEvidence,
  MenuIngredientNoticeInput,
  MenuUpdateInput,
  MenuWithDetails,
  StoreRow,
} from "../../src/types/menu.js";
import type { FeaturedSetInput, FeaturedSetWithItems, StoreOwnerRow } from "../../src/types/admin.js";
import type {
  FeaturedSetRepository,
  MenuRepository,
  StoreOwnerRepository,
  StoreRepository,
} from "../../src/repositories/types.js";

/**
 * 실제 MySQL 없이 API 레이어(라우트/컨트롤러/검증)를 테스트하기 위한 인메모리 레포지토리.
 * *Repository 인터페이스를 그대로 구현하므로 createApp()에 그대로 주입할 수 있다.
 */
export function createInMemoryRepositories(options: {
  stores: StoreRow[];
  menus: MenuWithDetails[];
  storeOwners?: StoreOwnerRow[];
  featuredSets?: FeaturedSetWithItems[];
}): {
  storeRepository: StoreRepository;
  menuRepository: MenuRepository;
  storeOwnerRepository: StoreOwnerRepository;
  featuredSetRepository: FeaturedSetRepository;
} {
  const stores = [...options.stores];
  const menus = [...options.menus];
  const storeOwners = [...(options.storeOwners ?? [])];
  const featuredSets = [...(options.featuredSets ?? [])];
  let nextMenuId = Math.max(0, ...menus.map((m) => m.id)) + 1;
  let nextSetId = Math.max(0, ...featuredSets.map((s) => s.id)) + 1;

  const storeRepository: StoreRepository = {
    async findBySlug(slug: string) {
      return stores.find((s) => s.slug === slug) ?? null;
    },
    async list() {
      return stores;
    },
  };

  const menuRepository: MenuRepository = {
    async listByStore(storeId: number) {
      return menus.filter((m) => m.store_id === storeId);
    },
    async findById(menuId: number) {
      return menus.find((m) => m.id === menuId) ?? null;
    },
    async addEvidence(menuId: number, evidence: MenuEvidence) {
      const menu = menus.find((m) => m.id === menuId);
      if (menu) menu.evidences.push(evidence);
    },
    async create(storeId: number, input: MenuCreateInput) {
      const created: MenuWithDetails = {
        id: nextMenuId++,
        store_id: storeId,
        name: input.name,
        price: input.price,
        category: input.category,
        kind: input.kind ?? null,
        external_id: null,
        spicy_level: input.spicy_level,
        serving_size: input.serving_size ?? null,
        sold_out: input.sold_out ?? false,
        is_featured: false,
        featured_rank: null,
        flavor_tags: [],
        texture_tags: [],
        keyword_tags: [],
        synonym_tags: [],
        dietary_tags: [],
        pairing_menu_ids: [],
        ingredient_notices: [],
        evidences: [],
      };
      menus.push(created);
      return created;
    },
    async update(menuId: number, patch: MenuUpdateInput) {
      const menu = menus.find((m) => m.id === menuId);
      if (!menu) throw new Error(`menu not found: ${menuId}`);
      Object.assign(menu, patch);
      return menu;
    },
    async remove(menuId: number) {
      const idx = menus.findIndex((m) => m.id === menuId);
      if (idx >= 0) menus.splice(idx, 1);
    },
    async addIngredientNotice(menuId: number, notice: MenuIngredientNoticeInput) {
      const menu = menus.find((m) => m.id === menuId);
      if (!menu) return;
      const existing = menu.ingredient_notices.find((n) => n.ingredient_name === notice.ingredient_name);
      if (existing) Object.assign(existing, notice);
      else menu.ingredient_notices.push({ ...notice });
    },
    async removeIngredientNotice(menuId: number, ingredientName: string) {
      const menu = menus.find((m) => m.id === menuId);
      if (!menu) return;
      menu.ingredient_notices = menu.ingredient_notices.filter(
        (n) => n.ingredient_name !== ingredientName,
      );
    },
  };

  const storeOwnerRepository: StoreOwnerRepository = {
    async findByUsername(username: string) {
      return storeOwners.find((o) => o.username === username) ?? null;
    },
  };

  const featuredSetRepository: FeaturedSetRepository = {
    async listByStore(storeId: number) {
      return featuredSets.filter((s) => s.store_id === storeId);
    },
    async findById(setId: number) {
      return featuredSets.find((s) => s.id === setId) ?? null;
    },
    async create(storeId: number, input: FeaturedSetInput) {
      const created: FeaturedSetWithItems = {
        id: nextSetId++,
        store_id: storeId,
        name: input.name,
        rank_order: input.rank_order ?? null,
        active: input.active ?? true,
        items: input.items,
      };
      featuredSets.push(created);
      return created;
    },
    async update(setId: number, input: FeaturedSetInput) {
      const set = featuredSets.find((s) => s.id === setId);
      if (!set) throw new Error(`featured set not found: ${setId}`);
      set.name = input.name;
      set.rank_order = input.rank_order ?? null;
      set.active = input.active ?? true;
      set.items = input.items;
      return set;
    },
    async remove(setId: number) {
      const idx = featuredSets.findIndex((s) => s.id === setId);
      if (idx >= 0) featuredSets.splice(idx, 1);
    },
  };

  return { storeRepository, menuRepository, storeOwnerRepository, featuredSetRepository };
}
