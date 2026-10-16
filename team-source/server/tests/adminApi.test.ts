import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createInMemoryRepositories } from "./fakes/inMemoryRepositories.js";
import type { MenuWithDetails } from "../src/types/menu.js";

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
    flavor_tags: [],
    texture_tags: [],
    keyword_tags: [],
    synonym_tags: [],
    dietary_tags: [],
    pairing_menu_ids: [],
    ingredient_notices: [],
    evidences: [],
    ...overrides,
  };
}

function buildTestApp() {
  const repos = createInMemoryRepositories({
    stores: [{ id: 1, slug: "test-store", name: "테스트 매장", dataset_as_of: null }],
    menus: [menu({ id: 1 }), menu({ id: 2, name: "[테스트] 군만두", category: "side", price: 6000 })],
    storeOwners: [
      {
        id: 1,
        store_id: 1,
        username: "owner",
        password_hash: bcrypt.hashSync("test-password-1234", 4),
        display_name: "테스트 사장님",
      },
    ],
  });
  return { app: createApp(repos), repos };
}

async function loginAndGetToken(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/api/admin/login").send({ username: "owner", password: "test-password-1234" });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

describe("POST /api/admin/login", () => {
  it("올바른 아이디/비밀번호면 토큰을 발급한다", async () => {
    const { app } = buildTestApp();
    const token = await loginAndGetToken(app);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
  });

  it("비밀번호가 틀리면 401을 반환한다", async () => {
    const { app } = buildTestApp();
    const res = await request(app).post("/api/admin/login").send({ username: "owner", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("존재하지 않는 아이디도 동일하게 401을 반환한다 (계정 존재 여부를 흘리지 않음)", async () => {
    const { app } = buildTestApp();
    const res = await request(app).post("/api/admin/login").send({ username: "no-such-user", password: "whatever" });
    expect(res.status).toBe(401);
  });
});

describe("관리자 메뉴 API", () => {
  it("토큰 없이 메뉴 수정을 시도하면 401을 반환한다", async () => {
    const { app } = buildTestApp();
    const res = await request(app).patch("/api/admin/stores/test-store/menus/1").send({ price: 8000 });
    expect(res.status).toBe(401);
  });

  it("로그인 후 메뉴 가격/품절 상태를 수정할 수 있다", async () => {
    const { app } = buildTestApp();
    const token = await loginAndGetToken(app);

    const res = await request(app)
      .patch("/api/admin/stores/test-store/menus/1")
      .set("Authorization", `Bearer ${token}`)
      .send({ price: 8500, sold_out: true });

    expect(res.status).toBe(200);
    expect(res.body.menu.price).toBe(8500);
    expect(res.body.menu.sold_out).toBe(true);
  });

  it("메뉴를 새로 추가할 수 있다", async () => {
    const { app } = buildTestApp();
    const token = await loginAndGetToken(app);

    const res = await request(app)
      .post("/api/admin/stores/test-store/menus")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "[테스트] 신메뉴", price: 12000, category: "main", spicy_level: 1, serving_size: "1인분" });

    expect(res.status).toBe(201);
    expect(res.body.menu.name).toBe("[테스트] 신메뉴");
    expect(res.body.menu.is_featured).toBe(false);
  });

  it("메뉴를 추천 메뉴로 지정할 수 있다 (is_featured)", async () => {
    const { app } = buildTestApp();
    const token = await loginAndGetToken(app);

    const res = await request(app)
      .patch("/api/admin/stores/test-store/menus/1")
      .set("Authorization", `Bearer ${token}`)
      .send({ is_featured: true });

    expect(res.status).toBe(200);
    expect(res.body.menu.is_featured).toBe(true);
  });

  it("메뉴를 삭제할 수 있다", async () => {
    const { app } = buildTestApp();
    const token = await loginAndGetToken(app);

    const del = await request(app)
      .delete("/api/admin/stores/test-store/menus/2")
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const list = await request(app).get("/api/stores/test-store/menus");
    expect(list.body.menus.map((m: { id: number }) => m.id)).not.toContain(2);
  });

  it("존재하지 않는 메뉴를 수정하려 하면 404를 반환한다", async () => {
    const { app } = buildTestApp();
    const token = await loginAndGetToken(app);

    const res = await request(app)
      .patch("/api/admin/stores/test-store/menus/999")
      .set("Authorization", `Bearer ${token}`)
      .send({ price: 1000 });
    expect(res.status).toBe(404);
  });

  it("재료 노티스를 추가하고 삭제할 수 있다", async () => {
    const { app } = buildTestApp();
    const token = await loginAndGetToken(app);

    const add = await request(app)
      .post("/api/admin/stores/test-store/menus/1/ingredient-notices")
      .set("Authorization", `Bearer ${token}`)
      .send({ ingredient_name: "밀", status: "confirmed", source_type: "owner_verified", verified_at: "2026-10-13" });
    expect(add.status).toBe(201);

    const afterAdd = await request(app).get("/api/stores/test-store/menus");
    const wheat = afterAdd.body.menus
      .find((m: { id: number }) => m.id === 1)
      .ingredient_notices.find((n: { ingredient_name: string }) => n.ingredient_name === "밀");
    expect(wheat.status).toBe("confirmed");

    const remove = await request(app)
      .delete("/api/admin/stores/test-store/menus/1/ingredient-notices/밀")
      .set("Authorization", `Bearer ${token}`);
    expect(remove.status).toBe(204);
  });
});

describe("관리자 추천 세트 API", () => {
  it("추천 세트를 만들고, 공개 추천 API에서 최우선으로 노출된다", async () => {
    const { app } = buildTestApp();
    const token = await loginAndGetToken(app);

    const createRes = await request(app)
      .post("/api/admin/stores/test-store/featured-sets")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "사장님 추천 세트", items: [{ menu_id: 1, quantity: 1 }, { menu_id: 2, quantity: 1 }] });
    expect(createRes.status).toBe(201);
    expect(createRes.body.featuredSet.items).toHaveLength(2);

    const recommendRes = await request(app)
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

    expect(recommendRes.status).toBe(200);
    expect(recommendRes.body.recommendations[0].is_owner_pick).toBe(true);
    expect(recommendRes.body.recommendations[0].owner_set_label).toBe("사장님 추천 세트");
    expect(recommendRes.body.recommendations[0].main.id).toBe(1);
    expect(recommendRes.body.recommendations[0].sides.map((s: { id: number }) => s.id)).toContain(2);
  });

  it("세트에 포함된 메뉴가 알레르기 제외 재료와 겹치면 그 세트는 추천에서 빠진다", async () => {
    const { app } = buildTestApp();
    const token = await loginAndGetToken(app);

    // menu id 1에 밀 confirmed 재료 노티스를 추가 — "밀 제외" 요청과 겹치게 만든다.
    await request(app)
      .post("/api/admin/stores/test-store/menus/1/ingredient-notices")
      .set("Authorization", `Bearer ${token}`)
      .send({ ingredient_name: "밀", status: "confirmed", source_type: "owner_verified", verified_at: "2026-10-13" });

    await request(app)
      .post("/api/admin/stores/test-store/featured-sets")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "사장님 추천 세트", items: [{ menu_id: 1, quantity: 1 }] });

    const recommendRes = await request(app)
      .post("/api/stores/test-store/recommendations")
      .send({
        conditions: {
          party_size: 1,
          spicy_level: null,
          preferred_textures: [],
          budget_per_person: null,
          excluded_ingredients: ["밀"],
          food_keywords: [],
          raw_utterance: "",
        },
      });

    expect(recommendRes.status).toBe(200);
    // 세트가 안전 하드필터에 걸려 제외되므로, 어떤 추천도 owner_set_label을 달고 나오지 않는다.
    expect(recommendRes.body.recommendations.every((r: { owner_set_label: string | null }) => r.owner_set_label === null)).toBe(true);
  });

  it("다른 매장 소유의 메뉴를 세트에 넣으려 하면 검증 오류를 반환한다", async () => {
    const repos = createInMemoryRepositories({
      stores: [
        { id: 1, slug: "test-store", name: "테스트 매장", dataset_as_of: null },
        { id: 2, slug: "other-store", name: "다른 매장", dataset_as_of: null },
      ],
      menus: [menu({ id: 1, store_id: 1 }), menu({ id: 2, store_id: 2, name: "[테스트] 다른매장메뉴" })],
      storeOwners: [
        {
          id: 1,
          store_id: 1,
          username: "owner",
          password_hash: bcrypt.hashSync("test-password-1234", 4),
          display_name: "테스트 사장님",
        },
      ],
    });
    const app = createApp(repos);
    const token = await loginAndGetToken(app);

    const res = await request(app)
      .post("/api/admin/stores/test-store/featured-sets")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "잘못된 세트", items: [{ menu_id: 2, quantity: 1 }] });

    expect(res.status).toBe(400);
  });
});
