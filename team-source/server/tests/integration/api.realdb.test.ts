import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { getPool, closePool } from "../../src/db/pool.js";
import { createMysqlStoreRepository } from "../../src/repositories/mysqlStoreRepository.js";
import { createMysqlMenuRepository } from "../../src/repositories/mysqlMenuRepository.js";
import { createMysqlStoreOwnerRepository } from "../../src/repositories/mysqlStoreOwnerRepository.js";
import { createMysqlFeaturedSetRepository } from "../../src/repositories/mysqlFeaturedSetRepository.js";
import { ALLERGY_SAFETY_NOTICE } from "../../src/types/order.js";

// 실제 MySQL/MariaDB(kiosk_test)에 시드된 "우루루 본점" 데이터로 API 전체 흐름을 검증한다.

describe("API 통합 테스트 (실제 DB, 우루루 본점 시드 데이터)", () => {
  const pool = getPool();
  const app = createApp({
    storeRepository: createMysqlStoreRepository(pool),
    menuRepository: createMysqlMenuRepository(pool),
    storeOwnerRepository: createMysqlStoreOwnerRepository(pool),
    featuredSetRepository: createMysqlFeaturedSetRepository(pool),
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/stores/ururu-headquarters/menus 가 시드된 메뉴를 반환한다", async () => {
    const res = await request(app).get("/api/stores/ururu-headquarters/menus");
    expect(res.status).toBe(200);
    expect(res.body.store.name).toBe("우루루 본점");
    expect(res.body.menus.length).toBeGreaterThanOrEqual(8);
  });

  it("발화 → 조건 추출 → 추천까지 전체 흐름이 동작한다", async () => {
    const extractRes = await request(app)
      .post("/api/condition-extraction")
      .send({ utterance: "매운 면 요리 먹고 싶어요. 두 명이고 해산물은 빼주세요." });
    expect(extractRes.status).toBe(200);
    const { conditions } = extractRes.body;
    expect(conditions.party_size).toBe(2);
    expect(conditions.spicy_level).toBe(2);

    const recommendRes = await request(app)
      .post("/api/stores/ururu-headquarters/recommendations")
      .send({ conditions });

    expect(recommendRes.status).toBe(200);
    expect(recommendRes.body.allergy_safety_notice).toBe(ALLERGY_SAFETY_NOTICE);
    expect(recommendRes.body.safety_flags.allergy_safety_guaranteed).toBe(false);

    // "해산물 빼고" → 삼선짬뽕(해산물 inferred_from_menu_name)은 제외되고,
    // 마라짬뽕(해산물 unknown만 있음)은 남아야 한다 — unknown은 하드필터 근거가 아니므로.
    const names: string[] = recommendRes.body.recommendations.map((r: { main: { name: string } }) => r.main.name);
    expect(names.some((n) => n.includes("삼선짬뽕"))).toBe(false);
  });

  it("존재하지 않는 매장의 추천 요청은 404를 반환한다", async () => {
    const res = await request(app)
      .post("/api/stores/no-such-store/recommendations")
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
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("manual_public_review_aggregate로 가격/재료 근거를 추가하려 하면 400을 반환한다", async () => {
    const menusRes = await request(app).get("/api/stores/ururu-headquarters/menus");
    const menuId = menusRes.body.menus[0].id;

    const res = await request(app)
      .post(`/api/stores/ururu-headquarters/menus/${menuId}/evidences`)
      .send({
        field_name: "price_trend",
        source_type: "manual_public_review_aggregate",
        source_summary: "가격이 올랐다는 리뷰가 많음",
        sample_size: 10,
        mention_count: 5,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("manual_public_review_aggregate로 식감 근거를 추가하는 것은 허용된다", async () => {
    const menusRes = await request(app).get("/api/stores/ururu-headquarters/menus");
    const menuId = menusRes.body.menus[0].id;

    const res = await request(app)
      .post(`/api/stores/ururu-headquarters/menus/${menuId}/evidences`)
      .send({
        field_name: "texture_profile:바삭함",
        source_type: "manual_public_review_aggregate",
        source_summary: "[테스트] api.realdb.test.ts에서 추가",
        sample_size: 10,
        mention_count: 6,
      });

    expect(res.status).toBe(201);
  });
});
