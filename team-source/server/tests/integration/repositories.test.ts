import { afterAll, describe, expect, it } from "vitest";
import { getPool, closePool } from "../../src/db/pool.js";
import { createMysqlStoreRepository } from "../../src/repositories/mysqlStoreRepository.js";
import { createMysqlMenuRepository } from "../../src/repositories/mysqlMenuRepository.js";

// 이 테스트는 실제 MySQL/MariaDB(DB_NAME=kiosk_test, .env.test)에 001/002 sql이 적용되어 있어야 한다.
// README의 안내대로 `npm run migrate`(DB_NAME=kiosk_test 환경)를 먼저 실행해 둘 것.

describe("MySQL repositories (실제 DB 연동)", () => {
  const pool = getPool();
  const storeRepository = createMysqlStoreRepository(pool);
  const menuRepository = createMysqlMenuRepository(pool);

  afterAll(async () => {
    await closePool();
  });

  it("시드된 우루루 본점 매장을 slug로 찾는다", async () => {
    const store = await storeRepository.findBySlug("ururu-headquarters");
    expect(store).not.toBeNull();
    expect(store?.name).toBe("우루루 본점");
  });

  it("존재하지 않는 slug는 null을 반환한다", async () => {
    const store = await storeRepository.findBySlug("no-such-store");
    expect(store).toBeNull();
  });

  it("매장의 메뉴를 태그/페어링/노티스/근거와 함께 가져온다", async () => {
    const store = await storeRepository.findBySlug("ururu-headquarters");
    const menus = await menuRepository.listByStore(store!.id);

    expect(menus.length).toBeGreaterThanOrEqual(8);

    const jjajangmyeon = menus.find((m) => m.name.includes("짜장면"));
    expect(jjajangmyeon).toBeDefined();
    expect(jjajangmyeon!.keyword_tags).toContain("면");
    expect(jjajangmyeon!.flavor_tags.length).toBeGreaterThan(0);

    // 계란탕 → "계란"이 메뉴명에 그대로 드러나므로 inferred_from_menu_name 이어야 한다
    const eggSoup = menus.find((m) => m.name.includes("계란탕"));
    const eggNotice = eggSoup!.ingredient_notices.find((n) => n.ingredient_name === "계란");
    expect(eggNotice?.status).toBe("inferred_from_menu_name");

    // 군만두 → 점주 확인(owner_verified/confirmed) 예시 1건이 들어있어야 한다
    const dumpling = menus.find((m) => m.name.includes("군만두"));
    const porkNotice = dumpling!.ingredient_notices.find((n) => n.ingredient_name === "돼지고기");
    expect(porkNotice?.status).toBe("confirmed");
    expect(porkNotice?.source_type).toBe("owner_verified");

    // 마라짬뽕은 사이드(군만두/계란탕)와 페어링되어 있어야 한다
    const maraJjamppong = menus.find((m) => m.name.includes("마라짬뽕"));
    expect(maraJjamppong!.pairing_menu_ids.length).toBeGreaterThan(0);

    // 모든 메뉴는 placeholder임을 밝히는 근거를 최소 1건 가진다
    for (const m of menus) {
      expect(m.evidences.length).toBeGreaterThan(0);
    }
  });

  it("findById로 단일 메뉴를 조회한다", async () => {
    const store = await storeRepository.findBySlug("ururu-headquarters");
    const all = await menuRepository.listByStore(store!.id);
    const target = all[0];

    const found = await menuRepository.findById(target.id);
    expect(found?.id).toBe(target.id);
    expect(found?.name).toBe(target.name);
  });

  it("findById는 없는 메뉴에 대해 null을 반환한다", async () => {
    const found = await menuRepository.findById(999999);
    expect(found).toBeNull();
  });

  it("addEvidence로 근거를 추가하면 이후 조회에 반영된다", async () => {
    const store = await storeRepository.findBySlug("ururu-headquarters");
    const all = await menuRepository.listByStore(store!.id);
    const target = all[0];
    const beforeCount = target.evidences.length;

    await menuRepository.addEvidence(target.id, {
      field_name: "flavor_profile:통합테스트",
      source_type: "team_tasting",
      source_summary: "[테스트] repositories.test.ts에서 추가한 근거",
      sample_size: 1,
      mention_count: null,
      collected_at: "2026-10-06",
      verified_at: null,
    });

    const after = await menuRepository.findById(target.id);
    expect(after!.evidences.length).toBe(beforeCount + 1);
    expect(after!.evidences.some((e) => e.field_name === "flavor_profile:통합테스트")).toBe(true);
  });
});
