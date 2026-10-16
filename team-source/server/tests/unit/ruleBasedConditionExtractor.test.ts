import { describe, expect, it } from "vitest";
import { extractConditionsRuleBased } from "../../src/services/ruleBasedConditionExtractor.js";

describe("extractConditionsRuleBased", () => {
  it("인원수, 맵기, 제외 재료, 음식 키워드를 함께 추출한다", () => {
    const result = extractConditionsRuleBased(
      "매운 면 요리 먹고 싶어요. 두 명이고 해산물은 빼주세요.",
    );

    expect(result.party_size).toBe(2);
    expect(result.spicy_level).toBe(2);
    expect(result.food_keywords).toContain("면");
    // 백엔드는 "해산물"을 제외 가능한 재료 카테고리로 인식한다 (menu_ingredient_notices.ingredient_name과 매칭)
    expect(result.excluded_ingredients).toContain("해산물");
  });

  it("handoff 예시 발화에서 인원수와 맵기를 추출한다", () => {
    const result = extractConditionsRuleBased("매운 음식 먹고 싶어요, 2명이요.");
    expect(result.party_size).toBe(2);
    expect(result.spicy_level).toBe(2);
  });

  it("안 매운맛을 명시하면 레벨 0으로 추출한다", () => {
    const result = extractConditionsRuleBased("저는 안 매운 걸로 주세요.");
    expect(result.spicy_level).toBe(0);
  });

  it("갑각류 알레르기를 제외 재료로 인식한다", () => {
    const result = extractConditionsRuleBased("갑각류 알레르기가 있어서 빼주세요.");
    expect(result.excluded_ingredients).toContain("갑각류");
  });

  it("조건이 전혀 없으면 기본값(인원 1명, 제약 없음)을 반환한다", () => {
    const result = extractConditionsRuleBased("아무거나 괜찮아요.");
    expect(result.party_size).toBe(1);
    expect(result.spicy_level).toBeNull();
    expect(result.excluded_ingredients).toEqual([]);
  });
});
