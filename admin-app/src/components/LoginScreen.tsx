import { useState } from "react";
import { api, ApiRequestError } from "../api.js";
import type { StoreOwnerSession } from "../types.js";

export function LoginScreen({ onLogin }: { onLogin: (session: StoreOwnerSession) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(username, password);
      onLogin({ token: res.token, ...res.storeOwner });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "로그인에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>menumate 관리자</h1>
        <p className="muted">점주 계정으로 로그인해 주세요.</p>
        <label>
          아이디
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </label>
        <label>
          비밀번호
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary" type="submit" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}
