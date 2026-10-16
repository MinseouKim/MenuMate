import { useCallback, useEffect, useState } from "react";
import { api, ApiRequestError } from "./api.js";
import type { FeaturedSet, Menu, StoreOwnerSession } from "./types.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { Dashboard } from "./components/Dashboard.js";
import { MenuManager } from "./components/MenuManager.js";
import { FeaturedSetManager } from "./components/FeaturedSetManager.js";
import { FeaturedMenuManager } from "./components/FeaturedMenuManager.js";

const SESSION_KEY = "menumate-admin-session";

type Tab = "dashboard" | "menus" | "featuredMenus" | "featured";

function loadSession(): StoreOwnerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoreOwnerSession) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<StoreOwnerSession | null>(() => loadSession());
  const [tab, setTab] = useState<Tab>("dashboard");
  const [menus, setMenus] = useState<Menu[]>([]);
  const [featuredSets, setFeaturedSets] = useState<FeaturedSet[]>([]);
  const [loadError, setLoadError] = useState("");

  const refetch = useCallback(async () => {
    if (!session) return;
    try {
      const [menuRes, setRes] = await Promise.all([api.listMenus(), api.listFeaturedSets(session.token)]);
      setMenus(menuRes.menus);
      setFeaturedSets(setRes.featuredSets);
      setLoadError("");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        // 세션이 만료된 경우 로그인 화면으로 돌려보낸다.
        handleLogout();
        return;
      }
      setLoadError("데이터를 불러오지 못했어요. 서버가 켜져 있는지 확인해 주세요.");
    }
  }, [session]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  function handleLogin(next: StoreOwnerSession) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setMenus([]);
    setFeaturedSets([]);
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <span className="brand">menumate 관리자</span>
        <span className="store-owner">
          {session.displayName}
          <button onClick={handleLogout}>로그아웃</button>
        </span>
      </header>
      <nav className="admin-tabs">
        <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>대시보드</button>
        <button className={tab === "menus" ? "active" : ""} onClick={() => setTab("menus")}>메뉴 관리</button>
        <button className={tab === "featuredMenus" ? "active" : ""} onClick={() => setTab("featuredMenus")}>추천 메뉴</button>
        <button className={tab === "featured" ? "active" : ""} onClick={() => setTab("featured")}>추천 세트</button>
      </nav>
      <main className="admin-main">
        {loadError && <p className="error-text">{loadError}</p>}
        {tab === "dashboard" && <Dashboard menus={menus} featuredSets={featuredSets} />}
        {tab === "menus" && <MenuManager token={session.token} menus={menus} onChange={refetch} />}
        {tab === "featuredMenus" && <FeaturedMenuManager token={session.token} menus={menus} onChange={refetch} />}
        {tab === "featured" && (
          <FeaturedSetManager token={session.token} menus={menus} featuredSets={featuredSets} onChange={refetch} />
        )}
      </main>
    </div>
  );
}
