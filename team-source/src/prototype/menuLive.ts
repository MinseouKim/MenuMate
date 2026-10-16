// 서버(team-source/server)에 연결돼 있으면, 점주 관리자 화면에서 고칠 수 있는 "핵심 정보"만
// menus.json 위에 겹쳐 씁니다: 이름·가격·종류·맵기·품절·추천 메뉴 지정 여부.
// 설명·리뷰·사진·옵션 같은 전시용 콘텐츠는 그대로 번들된 menus.json을 씁니다 — 서버 DB에는
// 그 필드들이 아예 없습니다(server/README.md "백엔드 · 점주 관리자 화면" 참고).
// 서버가 없거나(VITE_API_BASE_URL 미설정), 응답이 늦거나 실패하면 조용히 포기하고 기존 데이터를 그대로 씁니다.
import type { Menu } from './types';

interface ServerMenuItem {
  external_id: string | null;
  name: string;
  price: number;
  kind: string | null;
  spicy_level: 0 | 1 | 2 | 3;
  sold_out: boolean;
  is_featured: boolean;
}

type MenuOverride = Pick<Menu, 'name' | 'price' | 'kind' | 'spicy' | 'soldOut' | 'isFeatured'>;

const TIMEOUT_MS = 4000;

function storeSlug(): string {
  return import.meta.env.VITE_STORE_SLUG?.trim() || 'ururu-headquarters';
}

/** 서버의 매장 메뉴 목록을 가져와 external_id를 key로 하는 override 맵을 만든다. 실패하면 null. */
export async function fetchMenuOverrides(): Promise<Map<string, Partial<MenuOverride>> | null> {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) return null;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/stores/${storeSlug()}/menus`, { signal: abort.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { menus?: ServerMenuItem[] };
    const overrides = new Map<string, Partial<MenuOverride>>();
    for (const item of body.menus ?? []) {
      // import:real-menu로 짝지어지지 않은(= external_id가 없는) 메뉴는 건너뜁니다.
      if (!item.external_id) continue;
      overrides.set(item.external_id, {
        name: item.name,
        price: item.price,
        ...(item.kind ? { kind: item.kind } : {}),
        spicy: item.spicy_level,
        soldOut: item.sold_out,
        isFeatured: item.is_featured,
      });
    }
    return overrides;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** base(menus.json)에 override를 겹쳐 쓴 새 배열을 돌려준다. override가 없으면 base를 그대로 돌려준다. */
export function applyMenuOverrides(base: Menu[], overrides: Map<string, Partial<MenuOverride>> | null): Menu[] {
  if (!overrides || overrides.size === 0) return base;
  return base.map((m) => {
    const patch = overrides.get(m.id);
    return patch ? { ...m, ...patch } : m;
  });
}
