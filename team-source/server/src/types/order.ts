import type { MenuWithDetails } from "./menu.js";

/**
 * 사용자의 발화(또는 텍스트 입력)에서 추출한 구조화된 조건.
 * 프론트엔드 src/types/order.ts의 ExtractedConditions와 필드를 맞춰서,
 * 프론트가 그대로 이 서버 API에 보낼 수 있게 했다.
 */
export interface ExtractedConditions {
  party_size: number;
  spicy_level: 0 | 1 | 2 | 3 | null;
  preferred_textures: string[];
  budget_per_person: number | null;
  excluded_ingredients: string[];
  food_keywords: string[];
  raw_utterance: string;
  /** 음식 종류(키오스크 KIND_OPTIONS 값, 예: "딤섬"). 없거나 "상관없음"이면 서버가 발화/키워드에서 찾는다. */
  kind?: string | null;
  /** 총예산(원). 있으면 1인 예산 x 인원수 대신 이 금액을 조합 합계의 상한으로 쓴다. */
  total_budget?: number | null;
}

export function emptyConditions(rawUtterance = ""): ExtractedConditions {
  return {
    party_size: 1,
    spicy_level: null,
    preferred_textures: [],
    budget_per_person: null,
    excluded_ingredients: [],
    food_keywords: [],
    raw_utterance: rawUtterance,
  };
}

export type VisionEstimate =
  | {
      status: "unavailable";
      reason: string;
    }
  | {
      status: "ok";
      age_bracket: "child" | "teen" | "adult" | "senior";
      gender_guess: "unknown" | "male_leaning" | "female_leaning";
      confidence: number;
    };

/** 추천 한 건의 구성 방식 — 키오스크 화면(prototype/recommendation.ts)의 구성과 같다. */
export type RecommendationSetType =
  | "single" // 메뉴 하나 (인원에 맞춰 수량 계산)
  | "with_side" // 메뉴 + 함께 먹기 좋은 곁들임(페어링) 1개
  | "split" // 서로 다른 메뉴 2개로 인원을 나눠 채움
  | "light" // 가벼운 구성: 식사 + 딤섬·스프 같은 곁들임
  | "full_set" // 중식 한상: 요리 + 식사 + (곁들임)
  | "owner_set"; // 점주가 관리자 화면에서 지정한 추천 세트

export interface RecommendationLine {
  menu: MenuWithDetails;
  quantity: number;
}

export interface RecommendedSet {
  main: MenuWithDetails;
  /** main을 뺀 나머지 구성 메뉴 (예전 응답과의 호환용 — 수량은 lines에 있다). */
  sides: MenuWithDetails[];
  /** 구성 전체와 수량. 합계는 total_price. */
  lines: RecommendationLine[];
  total_price: number;
  set_type: RecommendationSetType;
  /** 화면에 보여 줄 추천 이유 (키오스크 화면과 같은 문장). */
  matched_conditions: string[];
  matched_attributes: string[];
  /** 확인된/유추된 재료 주의사항 — "안전 보장"이 아니라 참고용 표시임을 응답 레벨 안내문구와 함께 전달한다. */
  cautions: string[];
  evidence_sources: string[];
  last_verified_at: string | null;
  score: number;
  /** 점주가 지정한 추천 메뉴/세트에서 비롯된 추천인지 — 프론트에서 "사장님 추천" 표시에 사용. */
  is_owner_pick: boolean;
  /** 점주가 지정한 "추천 세트"에서 나온 추천이면 그 세트 이름. 단일 메뉴 추천이면 null. */
  owner_set_label: string | null;
}

/**
 * 추천 안전 원칙 (handoff + 백엔드 작업 지시):
 * 제외 재료 요청은 confirmed/inferred_from_menu_name 근거가 있을 때만 하드 필터로 반영할 수 있지만,
 * "알레르기가 있어요"라는 말에도 시스템이 안전을 보장하거나 "안전하다"고 단정해서는 안 된다.
 * 모든 추천 응답에는 이 안내문구를 항상 포함한다.
 *
 * 점주 지정 추천(세트/단일 메뉴)도 이 원칙에서 예외가 아니다 — 확인된/유추된 제외 재료와 겹치거나
 * 품절된 경우에는 점주 지정이라도 추천에서 제외한다 (recommendationService.ts 참고).
 */
export const ALLERGY_SAFETY_NOTICE =
  "알레르기 및 교차접촉 여부는 매장에 직접 확인해 주세요. 본 추천은 안전성을 보장하지 않습니다.";
