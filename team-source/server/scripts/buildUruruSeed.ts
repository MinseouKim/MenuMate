/**
 * 키오스크 화면의 메뉴 데이터(src/prototype/menu/menus.json, 우루루 83개)로 서버 DB 시드 SQL을 만든다.
 *
 * - 결과: sql/seeds/ururu_menus.sql (sql/ 바로 아래가 아니므로 npm run migrate 때 자동 실행되지 않음)
 * - 적용: 001_init.sql, 002_seed_placeholder.sql을 적용한 DB에 수동으로 실행한다.
 *     mysql -u <user> -p <db> < sql/seeds/ururu_menus.sql
 * - 우루루 본점(slug: ururu-headquarters)의 [예시] 메뉴를 지우고 83개 메뉴로 바꾼다.
 *   통합 테스트(tests/integration)는 [예시] 데이터를 기준으로 하므로 테스트 DB에는 적용하지 않는다.
 * - 재료는 메뉴 이름·설명에서 유추한 값이라 status=inferred_from_menu_name, source_type=menu_name으로 넣는다.
 *   매장에서 확인한 재료만 confirmed/owner_verified로 바꿔야 한다.
 *
 * 실행: npm run seed:build
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface KioskMenu {
  id: string; name: string; price: number; category: string; spicy: number;
  texture: string[]; flavor: string[]; ingredients: string[]; quantityUnit: string;
  servingMin?: number; servingPeople: number; soldOut?: boolean; keywords?: string[]; aliases?: string[];
}

// 키오스크 분류 → 서버 스키마의 main/side 구분
const SIDE_CATEGORIES = new Set(["dimsum", "vegetable", "cold", "soup"]);
const q = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;

export function buildSeed(menus: KioskMenu[], asOf: string): string {
  const store = "(SELECT id FROM stores WHERE slug = 'ururu-headquarters')";
  const menuId = (m: KioskMenu) => `(SELECT id FROM menus WHERE store_id = ${store} AND name = ${q(m.name)} LIMIT 1)`;
  const serving = (m: KioskMenu) => [m.quantityUnit, `${m.servingMin && m.servingMin !== m.servingPeople ? `${m.servingMin}~` : ""}${m.servingPeople}인`].filter(Boolean).join(" · ");
  const out: string[] = [
    "-- 자동 생성 파일: server/scripts/buildUruruSeed.ts (직접 고치지 말고 menus.json을 고친 뒤 다시 생성)",
    "SET NAMES utf8mb4;",
    "START TRANSACTION;",
    `INSERT INTO stores (slug, name, dataset_as_of) VALUES ('ururu-headquarters', '우루루 본점', ${q(asOf)}) ON DUPLICATE KEY UPDATE name = VALUES(name), dataset_as_of = VALUES(dataset_as_of);`,
    `DELETE FROM menus WHERE store_id = ${store};`,
  ];
  for (const m of menus) {
    out.push(`INSERT INTO menus (store_id, name, price, category, spicy_level, serving_size, sold_out) VALUES (${store}, ${q(m.name)}, ${m.price}, '${SIDE_CATEGORIES.has(m.category) ? "side" : "main"}', ${Math.min(3, Math.max(0, m.spicy))}, ${q(serving(m))}, ${m.soldOut ? "TRUE" : "FALSE"});`);
    const tags: [string, string][] = [
      ...m.flavor.map((t): [string, string] => ["flavor", t]),
      ...m.texture.map((t): [string, string] => ["texture", t]),
      ...(m.keywords ?? []).map((t): [string, string] => ["keyword", t]),
      ...(m.aliases ?? []).map((t): [string, string] => ["synonym", t]),
    ];
    const unique = [...new Map(tags.map(t => [t.join("|"), t])).values()];
    if (unique.length) out.push(`INSERT INTO menu_tags (menu_id, tag_type, tag) SELECT ${menuId(m)}, t.tag_type, t.tag FROM (${unique.map(([type, tag]) => `SELECT ${q(type)} AS tag_type, ${q(tag)} AS tag`).join(" UNION ALL ")}) t;`);
    for (const ing of m.ingredients) out.push(`INSERT INTO menu_ingredient_notices (menu_id, ingredient_name, status, source_type, verified_at) VALUES (${menuId(m)}, ${q(ing)}, 'inferred_from_menu_name', 'menu_name', NULL);`);
  }
  out.push("COMMIT;", "");
  return out.join("\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const menus = JSON.parse(await readFile(path.resolve(here, "../../src/prototype/menu/menus.json"), "utf-8")) as KioskMenu[];
  const outDir = path.resolve(here, "../sql/seeds");
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, "ururu_menus.sql");
  await writeFile(file, buildSeed(menus, new Date().toISOString().slice(0, 10)), "utf-8");
  console.log(`[seed] ${menus.length}개 메뉴 → ${path.relative(process.cwd(), file)}`);
}
