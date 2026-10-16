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
  /** 음식 종류(베이징덕/생선, 딤섬, 면, 밥 등) — category(코스 구분)와는 다른 축. 관리자 화면에서 점주가 쓴다. */
  kind: string | null;
  /** 키오스크 정적 데이터(menus.json)의 원래 id — 실시간 동기화를 위한 내부 식별자. 관리자가 바꿀 수 없다. */
  external_id: string | null;
  spicy_level: 0 | 1 | 2 | 3;
  serving_size: string | null;
  sold_out: boolean;
  /** 점주가 "추천 메뉴"로 지정했는지. 추천 엔진에서 가점 대상이 된다 (안전 하드 필터는 그대로 적용). */
  is_featured: boolean;
  /** 추천 메뉴들 사이의 노출 우선순위 (작을수록 먼저). 없으면 지정 순서 없이 동일 가점. */
  featured_rank: number | null;
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

/** 관리자 화면에서 메뉴를 새로 만들 때 입력. */
export interface MenuCreateInput {
  name: string;
  price: number;
  category: MenuCategory;
  /** 음식 종류 — 관리자 화면에서 입력 가능. external_id는 여기 없다 (가져오기 스크립트 전용, API로는 설정 불가). */
  kind?: string | null;
  spicy_level: 0 | 1 | 2 | 3;
  serving_size?: string | null;
  sold_out?: boolean;
}

/** 관리자 화면에서 메뉴를 수정할 때 입력 — 보낸 필드만 반영한다(부분 수정). */
export interface MenuUpdateInput {
  name?: string;
  price?: number;
  category?: MenuCategory;
  kind?: string | null;
  spicy_level?: 0 | 1 | 2 | 3;
  serving_size?: string | null;
  sold_out?: boolean;
  is_featured?: boolean;
  featured_rank?: number | null;
}

export interface MenuIngredientNoticeInput {
  ingredient_name: string;
  status: IngredientNoticeStatus;
  source_type: IngredientNoticeSourceType;
  verified_at: string | null;
}
