import { useState } from "react";
import { api, ApiRequestError } from "../api.js";
import type { FeaturedSet, Menu } from "../types.js";

function FeaturedSetForm({
  token,
  menus,
  initial,
  onClose,
  onSaved,
}: {
  token: string;
  menus: Menu[];
  initial: FeaturedSet | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [quantities, setQuantities] = useState<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    for (const item of initial?.items ?? []) map[item.menu_id] = item.quantity;
    return map;
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleMenu(menuId: number, checked: boolean) {
    setQuantities((prev) => {
      const next = { ...prev };
      if (checked) next[menuId] = next[menuId] ?? 1;
      else delete next[menuId];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const items = Object.entries(quantities).map(([menuId, quantity]) => ({ menu_id: Number(menuId), quantity }));
    if (!name.trim() || items.length === 0) {
      setError("세트 이름과, 메뉴를 최소 1개 이상 선택해 주세요.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const payload = { name: name.trim(), active, items };
      if (initial) await api.updateFeaturedSet(token, initial.id, payload);
      else await api.createFeaturedSet(token, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "저장에 실패했어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? "추천 세트 수정" : "새 추천 세트"}</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field full">
            세트 이름
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 둘이서 든든하게" autoFocus />
          </label>
          <div className="field full">
            포함할 메뉴 (품절 메뉴는 목록에서 빠져요)
            <div className="item-picker">
              {menus.filter((m) => !m.sold_out).map((menu) => {
                const checked = menu.id in quantities;
                return (
                  <label key={menu.id}>
                    <input type="checkbox" checked={checked} onChange={(e) => toggleMenu(menu.id, e.target.checked)} />
                    {menu.name} ({menu.price.toLocaleString("ko-KR")}원)
                    {checked && (
                      <input
                        type="number"
                        min={1}
                        value={quantities[menu.id]}
                        onChange={(e) =>
                          setQuantities((prev) => ({ ...prev, [menu.id]: Math.max(1, Number(e.target.value)) }))
                        }
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
          <label className="checkbox-field full">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            이 세트를 추천에 노출
          </label>
          {error && <p className="error-text full">{error}</p>}
          <div className="full" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="secondary" onClick={onClose}>취소</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? "저장 중..." : "저장"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function FeaturedSetManager({
  token,
  menus,
  featuredSets,
  onChange,
}: {
  token: string;
  menus: Menu[];
  featuredSets: FeaturedSet[];
  onChange: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FeaturedSet | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const menuById = new Map(menus.map((m) => [m.id, m]));

  async function toggleActive(set: FeaturedSet) {
    setBusyId(set.id);
    try {
      await api.updateFeaturedSet(token, set.id, { name: set.name, active: !set.active, items: set.items });
      onChange();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "변경에 실패했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(set: FeaturedSet) {
    if (!window.confirm(`"${set.name}" 세트를 삭제할까요?`)) return;
    setBusyId(set.id);
    try {
      await api.deleteFeaturedSet(token, set.id);
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
        <h2>추천 세트</h2>
        <button className="primary" onClick={() => setCreating(true)}>+ 새 세트</button>
      </div>
      <p className="muted">
        추천 세트는 손님의 "말로 추천받기" 결과에서 일반 추천보다 먼저 보여져요. 단, 세트 안에 품절된
        메뉴나 손님이 제외 요청한 재료와 겹치는 메뉴가 있으면 안전을 위해 그 세트는 자동으로 숨겨져요.
      </p>
      {error && <p className="error-text">{error}</p>}

      {featuredSets.map((set) => (
        <div className="set-card" key={set.id}>
          <div className="set-head">
            <strong>{set.name}</strong>
            {!set.active && <span className="badge sold-out">비활성</span>}
          </div>
          <div className="set-items">
            {set.items.map((item) => `${menuById.get(item.menu_id)?.name ?? "(삭제된 메뉴)"} ×${item.quantity}`).join(" · ")}
          </div>
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button className={set.active ? "on" : ""} disabled={busyId === set.id} onClick={() => toggleActive(set)}>
              {set.active ? "비활성화" : "활성화"}
            </button>
            <button onClick={() => setEditing(set)}>수정</button>
            <button className="danger" disabled={busyId === set.id} onClick={() => remove(set)}>삭제</button>
          </div>
        </div>
      ))}
      {featuredSets.length === 0 && <p className="muted">아직 만든 추천 세트가 없어요.</p>}

      {(creating || editing) && (
        <FeaturedSetForm
          token={token}
          menus={menus}
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); onChange(); }}
        />
      )}
    </div>
  );
}
