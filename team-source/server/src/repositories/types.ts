import type {
  MenuCreateInput,
  MenuEvidence,
  MenuIngredientNoticeInput,
  MenuUpdateInput,
  MenuWithDetails,
  StoreRow,
} from "../types/menu.js";
import type { FeaturedSetInput, FeaturedSetWithItems, StoreOwnerRow } from "../types/admin.js";
import type { OrderCreateInput } from "../schemas/order.schema.js";
import type { StoreOrderWithItems } from "../types/storeOrder.js";

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

  // --- 아래부터는 점주 관리자 화면용 CRUD ---
  create(storeId: number, input: MenuCreateInput): Promise<MenuWithDetails>;
  update(menuId: number, patch: MenuUpdateInput): Promise<MenuWithDetails>;
  remove(menuId: number): Promise<void>;
  addIngredientNotice(menuId: number, notice: MenuIngredientNoticeInput): Promise<void>;
  removeIngredientNotice(menuId: number, ingredientName: string): Promise<void>;
}

/** 점주 로그인 계정. 매장당 1계정을 가정하지만 store_id로 연결해 여러 매장으로 확장 가능하게 둔다. */
export interface StoreOwnerRepository {
  findByUsername(username: string): Promise<StoreOwnerRow | null>;
}

/** 점주가 지정한 "추천 세트"(메인+사이드 묶음 등). 추천 엔진에서 우선 노출된다. */
export interface FeaturedSetRepository {
  listByStore(storeId: number): Promise<FeaturedSetWithItems[]>;
  findById(setId: number): Promise<FeaturedSetWithItems | null>;
  create(storeId: number, input: FeaturedSetInput): Promise<FeaturedSetWithItems>;
  update(setId: number, input: FeaturedSetInput): Promise<FeaturedSetWithItems>;
  remove(setId: number): Promise<void>;
}

/** 결제 완료 주문 저장 — 키오스크가 결제를 끝낸 직후 (최선을 다해) 호출한다. */
export interface OrderRepository {
  create(storeId: number, input: OrderCreateInput): Promise<StoreOrderWithItems>;
}
