/**
 * 메뉴 도메인 타입.
 *
 * DB는 정규화된 관계형 테이블(menus/menu_tags/menu_pairings/menu_ingredient_notices/menu_evidences)이지만,
 * 추천 엔진과 API 응답에서는 메뉴 하나를 다루기 쉽도록 MenuWithDetails로 묶어서 사용한다.
 * 이 묶음 구조는 특정 매장에 종속되지 않는다 — store_id/slug만 바뀌면 다른 매장 데이터에도 그대로 재사용된다.
 */

export type MenuCategory = "main" | "side" | "drink";

export type MenuTagType = "flavor" | "texture" | "keyword" | "synonym" | "dietary";

export interface MenuTag {
  tag_type: MenuTagType;
  tag: string;
}

/**
 * 알레르기 "안전 여부 보장" 테이블이 아니다 — 확인된/유추된/불명 재료 정보만 기록한다.
 * status가 'unknown'인 행은 추천 하드 필터(제외 재료)에 근거로 쓰지 않는다.
 */
export type IngredientNoticeStatus = "confirmed" | "inferred_from_menu_name" | "unknown";
export type IngredientNoticeSourceType = "official_menu" | "owner_verified" | "menu_name";

export interface MenuIngredientNotice {
  ingredient_name: string;
  status: IngredientNoticeStatus;
  source_type: IngredientNoticeSourceType;
  verified_at: string | null;
}

export type MenuEvidenceSourceType =
  | "official_menu"
  | "manual_public_review_aggregate"
  | "team_tasting"
  | "owner_verified"
  | "consented_feedback";

/** 가격/품절/재료/알레르기 관련 근거에는 사용할 수 없는 소스 — zod 스키마와 서비스 레이어에서 함께 검증한다. */
export const EVIDENCE_SOURCE_RESTRICTED_FIELD_PREFIXES = [
  "price",
  "sold_out",
  "ingredient",
  "allergen",
  "allergy",
] as const;

export interface MenuEvidence {
  field_name: string;
  source_type: MenuEvidenceSourceType;
  source_summary: string;
  sample_size: number | null;
  mention_count: number | null;
  collected_at: string | null;
  verified_at: string | null;
}

export interface MenuRow {
  id: number;
  store_id: number;
  name: string;
  price: number;
  category: MenuCategory;
  spicy_level: 0 | 1 | 2 | 3;
  serving_size: string | null;
  sold_out: boolean;
}

export interface MenuWithDetails extends MenuRow {
  flavor_tags: string[];
  texture_tags: string[];
  keyword_tags: string[];
  synonym_tags: string[];
  dietary_tags: string[];
  pairing_menu_ids: number[];
  ingredient_notices: MenuIngredientNotice[];
  evidences: MenuEvidence[];
}

export interface StoreRow {
  id: number;
  slug: string;
  name: string;
  dataset_as_of: string | null;
}
