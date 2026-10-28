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
    serving_people: 1,
    serving_min: 1,
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
      makeMain({
        id: 2,
        name: "짜장면",
        ingredient_notices: [
          { ingredient_name: "밀", status: "confirmed", source_type: "official_menu", verified_at: "2026-10-01" },
        ],
      }),
    ];
    const conditions = { ...emptyConditions(), excluded_ingredients: ["갑각류"] };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    expect(result.map((r) => r.main.id)).not.toContain(1);
    expect(result.map((r) => r.main.id)).toContain(2);
  });

  it("제외 재료와 겹치는 노티스는 unknown 상태여도 추천에서 뺀다 (화면과 같은 안전 규칙)", () => {
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

    expect(result.map((r) => r.main.id)).not.toContain(1);
  });

  it("제외 요청과 겹치지 않는 unknown 노티스는 추천하되 '확인 불가' 주의 문구를 붙인다", () => {
    const menu = [
      makeMain({
        id: 1,
        name: "마라짬뽕",
        ingredient_notices: [
          { ingredient_name: "갑각류", status: "unknown", source_type: "menu_name", verified_at: null },
        ],
      }),
    ];
    const conditions = { ...emptyConditions(), excluded_ingredients: ["돼지고기"] };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    expect(result.map((r) => r.main.id)).toContain(1);
    expect(result[0].cautions.some((c) => c.includes("확인 불가"))).toBe(true);
  });

  it("재료 정보가 없는 메뉴는 무엇이든 빼 달라는 요청이 있으면 추천하지 않는다", () => {
    const withInfo = makeMain({
      id: 1, name: "짜장면",
      ingredient_notices: [{ ingredient_name: "밀", status: "confirmed", source_type: "official_menu", verified_at: null }],
    });
    const noInfo = makeMain({ id: 2, name: "재료 정보 없는 메뉴", ingredient_notices: [] });

    const excluded = recommend({
      conditions: { ...emptyConditions(), excluded_ingredients: ["새우"] }, vision: unavailableVision, menu: [withInfo, noInfo],
    });
    const notExcluded = recommend({ conditions: emptyConditions(), vision: unavailableVision, menu: [withInfo, noInfo] });

    expect(excluded.map((r) => r.main.id)).toEqual([1]);
    expect(notExcluded.map((r) => r.main.id).sort()).toEqual([1, 2]);
  });

  it("'해산물'을 빼면 새우·게 같은 해산물 메뉴도, 새우만 빼면 재료가 '해산물'로만 적힌 메뉴도 뺀다", () => {
    const notice = (name: string) => [{ ingredient_name: name, status: "confirmed" as const, source_type: "official_menu" as const, verified_at: null }];
    const menu = [
      makeMain({ id: 1, name: "새우요리", ingredient_notices: notice("새우") }),
      makeMain({ id: 2, name: "해물요리", ingredient_notices: notice("해산물") }),
      makeMain({ id: 3, name: "게요리", ingredient_notices: notice("게") }),
      makeMain({ id: 4, name: "돼지요리", ingredient_notices: notice("돼지고기") }),
    ];

    const noSeafood = recommend({ conditions: { ...emptyConditions(), excluded_ingredients: ["해산물"] }, vision: unavailableVision, menu });
    const noShrimp = recommend({ conditions: { ...emptyConditions(), excluded_ingredients: ["새우"] }, vision: unavailableVision, menu });

    expect(noSeafood.map((r) => r.main.id)).toEqual([4]);
    expect(noShrimp.map((r) => r.main.id).sort()).toEqual([3, 4]);
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

  it("매운맛을 요청하면 맵기가 맞는 메뉴를 먼저 추천한다 (안 매운 메뉴를 빼지는 않음 — 화면과 같음)", () => {
    const menu = [
      makeMain({ id: 1, name: "마라탕", spicy_level: 3 }),
      makeMain({ id: 2, name: "짜장면", spicy_level: 0 }),
    ];
    const conditions = { ...emptyConditions(), spicy_level: 2 as const };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    expect(result[0].main.id).toBe(1);
    expect(result.map((r) => r.main.id)).toContain(2);
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
    expect(withSpicyPreference[0].main.id).toBe(2);
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

  it("예산을 초과하는 메뉴는 점수와 상관없이 하드 필터로 완전히 제외한다", () => {
    const menu = [
      makeMain({ id: 1, name: "짬뽕", price: 20000, keyword_tags: ["짬뽕"] }),
      makeMain({ id: 2, name: "짜장면", price: 9000 }),
    ];
    const conditions = {
      ...emptyConditions(),
      budget_per_person: 10000,
      food_keywords: ["짬뽕"],
    };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    // 키워드가 일치해도 예산(10,000원)을 넘는 메뉴(id:1, 20,000원)는 결과에 전혀 나오지 않아야 한다.
    expect(result.map((r) => r.main.id)).not.toContain(1);
    expect(result.map((r) => r.main.id)).toContain(2);
  });

  it("예산 조건이 없으면 가격과 상관없이 모든 메뉴가 후보에 남는다", () => {
    const menu = [
      makeMain({ id: 1, name: "비싼 메뉴", price: 50000 }),
      makeMain({ id: 2, name: "싼 메뉴", price: 5000 }),
    ];

    const result = recommend({ conditions: emptyConditions(), vision: unavailableVision, menu });

    expect(result.map((r) => r.main.id).sort()).toEqual([1, 2]);
  });

  it("키워드 매칭이 같을 때, 리뷰 근거가 있는 메뉴가 없는 메뉴보다 항상 우선한다", () => {
    const menu = [
      makeMain({ id: 1, name: "리뷰 없는 메뉴", evidences: [] }),
      makeMain({ id: 2, name: "리뷰 있는 메뉴" }), // makeMain 기본값에 evidences 1건 포함
    ];

    const result = recommend({ conditions: emptyConditions(), vision: unavailableVision, menu });

    expect(result[0].main.id).toBe(2);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("리뷰 근거 유무(3순위)는 식감 같은 하위 티어 점수로 절대 뒤집히지 않는다", () => {
    const menu = [
      makeMain({ id: 1, name: "리뷰 없지만 식감 맞음", evidences: [], texture_tags: ["바삭함"] }),
      makeMain({ id: 2, name: "리뷰 있지만 식감 안 맞음", texture_tags: [] }),
    ];
    const conditions = { ...emptyConditions(), preferred_textures: ["바삭함"] };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    // id:1이 하위 티어(식감)에서 더 높은 점수를 받아도, 리뷰 근거가 없으므로 id:2보다 뒤로 간다.
    expect(result[0].main.id).toBe(2);
  });

  it("사용자 키워드에 맞는 메뉴가 점주 지정 메뉴보다 먼저 추천된다", () => {
    const menu = [
      makeMain({ id: 1, name: "점주 추천 메뉴", is_featured: true }),
      makeMain({ id: 2, name: "짬뽕", keyword_tags: ["짬뽕"] }),
    ];
    const conditions = { ...emptyConditions(), food_keywords: ["짬뽕"] };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    expect(result[0].main.id).toBe(2);
    // 점주 지정 메뉴도 결과에는 남고, "사장님 추천" 표시는 그대로 붙는다.
    const ownerPick = result.find((r) => r.main.id === 1);
    expect(ownerPick?.is_owner_pick).toBe(true);
    expect(ownerPick?.matched_conditions).toContain("사장님이 추천하는 메뉴예요");
  });

  it("리뷰 근거가 있는 메뉴가 리뷰 근거 없는 점주 지정 메뉴보다 먼저 추천된다", () => {
    const menu = [
      makeMain({ id: 1, name: "점주 추천(리뷰 없음)", is_featured: true, evidences: [] }),
      makeMain({ id: 2, name: "리뷰 있는 메뉴" }),
    ];

    const result = recommend({ conditions: emptyConditions(), vision: unavailableVision, menu });

    expect(result.map((r) => r.main.id)).toEqual([2, 1]);
  });

  it("사용자가 말한 식감 선호가 점주 지정보다 우선한다", () => {
    const menu = [
      makeMain({ id: 1, name: "점주 추천", is_featured: true, texture_tags: [] }),
      makeMain({ id: 2, name: "바삭한 메뉴", texture_tags: ["바삭함"] }),
    ];
    const conditions = { ...emptyConditions(), preferred_textures: ["바삭함"] };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    expect(result[0].main.id).toBe(2);
  });

  it("사용자 조건과 리뷰 근거가 같으면 점주 지정 메뉴를 앞세운다", () => {
    const menu = [
      makeMain({ id: 1, name: "일반 메뉴" }),
      makeMain({ id: 2, name: "점주 추천", is_featured: true }),
    ];

    const result = recommend({ conditions: emptyConditions(), vision: unavailableVision, menu });

    expect(result[0].main.id).toBe(2);
  });

  it("점주 추천 세트도 사용자 키워드에 맞는 일반 메뉴보다 앞서지 않는다", () => {
    const setMain = makeMain({ id: 1, name: "세트 대표 메뉴" });
    const menu = [setMain, makeMain({ id: 2, name: "짬뽕", keyword_tags: ["짬뽕"] })];
    const conditions = { ...emptyConditions(), food_keywords: ["짬뽕"] };

    const result = recommend({
      conditions,
      vision: unavailableVision,
      menu,
      featuredSets: [{ name: "사장님 세트", items: [{ menu: setMain, quantity: 1 }] }],
    });

    expect(result[0].main.id).toBe(2);
    expect(result[1].owner_set_label).toBe("사장님 세트");
  });

  it("점주 추천 세트 합계가 예산(1인 예산 x 인원수)을 넘으면 세트를 추천하지 않는다", () => {
    const setMain = makeMain({ id: 1, name: "세트 메인", price: 9000 });
    const setSide = makeMain({ id: 2, name: "세트 사이드", price: 6000, category: "side" });
    const menu = [setMain, setSide];
    const conditions = { ...emptyConditions(), party_size: 1, budget_per_person: 10000 };

    const result = recommend({
      conditions,
      vision: unavailableVision,
      menu,
      featuredSets: [
        { name: "사장님 세트", items: [{ menu: setMain, quantity: 1 }, { menu: setSide, quantity: 1 }] },
      ],
    });

    expect(result.every((r) => r.owner_set_label === null)).toBe(true);
    // 세트는 빠져도 예산 안에 드는 단일 메뉴(9,000원)는 그대로 추천된다.
    expect(result.map((r) => r.main.id)).toContain(1);
  });
  it("음식 종류(kind)로만 매칭된 메뉴에도 '○○ 메뉴를 원하셨어요' 이유가 붙는다", () => {
    const menu = [makeMain({ id: 1, name: "소룡포", kind: "딤섬" })];
    const conditions = { ...emptyConditions(), food_keywords: ["딤섬"] };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    expect(result[0].matched_conditions).toContain("딤섬 메뉴를 원하셨어요");
  });
  it("직접 언급 리뷰가 있는 메뉴가 공통 근거('딤섬' 전체 칭찬)만 있는 메뉴보다 먼저 추천된다", () => {
    const aggregate = (mention: number) => [{
      field_name: "overall", source_type: "manual_public_review_aggregate" as const,
      source_summary: "공개 리뷰 집계", sample_size: 23 + mention, mention_count: mention,
      collected_at: "2026-10-27", verified_at: null,
    }];
    const menu = [
      makeMain({ id: 1, name: "홍게살 소룡포", kind: "딤섬", price: 9500, evidences: aggregate(0) }),
      makeMain({ id: 2, name: "하가우", kind: "딤섬", price: 9800, evidences: aggregate(3) }),
      makeMain({ id: 3, name: "쇼마이", kind: "딤섬", price: 9800, evidences: aggregate(4) }),
      makeMain({ id: 4, name: "소룡포", kind: "딤섬", price: 8900, evidences: aggregate(6) }),
      makeMain({ id: 5, name: "리뷰 없는 딤섬", kind: "딤섬", price: 9000, evidences: [] }),
    ];
    const conditions = { ...emptyConditions(), food_keywords: ["딤섬"], budget_per_person: 10000 };

    const result = recommend({ conditions, vision: unavailableVision, menu });

    // 직접 언급 수 순서(6 > 4 > 3). 공통 근거만 있는 홍게살 소룡포와 근거 없는 메뉴는 그 뒤라 3개 안에 못 든다.
    expect(result.map((r) => r.main.id)).toEqual([4, 3, 2]);
  });

  it("공통 근거만 있어도 리뷰 근거가 아예 없는 메뉴보다는 먼저 추천된다", () => {
    const menu = [
      makeMain({ id: 1, name: "근거 없음", evidences: [] }),
      makeMain({ id: 2, name: "공통 근거만", evidences: [{
        field_name: "overall", source_type: "manual_public_review_aggregate",
        source_summary: "공개 리뷰 집계", sample_size: 23, mention_count: 0,
        collected_at: "2026-10-27", verified_at: null,
      }] }),
    ];

    const result = recommend({ conditions: emptyConditions(), vision: unavailableVision, menu });

    expect(result.map((r) => r.main.id)).toEqual([2, 1]);
  });
  describe("조합 추천 (화면 키오스크와 같은 구성)", () => {
    const aggregate = (mention: number) => [{
      field_name: "overall", source_type: "manual_public_review_aggregate" as const,
      source_summary: "공개 리뷰 집계", sample_size: 20 + mention, mention_count: mention,
      collected_at: "2026-10-27", verified_at: null,
    }];
    const tableMenu = () => [
      makeMain({ id: 1, name: "탕수육", kind: "돼지고기", price: 25000, serving_people: 2, serving_min: 2, keyword_tags: ["탕수육"], evidences: [] }),
      makeMain({ id: 2, name: "짜장면", kind: "면", price: 7000, keyword_tags: ["짜장"], evidences: [] }),
      makeMain({ id: 3, name: "짬뽕", kind: "면", price: 8000, keyword_tags: ["짬뽕"], evidences: [] }),
      makeMain({ id: 4, name: "볶음밥", kind: "밥", price: 8000, keyword_tags: ["볶음밥"], evidences: [] }),
      makeMain({ id: 5, name: "군만두", kind: "딤섬", price: 5000, category: "side", evidences: [] }),
    ];

    it("3명이면 요리·식사·곁들임을 묶은 중식 한상을 예산 안에서 추천한다", () => {
      const conditions = { ...emptyConditions(), party_size: 3, budget_per_person: 20000 };

      const result = recommend({ conditions, vision: unavailableVision, menu: tableMenu() });

      const full = result.find((r) => r.set_type === "full_set");
      expect(full).toBeDefined();
      expect(full!.lines.length).toBeGreaterThanOrEqual(4);
      expect(full!.total_price).toBeLessThanOrEqual(60000);
      expect(result.every((r) => r.total_price <= 60000)).toBe(true);
    });

    it("총예산(total_budget)이 있으면 1인 예산 x 인원보다 우선해서 지킨다", () => {
      const conditions = { ...emptyConditions(), party_size: 3, budget_per_person: 20000, total_budget: 30000 };

      const result = recommend({ conditions, vision: unavailableVision, menu: tableMenu() });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((r) => r.total_price <= 30000)).toBe(true);
      expect(result.some((r) => r.set_type === "full_set")).toBe(false);
    });

    it("리뷰 많은 비싼 곁들임 때문에 한상이 예산을 넘으면, 리뷰를 뺀 기준으로 다시 골라 한상을 살린다", () => {
      const menu = [
        ...tableMenu(),
        ...[11, 12, 13, 14].map((id) =>
          makeMain({ id, name: `리뷰 많은 딤섬 ${id}`, kind: "딤섬", price: 20000, category: "side", evidences: aggregate(3) }),
        ),
      ];
      const conditions = { ...emptyConditions(), party_size: 3, total_budget: 55000 };

      const result = recommend({ conditions, vision: unavailableVision, menu });

      const full = result.find((r) => r.set_type === "full_set");
      expect(full).toBeDefined();
      expect(full!.lines.map((l) => l.menu.id)).toContain(5);
      expect(full!.total_price).toBeLessThanOrEqual(55000);
    });
  });
});
