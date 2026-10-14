import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildSeed } from "../../scripts/buildUruruSeed.js";

const menus = JSON.parse(readFileSync(new URL("../../../src/prototype/menu/menus.json", import.meta.url), "utf-8"));

describe("buildSeed (우루루 80개 메뉴 → SQL)", () => {
  const sql = buildSeed(menus, "2026-10-09");
  it("replaces the placeholder menus of the store with every kiosk menu", () => {
    expect(sql).toContain("DELETE FROM menus WHERE store_id = (SELECT id FROM stores WHERE slug = 'ururu-headquarters');");
    expect(sql.match(/^INSERT INTO menus /gm)).toHaveLength(menus.length);
    expect(sql).toContain("'베이징덕 한 마리', 105000, 'main'");
    expect(sql).toContain("'하가우', 9800, 'side'");
  });
  it("marks inferred ingredients as inferred, never confirmed", () => {
    expect(sql).toContain("'inferred_from_menu_name', 'menu_name'");
    expect(sql).not.toMatch(/'confirmed'/);
  });
  it("escapes quotes in names", () => {
    expect(buildSeed([{ ...menus[0], name: "it's" }], "2026-10-09")).toContain("'it''s'");
  });
});
