import type { MenuEvidence, MenuWithDetails, StoreRow } from "../types/menu.js";

/**
 * Repository는 인터페이스로 분리한다 — 실제 구현(MySQL)과 테스트용 인메모리 구현을 모두
 * 이 인터페이스로 바꿔 끼울 수 있게 해서, 서비스/컨트롤러 테스트가 실제 DB 없이도 가능하게 한다.
 */
export interface StoreRepository {
  findBySlug(slug: string): Promise<StoreRow | null>;
  list(): Promise<StoreRow[]>;
}

export interface MenuRepository {
  /** 매장의 모든 메뉴를 태그/페어링/재료 노티스/근거까지 포함해서 가져온다. */
  listByStore(storeId: number): Promise<MenuWithDetails[]>;
  findById(menuId: number): Promise<MenuWithDetails | null>;
  /** 관리자가 메뉴 근거를 추가할 때 사용 (manual_public_review_aggregate 제약은 호출 전 zod로 검증됨). */
  addEvidence(menuId: number, evidence: MenuEvidence): Promise<void>;
}
