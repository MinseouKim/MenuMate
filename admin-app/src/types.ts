// kiosk-server(team-source/server)의 응답 타입을 관리자 화면에 필요한 만큼만 옮겨 적은 것.
// 서버 타입(server/src/types/menu.ts, admin.ts)과 필드명을 그대로 맞춘다.

export type MenuCategory = "main" | "side" | "drink";
export type IngredientNoticeStatus = "confirmed" | "inferred_from_menu_name" | "unknown";
export type IngredientNoticeSourceType = "official_menu" | "owner_verified" | "menu_name";

export interface IngredientNotice {
  ingredient_name: string;
  status: IngredientNoticeStatus;
  source_type: IngredientNoticeSourceType;
  verified_at: string | null;
}

export const KIND_OPTIONS = [
  "베이징덕/생선", "딤섬", "야채", "냉채/샐러드", "스프/탕",
  "치킨", "돼지고기", "소고기", "면", "밥", "해산물",
] as const;
export type MenuKind = (typeof KIND_OPTIONS)[number];

export interface Menu {
  id: number;
  store_id: number;
  name: string;
  price: number;
  category: MenuCategory;
  /** 음식 종류(면/밥/치킨 등) — category(코스 구분)와는 다른 축. 점주가 직접 고른다. */
  kind: string | null;
  spicy_level: 0 | 1 | 2 | 3;
  serving_size: string | null;
  sold_out: boolean;
  is_featured: boolean;
  featured_rank: number | null;
  flavor_tags: string[];
  texture_tags: string[];
  keyword_tags: string[];
  synonym_tags: string[];
  dietary_tags: string[];
  pairing_menu_ids: number[];
  ingredient_notices: IngredientNotice[];
  evidences: { source_summary: string }[];
}

export interface FeaturedSetItem {
  menu_id: number;
  quantity: number;
}

export interface FeaturedSet {
  id: number;
  store_id: number;
  name: string;
  rank_order: number | null;
  active: boolean;
  items: FeaturedSetItem[];
}

export interface StoreOwnerSession {
  token: string;
  username: string;
  displayName: string;
  storeId: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
