/**
 * 점주 관리자 화면 관련 도메인 타입.
 *
 * store_owners: 매장당 점주 로그인 계정 (이번 범위에서는 매장당 1계정을 가정하되,
 * store_id로 연결해 두어 나중에 여러 매장/여러 점주로 확장해도 구조를 바꾸지 않아도 된다).
 * featured_sets/featured_set_items: 점주가 직접 지정하는 "추천 세트" — 추천 엔진에서
 * 일반 점수 기반 추천보다 우선 노출된다 (단, 알레르기 등 안전 하드 필터는 그대로 적용됨).
 */
export interface StoreOwnerRow {
  id: number;
  store_id: number;
  username: string;
  password_hash: string;
  display_name: string;
}

export interface FeaturedSetItemRow {
  menu_id: number;
  quantity: number;
}

export interface FeaturedSetRow {
  id: number;
  store_id: number;
  name: string;
  rank_order: number | null;
  active: boolean;
}

export interface FeaturedSetWithItems extends FeaturedSetRow {
  items: FeaturedSetItemRow[];
}

export interface FeaturedSetInput {
  name: string;
  active?: boolean;
  rank_order?: number | null;
  items: FeaturedSetItemRow[];
}
