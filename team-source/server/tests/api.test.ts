import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createInMemoryRepositories } from "./fakes/inMemoryRepositories.js";
import type { MenuWithDetails } from "../src/types/menu.js";
import { ALLERGY_SAFETY_NOTICE } from "../src/types/order.js";

function menu(overrides: Partial<MenuWithDetails>): MenuWithDetails {
  return {
    id: 1,
    store_id: 1,
    name: "[테스트] 짜장면",
    price: 7000,
    category: "main",
    kind: null,
    external_id: null,
    spicy_level: 0,
    serving_size: "1인분",
    sold_out: false,
    is_featured: false,
    featured_rank: null,
    flavor_tags: ["담백함"],
    texture_tags: ["쫄깃함"],
    keyword_tags: ["면"],
    synonym_tags: [],
    dietary_tags: [],
    pairing_menu_ids: [],
    ingredient_notices: [
      { ingredient_name: "밀", status: "inferred_from_menu_name", source_type: "menu_name", verified_at: null },
    ],
    evidences: [
      {
        field_name: "overall",
        source_type: "team_tasting",
        source_summary: "[테스트] placeholder",
        sample_size: 3,
        mention_count: null,
        collected_at: "2026-10-01",
        verified_at: "2026-10-01",
      },
    ],
    ...overrides,
  };
}

function buildTestApp() {
  const repos = createInMemoryRepositories({
    stores: [{ id: 1, slug: "test-store", name: "테스트 매장", dataset_as_of: null }],
    menus: [menu({ id: 1 })],
  });
  return createApp(repos);
}

describe("GET /health", () => {
  it("상태를 반환한다", async () => {
    const app = buildTestApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/stores/:slug/menus", () => {
  it("존재하는 매장의 메뉴 목록을 반환한다", async () => {
    const app = buildTestApp();
    const res = await request(app).get("/api/stores/test-store/menus");
    expect(res.status).toBe(200);
    expect(res.body.menus).toHaveLength(1);
    expect(res.body.menus[0].name).toBe("[테스트] 짜장면");
  });

  it("존재하지 않는 매장은 공통 에러 포맷으로 404를 반환한다", async () => {
    const app = buildTestApp();
    const res = await request(app).get("/api/stores/no-such-store/menus");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: expect.stringContaining("no-such-store") },
    });
  });
});

describe("POST /api/condition-extraction", () => {
  it("발화에서 조건을 추출한다 (LLM 미설정 시 규칙 기반)", async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post("/api/condition-extraction")
      .send({ utterance: "매운 면 요리 먹고 싶어요. 두 명이고 해산물은 빼주세요." });

    expect(res.status).toBe(200);
    expect(res.body.conditions.party_size).toBe(2);
    expect(res.body.conditions.spicy_level).toBe(2);
    expect(res.body.conditions.excluded_ingredients).toContain("해산물");
  });

  it("빈 발화는 공통 에러 포맷으로 400을 반환한다", async () => {
    const app = buildTestApp();
    const res = await request(app).post("/api/condition-extraction").send({ utterance: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/stores/:slug/recommendations", () => {
  it("추천 결과와 함께 알레르기 비보장 안내문구를 항상 포함한다", async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post("/api/stores/test-store/recommendations")
      .send({
        conditions: {
          party_size: 1,
          spicy_level: null,
          preferred_textures: [],
          budget_per_person: null,
          excluded_ingredients: [],
          food_keywords: [],
          raw_utterance: "",
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.allergy_safety_notice).toBe(ALLERGY_SAFETY_NOTICE);
    expect(res.body.safety_flags.allergy_safety_guaranteed).toBe(false);
    expect(res.body.recommendations).toHaveLength(1);
    expect(res.body.recommendations[0].cautions.some((c: string) => c.includes("밀"))).toBe(true);
  });

  it("조건 형식이 잘못되면 400 VALIDATION_ERROR를 반환한다", async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post("/api/stores/test-store/recommendations")
      .send({ conditions: { party_size: "두명" } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/stores/:slug/orders", () => {
  it("결제 완료 주문을 저장한다 (로그인 불필요)", async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post("/api/stores/test-store/orders")
      .send({
        order_number: "001",
        total_amount: 14000,
        payment_method: "card",
        dine_type: "dine_in",
        items: [{ menu_external_id: "dimsum-1", name: "[테스트] 짜장면", price: 7000, quantity: 2 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.order.order_number).toBe("001");
    expect(res.body.order.items).toHaveLength(1);
  });

  it("항목이 없으면 400 VALIDATION_ERROR를 반환한다", async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post("/api/stores/test-store/orders")
      .send({ order_number: "002", total_amount: 0, payment_method: "card", dine_type: "takeout", items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
