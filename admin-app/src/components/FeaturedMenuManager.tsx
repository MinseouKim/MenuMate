import { useState } from "react";
import { api, ApiRequestError } from "../api.js";
import type { Menu } from "../types.js";

const CATEGORY_LABEL: Record<Menu["category"], string> = { main: "메인", side: "사이드", drink: "음료" };

function sortFeatured(menus: Menu[]): Menu[] {
  return [...menus].sort((a, b) => {
    const rankA = a.featured_rank;
    const rankB = b.featured_rank;
    if (rankA === rankB) return a.name.localeCompare(b.name, "ko");
    if (rankA === null) return 1;
    if (rankB === null) return -1;
    return rankA - rankB;
  });
}

export function FeaturedMenuManager({
  token,
  menus,
  onChange,
}: {
  token: string;
  menus: Menu[];
  onChange: () => void;
}) {
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const featured = sortFeatured(menus.filter((m) => m.is_featured));
  const others = menus.filter((m) => !m.is_featured);

  async function setFeatured(menu: Menu, isFeatured: boolean) {
    setBusyId(menu.id);
    setError("");
    try {
      await api.updateMenu(token, menu.id, {
        is_featured: isFeatured,
        // 추천 해제할 때는 순위도 같이 비워서, 나중에 다시 지정할 때 혼동이 없게 한다.
        featured_rank: isFeatured ? menu.featured_rank : null,
      });
      onChange();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "변경에 실패했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveRank(menu: Menu, raw: string) {
    const trimmed = raw.trim();
    const rank = trimmed === "" ? null : Number(trimmed);
    if (rank !== null && (!Number.isInteger(rank) || rank < 0)) {
      setError("우선순위는 0 이상의 숫자만 입력할 수 있어요.");
      return;
    }
    if (rank === menu.featured_rank) return;
    setBusyId(menu.id);
    setError("");
    try {
      await api.updateMenu(token, menu.id, { featured_rank: rank });
      onChange();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "변경에 실패했어요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>추천 메뉴</h2>
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>
        여기서 "추천"으로 지정한 메뉴는 손님 조건에 맞으면 일반 추천보다 먼저 노출돼요. 품절이거나
        손님이 제외한 재료·알레르기 조건에 걸리면 추천 지정 여부와 상관없이 자동으로 숨겨져요
        (안전이 항상 우선이에요). 여러 메뉴를 함께 추천 지정했을 때 손님 조건상 점수가 같다면,
        아래 "우선순위" 숫자가 작은 메뉴가 먼저 노출돼요 — 비워두면 가장 나중 순위로 취급돼요.
      </p>
      {error && <p className="error-text">{error}</p>}

      <h3 style={{ marginTop: 0 }}>현재 추천 중인 메뉴 ({featured.length})</h3>
      {featured.length === 0 && <p className="muted">아직 추천으로 지정한 메뉴가 없어요. 아래 목록에서 지정해 보세요.</p>}
      {featured.map((menu) => (
        <div className="featured-menu-row" key={menu.id}>
          <span className="name">
            {menu.name}
            <span className="badge featured">{CATEGORY_LABEL[menu.category]}</span>
            {menu.sold_out && <span className="badge sold-out">품절</span>}
          </span>
          <span className="muted">{menu.price.toLocaleString("ko-KR")}원</span>
          <label className="rank-field">
            우선순위
            <input
              type="number"
              min={0}
              key={`${menu.id}-${menu.featured_rank ?? "none"}`}
              defaultValue={menu.featured_rank ?? ""}
              disabled={busyId === menu.id}
              placeholder="없음"
              onBlur={(e) => saveRank(menu, e.currentTarget.value)}
            />
          </label>
          <button disabled={busyId === menu.id} onClick={() => setFeatured(menu, false)}>추천 해제</button>
        </div>
      ))}

      <h3>전체 메뉴에서 추천 지정하기</h3>
      {others.length === 0 && <p className="muted">모든 메뉴가 이미 추천으로 지정되어 있어요.</p>}
      {others.map((menu) => (
        <div className="featured-menu-row" key={menu.id}>
          <span className="name">
            {menu.name}
            <span className="badge">{CATEGORY_LABEL[menu.category]}</span>
            {menu.sold_out && <span className="badge sold-out">품절</span>}
          </span>
          <span className="muted">{menu.price.toLocaleString("ko-KR")}원</span>
          <span />
          <button disabled={busyId === menu.id} onClick={() => setFeatured(menu, true)}>추천 지정</button>
        </div>
      ))}
    </div>
  );
}
