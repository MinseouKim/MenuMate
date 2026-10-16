import { describe, expect, it } from "vitest";
import { recommend } from "../../src/services/recommendationService.js";
import { emptyConditions } from "../../src/types/order.js";
import type { MenuWithDetails } from "../../src/types/menu.js";

function makeMain(overrides: Partial<MenuWithDetails>): MenuWithDetails {
  return {
    id: 1,
    store_id: 1,
    name: "기본 메인",
    price: 10000,
    category: "main",
    kind: null,
    external_id: null,
    spicy_level: 0,
    serving_size: "1인분",
    sold_out: false,
    is_featured: false,
    featured_rank: null,
    flavor_tags: [],
    texture_tags: [],
    keyword_tags: [],
    synonym_tags: [],
    dietary_tags: [],
    pairing_menu_ids: [],
    ingredient_notices: [],
    evidences: [
      {
        field_name: "overall",
        source_type: "team_tasting",
        source_summary: "테스트 픽스처",
        sample_size: 3,
        mention_count: null,
        collected_at: "2026-10-01",
        verified_at: "2026-10-01",
      },
    ],
    ...overrides,
  };
}

const unavailableVision = { status: "unavailable" as const, reason: "test" };

describe("recommendationService.recommend", () => {
  it("confirmed 상태의 제외 재료와 겹치는 메뉴는 하드 필터로 제거한다", () => {
    const menu = [
      makeMain({
        id: 1,
        name: "새우짬뽕",
        ingredient_notices: [
          { ingredient_name: "갑각류", status: "confirmed", source_type: "owner_verified", verified_at: "2026-10-01" },
        ],
      }),
      makeMain({ id: 2, name: "짜장면" }),
    ];
    const conditions = { ...emptyConditions(), excluded_ingredients: ["갑각류"] };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    expect(result.map((r) => r.main.id)).not.toContain(1);
    expect(result.map((r) => r.main.id)).toContain(2);
  });

  it("unknown 상태의 재료 노티스는 하드 필터 근거로 쓰지 않는다 (알레르기 안전 미보장 원칙)", () => {
    const menu = [
      makeMain({
        id: 1,
        name: "마라짬뽕",
        ingredient_notices: [
          { ingredient_name: "갑각류", status: "unknown", source_type: "menu_name", verified_at: null },
        ],
      }),
    ];
    const conditions = { ...emptyConditions(), excluded_ingredients: ["갑각류"] };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    // unknown은 제외 근거로 쓰지 않으므로 하드필터로 제거되지 않고 그대로 추천된다 —
    // 대신 cautions에 "확인 불가"로 노출되어 사용자가 매장에 직접 확인하도록 유도한다.
    expect(result.map((r) => r.main.id)).toContain(1);
    expect(result[0].cautions.some((c) => c.includes("확인 불가"))).toBe(true);
  });

  it("안 매운맛을 요청하면 매운 메뉴를 하드 필터로 제거한다", () => {
    const menu = [
      makeMain({ id: 1, name: "마라탕", spicy_level: 3 }),
      makeMain({ id: 2, name: "짜장면", spicy_level: 0 }),
    ];
    const conditions = { ...emptyConditions(), spicy_level: 0 as const };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    expect(result.map((r) => r.main.id)).toEqual([2]);
  });

  it("매운맛을 요청하면 안 매운 메뉴를 제거한다", () => {
    const menu = [
      makeMain({ id: 1, name: "마라탕", spicy_level: 3 }),
      makeMain({ id: 2, name: "짜장면", spicy_level: 0 }),
    ];
    const conditions = { ...emptyConditions(), spicy_level: 2 as const };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    expect(result.map((r) => r.main.id)).toEqual([1]);
  });

  it("품절 메뉴는 추천하지 않는다", () => {
    const menu = [
      makeMain({ id: 1, name: "짜장면", sold_out: true }),
      makeMain({ id: 2, name: "짬뽕" }),
    ];

    const result = recommend({ conditions: emptyConditions(), vision: unavailableVision, menu });

    expect(result.map((r) => r.main.id)).toEqual([2]);
  });

  it("음식 키워드가 일치하는 메뉴를 더 높은 점수로 우선 추천한다", () => {
    const menu = [
      makeMain({ id: 1, name: "짬뽕", flavor_tags: ["얼큰함"], keyword_tags: ["짬뽕"] }),
      makeMain({ id: 2, name: "볶음밥", flavor_tags: ["고소함"], keyword_tags: ["밥"] }),
    ];
    const conditions = { ...emptyConditions(), food_keywords: ["짬뽕"] };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    expect(result[0].main.id).toBe(1);
    expect(result[0].score).toBeGreaterThan(result.find((r) => r.main.id === 2)?.score ?? 0);
  });

  it("맵기를 명시하지 않았을 때만 비전 보조 신호가 점수에 영향을 준다", () => {
    const menu = [
      makeMain({ id: 1, name: "짜장면", spicy_level: 0 }),
      makeMain({ id: 2, name: "마라탕", spicy_level: 3 }),
    ];
    const seniorVision = {
      status: "ok" as const,
      age_bracket: "senior" as const,
      gender_guess: "unknown" as const,
      confidence: 0.6,
    };

    const withoutSpicyPreference = recommend({
      conditions: emptyConditions(),
      vision: seniorVision,
      menu,
    });
    const mildScore = withoutSpicyPreference.find((r) => r.main.id === 1)?.score;
    const spicyScore = withoutSpicyPreference.find((r) => r.main.id === 2)?.score;
    expect(mildScore).toBeGreaterThan(spicyScore ?? 0);

    const withSpicyPreference = recommend({
      conditions: { ...emptyConditions(), spicy_level: 3 },
      vision: seniorVision,
      menu,
    });
    expect(withSpicyPreference.map((r) => r.main.id)).toEqual([2]);
  });

  it("대표 메뉴끼리 점수가 같으면 featured_rank가 작은 메뉴를 먼저 추천한다", () => {
    const menu = [
      makeMain({ id: 1, name: "대표메뉴A", is_featured: true, featured_rank: 2 }),
      makeMain({ id: 2, name: "대표메뉴B", is_featured: true, featured_rank: 1 }),
      makeMain({ id: 3, name: "대표메뉴C(순위 없음)", is_featured: true, featured_rank: null }),
    ];

    const result = recommend({ conditions: emptyConditions(), vision: unavailableVision, menu });

    expect(result.map((r) => r.main.id)).toEqual([2, 1, 3]);
  });

  it("모든 추천은 main 메뉴의 evidence_sources와 last_verified_at을 포함한다", () => {
    const menu = [makeMain({ id: 1 })];
    const result = recommend({ conditions: emptyConditions(), vision: unavailableVision, menu });

    expect(result[0].evidence_sources).toContain("테스트 픽스처");
    expect(result[0].last_verified_at).toBe("2026-10-01");
  });
});
