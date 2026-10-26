import { useMemo, useState } from 'react';
import { CartBar } from '../components/CartBar';
import { ChatIcon, MenuThumb, Notice, TopBar } from '../components/common';
import { TEXT, won } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';
import { layoutFor } from '../styles/layout';

/** 메뉴판: 카테고리 + 메뉴. "AI와 대화하기"로 질문을 시작할 수 있다 (D9, D19) */
export function MenuScreen() {
  const k = useKioskContext();
  const { state, catalog, notice, commands: c } = k;
  const menu = catalog.menu;
  const layout = layoutFor(state.mode);
  const categories = useMemo(() => (menu?.categories ?? []).toSorted((a, b) => a.sortOrder - b.sortOrder), [menu]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [pageWanted, setPage] = useState(0);
  const active = categoryId ?? categories[0]?.id ?? null;

  const items = useMemo(
    () => (menu?.items ?? []).filter(i => i.categoryId === active).sort((a, b) => a.sortOrder - b.sortOrder),
    [menu, active],
  );
  const size = layout.menuPageSize;
  const pages = size ? Math.max(1, Math.ceil(items.length / size)) : 1;
  const page = Math.min(pageWanted, pages - 1); // 모드가 바뀌어 페이지 수가 줄어도 범위 안에 둔다
  const shown = size ? items.slice(page * size, (page + 1) * size) : items;
  const chooseCategory = (id: string) => { setCategoryId(id); setPage(0); };

  const qty = (id: string) => state.cart.find(l => l.menuId === id)?.quantity ?? 0;

  return (
    <div className="screen">
      <TopBar />
      <div className="body">
        {notice && <Notice message={notice} actionLabel={TEXT.common.close} onAction={c.dismissNotice} />}
        {!menu ? (
          catalog.loadError
            ? <div className="center body"><p className="title error-text" role="alert">{catalog.loadError}</p>
                <button className="btn btn-primary btn-lg" onClick={c.retryLoad}>{TEXT.common.retry}</button></div>
            : <div className="center body"><div className="spinner" /></div>
        ) : (
          <>
            <button className="btn btn-primary btn-block btn-lg" onClick={c.openChat}>
              <ChatIcon />{TEXT.menu.chat}
            </button>
            <div className="tabs" role="tablist">
              {categories.map(cat => (
                <button key={cat.id} role="tab" aria-selected={cat.id === active}
                  className={`tab${cat.id === active ? ' on' : ''}`} onClick={() => chooseCategory(cat.id)}>
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="grid">
              {shown.map(item => (
                <button key={item.id} className={`tile${qty(item.id) ? ' in-cart' : ''}`}
                  aria-label={TEXT.tile.add(item.name, item.price)} onClick={() => c.addToCart(item.id)}>
                  <MenuThumb item={item} categories={categories} />
                  <div className="info">
                    <span className="name">{item.name}</span>
                    <span className="price">{won(item.price)}</span>
                    {layout.showMenuDescription && item.description && <span className="desc">{item.description}</span>}
                  </div>
                  {qty(item.id) > 0 && <span className="badge">{TEXT.tile.inCart(qty(item.id))}</span>}
                </button>
              ))}
            </div>
            {pages > 1 && (
              <div className="row">
                <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>{TEXT.menu.prevPage}</button>
                <span className="mute">{TEXT.menu.page(page + 1, pages)}</span>
                <button className="btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>{TEXT.menu.nextPage}</button>
              </div>
            )}
          </>
        )}
      </div>
      <CartBar cart={state.cart} items={menu?.items ?? []} onCheckout={c.checkout} />
    </div>
  );
}
