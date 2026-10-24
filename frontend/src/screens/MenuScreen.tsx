import { useEffect, useMemo, useState } from 'react';
import { CartBar } from '../components/CartBar';
import { MenuThumb, Notice, TopBar } from '../components/common';
import { won } from '../kiosk/copy';
import type { KioskController } from '../kiosk/useKiosk';

const EASY_PAGE_SIZE = 4; // 쉬운 화면은 한 화면에 선택지 4개 이하 (RULES 4장)

/** 메뉴판: 카테고리 + 메뉴. "AI와 대화하기"로 질문을 시작할 수 있다 (D9, D19) */
export function MenuScreen({ k }: { k: KioskController }) {
  const { state, catalog, notice, commands: c } = k;
  const menu = catalog.menu;
  const easy = state.mode === 'easy';
  const categories = useMemo(() => [...(menu?.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [menu]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const active = categoryId ?? categories[0]?.id ?? null;

  const items = useMemo(
    () => (menu?.items ?? []).filter(i => i.categoryId === active).sort((a, b) => a.sortOrder - b.sortOrder),
    [menu, active],
  );
  const pages = easy ? Math.max(1, Math.ceil(items.length / EASY_PAGE_SIZE)) : 1;
  const shown = easy ? items.slice(page * EASY_PAGE_SIZE, (page + 1) * EASY_PAGE_SIZE) : items;
  useEffect(() => setPage(0), [active, easy]);

  const qty = (id: string) => state.cart.find(l => l.menuId === id)?.quantity ?? 0;

  return (
    <div className="screen">
      <TopBar mode={state.mode} storeName={menu?.storeName} onToggleMode={c.toggleMode} />
      <div className="body">
        {notice && <Notice message={notice} actionLabel="닫기" onAction={c.dismissNotice} />}
        {!menu ? (
          catalog.loadError
            ? <div className="center body"><p className="panel-error">{catalog.loadError}</p>
                <button className="btn btn-primary btn-lg" onClick={c.retryLoad}>다시 시도</button></div>
            : <div className="center body"><div className="spinner" /></div>
        ) : (
          <>
            <button className="btn btn-primary btn-block btn-lg" onClick={c.openChat}>
              🗣 AI와 대화하기 · 질문 4개로 메뉴 추천
            </button>
            <div className="tabs" role="tablist">
              {categories.map(cat => (
                <button key={cat.id} role="tab" aria-selected={cat.id === active}
                  className={`tab${cat.id === active ? ' on' : ''}`} onClick={() => setCategoryId(cat.id)}>
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="grid">
              {shown.map(item => (
                <button key={item.id} className={`card${qty(item.id) ? ' in-cart' : ''}`} onClick={() => c.addToCart(item.id)}>
                  <MenuThumb item={item} categories={categories} />
                  <div className="info">
                    <span className="name">{item.name}</span>
                    <span className="price">{won(item.price)}</span>
                    {!easy && item.description && <span className="desc">{item.description}</span>}
                  </div>
                  {qty(item.id) > 0 && <span className="badge">{qty(item.id)}개</span>}
                </button>
              ))}
            </div>
            {easy && pages > 1 && (
              <div style={{ display: 'flex', gap: 'var(--gap)', alignItems: 'center' }}>
                <button className="btn btn-outline" style={{ flex: 1 }} disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ 앞 메뉴</button>
                <span className="mute">{page + 1} / {pages}</span>
                <button className="btn btn-outline" style={{ flex: 1 }} disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>다음 메뉴 ›</button>
              </div>
            )}
          </>
        )}
      </div>
      <CartBar cart={state.cart} items={menu?.items ?? []} onCheckout={c.checkout} />
    </div>
  );
}
