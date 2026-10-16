import { useEffect, useState } from "react";
import { api, ApiRequestError } from "../api.js";
import type { Menu } from "../types.js";
import { MenuForm } from "./MenuForm.js";
import { IngredientNotices } from "./IngredientNotices.js";

const CATEGORY_ORDER: Menu["category"][] = ["main", "side", "drink"];
const CATEGORY_LABEL: Record<Menu["category"], string> = { main: "메인", side: "사이드", drink: "음료" };
const SPICY_LABEL: Record<Menu["spicy_level"], string> = { 0: "", 1: "맵기 1", 2: "맵기 2", 3: "맵기 3" };

export function MenuManager({
  token,
  menus,
  onChange,
}: {
  token: string;
  menus: Menu[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<Menu | null>(null);
  const [creating, setCreating] = useState(false);
  const [notices, setNotices] = useState<Menu | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  // 메뉴 목록이 새로고침되면(수정/삭제 등) 열려 있는 모달이 보여주는 메뉴 데이터도 최신으로 맞춘다.
  useEffect(() => {
    setNotices((prev) => (prev ? menus.find((m) => m.id === prev.id) ?? null : prev));
  }, [menus]);

  async function toggleSoldOut(menu: Menu) {
    setBusyId(menu.id);
    try {
      await api.updateMenu(token, menu.id, { sold_out: !menu.sold_out });
      onChange();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "변경에 실패했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleFeatured(menu: Menu) {
    setBusyId(menu.id);
    try {
      await api.updateMenu(token, menu.id, { is_featured: !menu.is_featured });
      onChange();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "변경에 실패했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(menu: Menu) {
    if (!window.confirm(`"${menu.name}"을(를) 삭제할까요? 되돌릴 수 없어요.`)) return;
    setBusyId(menu.id);
    try {
      await api.deleteMenu(token, menu.id);
      onChange();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "삭제에 실패했어요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>메뉴 관리</h2>
        <button className="primary" onClick={() => setCreating(true)}>+ 새 메뉴 추가</button>
      </div>
      {error && <p className="error-text">{error}</p>}

      {CATEGORY_ORDER.map((category) => {
        const items = menus.filter((m) => m.category === category);
        if (items.length === 0) return null;
        return (
          <div className="category-group" key={category}>
            <h3>{CATEGORY_LABEL[category]} ({items.length})</h3>
            {items.map((menu) => (
              <div className="menu-row" key={menu.id}>
                <span className="name">
                  {menu.name}
                  {menu.is_featured && <span className="badge featured">추천</span>}
                  {menu.sold_out && <span className="badge sold-out">품절</span>}
                </span>
                <span>{menu.price.toLocaleString("ko-KR")}원</span>
                <span className="muted">{menu.kind ?? "-"}</span>
                <span className="muted">{SPICY_LABEL[menu.spicy_level]}</span>
                <span className="muted">{menu.serving_size ?? "-"}</span>
                <span className="muted">재료 {menu.ingredient_notices.length}건</span>
                <div className="row-actions">
                  <button
                    className={menu.is_featured ? "on" : ""}
                    disabled={busyId === menu.id}
                    onClick={() => toggleFeatured(menu)}
                  >
                    {menu.is_featured ? "추천 해제" : "추천 지정"}
                  </button>
                  <button disabled={busyId === menu.id} onClick={() => toggleSoldOut(menu)}>
                    {menu.sold_out ? "품절 해제" : "품절 처리"}
                  </button>
                  <button onClick={() => setNotices(menu)}>재료</button>
                  <button onClick={() => setEditing(menu)}>수정</button>
                  <button className="danger" disabled={busyId === menu.id} onClick={() => remove(menu)}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {menus.length === 0 && <p className="muted">등록된 메뉴가 없어요. "새 메뉴 추가"로 시작해 보세요.</p>}

      {(creating || editing) && (
        <MenuForm
          token={token}
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); onChange(); }}
        />
      )}
      {notices && (
        <IngredientNotices
          token={token}
          menu={notices}
          onClose={() => setNotices(null)}
          onChanged={onChange}
        />
      )}
    </div>
  );
}
