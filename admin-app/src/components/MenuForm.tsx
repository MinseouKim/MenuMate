import { useState } from "react";
import { api, ApiRequestError } from "../api.js";
import { KIND_OPTIONS, type Menu } from "../types.js";

const CATEGORY_LABEL: Record<Menu["category"], string> = { main: "메인", side: "사이드", drink: "음료" };
const SPICY_LABEL: Record<Menu["spicy_level"], string> = { 0: "안 매움", 1: "약간 매움", 2: "매움", 3: "아주 매움" };

export function MenuForm({
  token,
  initial,
  onClose,
  onSaved,
}: {
  token: string;
  initial: Menu | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(String(initial?.price ?? ""));
  const [category, setCategory] = useState<Menu["category"]>(initial?.category ?? "main");
  const [kind, setKind] = useState<string>(initial?.kind ?? "");
  const [spicyLevel, setSpicyLevel] = useState<Menu["spicy_level"]>(initial?.spicy_level ?? 0);
  const [servingSize, setServingSize] = useState(initial?.serving_size ?? "");
  const [soldOut, setSoldOut] = useState(initial?.sold_out ?? false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceNumber = Number(price);
    if (!name.trim() || !Number.isInteger(priceNumber) || priceNumber < 0) {
      setError("메뉴 이름과 올바른 가격을 입력해 주세요.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        price: priceNumber,
        category,
        kind: kind || null,
        spicy_level: spicyLevel,
        serving_size: servingSize.trim() ? servingSize.trim() : null,
        sold_out: soldOut,
      };
      if (initial) {
        await api.updateMenu(token, initial.id, payload);
      } else {
        await api.createMenu(token, payload);
      }
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
        <h2>{initial ? "메뉴 수정" : "새 메뉴 추가"}</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field full">
            메뉴 이름
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </label>
          <label className="field">
            가격(원)
            <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} required />
          </label>
          <label className="field">
            분류
            <select value={category} onChange={(e) => setCategory(e.target.value as Menu["category"])}>
              {(Object.keys(CATEGORY_LABEL) as Menu["category"][]).map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            음식 종류
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">미지정</option>
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="field">
            맵기
            <select value={spicyLevel} onChange={(e) => setSpicyLevel(Number(e.target.value) as Menu["spicy_level"])}>
              {([0, 1, 2, 3] as const).map((level) => (
                <option key={level} value={level}>{SPICY_LABEL[level]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            제공량 (예: 1인분, 2~3인 기준)
            <input value={servingSize} onChange={(e) => setServingSize(e.target.value)} />
          </label>
          <label className="checkbox-field full">
            <input type="checkbox" checked={soldOut} onChange={(e) => setSoldOut(e.target.checked)} />
            품절 처리
          </label>
          {error && <p className="error-text full">{error}</p>}
          <div className="full" style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" className="secondary" onClick={onClose}>취소</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? "저장 중..." : "저장"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
