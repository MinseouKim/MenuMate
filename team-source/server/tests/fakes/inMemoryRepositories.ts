import type { MenuEvidence, MenuWithDetails, StoreRow } from "../../src/types/menu.js";
import type { MenuRepository, StoreRepository } from "../../src/repositories/types.js";

/**
 * 실제 MySQL 없이 API 레이어(라우트/컨트롤러/검증)를 테스트하기 위한 인메모리 레포지토리.
 * StoreRepository/MenuRepository 인터페이스를 그대로 구현하므로 createApp()에 그대로 주입할 수 있다.
 */
export function createInMemoryRepositories(options: {
  stores: StoreRow[];
  menus: MenuWithDetails[];
}): { storeRepository: StoreRepository; menuRepository: MenuRepository } {
  const stores = [...options.stores];
  const menus = [...options.menus];

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
  };

  return { storeRepository, menuRepository };
}
