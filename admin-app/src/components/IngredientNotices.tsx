import { useState } from "react";
import { api, ApiRequestError } from "../api.js";
import type { Menu } from "../types.js";

type NoticeStatus = Menu["ingredient_notices"][number]["status"];
type NoticeSource = Menu["ingredient_notices"][number]["source_type"];

const STATUS_LABEL: Record<NoticeStatus, string> = {
  confirmed: "확인됨",
  inferred_from_menu_name: "메뉴명으로 유추",
  unknown: "확인 불가",
};
const SOURCE_LABEL: Record<NoticeSource, string> = {
  official_menu: "공식 메뉴판",
  owner_verified: "점주 확인",
  menu_name: "메뉴명 유추",
};

export function IngredientNotices({
  token,
  menu,
  onClose,
  onChanged,
}: {
  token: string;
  menu: Menu;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [ingredientName, setIngredientName] = useState("");
  const [status, setStatus] = useState<NoticeStatus>("confirmed");
  const [sourceType, setSourceType] = useState<NoticeSource>("owner_verified");
  const [verifiedAt, setVerifiedAt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!ingredientName.trim()) {
      setError("재료 이름을 입력해 주세요.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api.addIngredientNotice(token, menu.id, {
        ingredient_name: ingredientName.trim(),
        status,
        source_type: sourceType,
        verified_at: verifiedAt || null,
      });
      setIngredientName("");
      setVerifiedAt("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "추가에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(name: string) {
    setBusy(true);
    try {
      await api.removeIngredientNotice(token, menu.id, name);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "삭제에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{menu.name} — 재료 정보</h2>
        <p className="muted">
          "확인 불가"는 추천 엔진의 알레르기 하드 필터 근거로 쓰이지 않아요. 점주가 직접 확인한 재료는
          "확인됨 / 점주 확인"으로 올려주세요.
        </p>

        {menu.ingredient_notices.length === 0 && <p className="muted">등록된 재료 정보가 없어요.</p>}
        {menu.ingredient_notices.map((notice) => (
          <div className="notice-row" key={notice.ingredient_name}>
            <span>
              {notice.ingredient_name}{" "}
              <span className={`status-pill ${notice.status === "unknown" ? "unknown" : ""}`}>
                {STATUS_LABEL[notice.status]}
              </span>
            </span>
            <button type="button" onClick={() => handleRemove(notice.ingredient_name)} disabled={busy}>
              삭제
            </button>
          </div>
        ))}

        <form onSubmit={handleAdd} className="form-grid" style={{ marginTop: 16 }}>
          <label className="field full">
            재료 이름
            <input value={ingredientName} onChange={(e) => setIngredientName(e.target.value)} placeholder="예: 돼지고기" />
          </label>
          <label className="field">
            확인 상태
            <select value={status} onChange={(e) => setStatus(e.target.value as NoticeStatus)}>
              {(Object.keys(STATUS_LABEL) as NoticeStatus[]).map((key) => (
                <option key={key} value={key}>{STATUS_LABEL[key]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            출처
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value as NoticeSource)}>
              {(Object.keys(SOURCE_LABEL) as NoticeSource[]).map((key) => (
                <option key={key} value={key}>{SOURCE_LABEL[key]}</option>
              ))}
            </select>
          </label>
          <label className="field full">
            확인 날짜 (선택)
            <input type="date" value={verifiedAt} onChange={(e) => setVerifiedAt(e.target.value)} />
          </label>
          {error && <p className="error-text full">{error}</p>}
          <div className="full" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="secondary" onClick={onClose}>닫기</button>
            <button type="submit" className="primary" disabled={busy}>추가</button>
          </div>
        </form>
      </div>
    </div>
  );
}
