import { useMemo, useState } from 'react';
import { CartBar } from '../components/CartBar';
import { ChatIcon, ChevronLeft, Notice, TopBar } from '../components/common';
import { MenuCard } from '../components/MenuCard';
import { TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';
import { layoutFor } from '../styles/layout';

/**
 * 메뉴판: 종류 + 메뉴. "AI와 대화하기"로 질문을 시작할 수 있다 (D9, D19).
 * 큰 글씨 화면은 한 화면에 한 가지 일만 하도록 두 단계다: 종류 고르기 → 그 종류의 메뉴 (사용성 점검 U5).
 */
export function MenuScreen() {
  const { state, catalog, notice, commands: c } = useKioskContext();
  const menu = catalog.menu;
  const layout = layoutFor(state.mode);
  const easy = state.mode === 'easy';
  const categories = useMemo(() => (menu?.categories ?? []).toSorted((a, b) => a.sortOrder - b.sortOrder), [menu]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [pageWanted, setPage] = useState(0);
  // 두 단계일 때는 종류를 고르기 전까지 메뉴를 보이지 않는다. 한 단계면 첫 종류부터
  const active = categoryId ?? (layout.menuTwoStep ? null : categories[0]?.id ?? null);

  const items = useMemo(
    () => (menu?.items ?? []).filter(i => i.categoryId === active).sort((a, b) => a.sortOrder - b.sortOrder),
    [menu, active],
  );
  const size = layout.menuPageSize;
  const pages = size ? Math.max(1, Math.ceil(items.length / size)) : 1;
  const page = Math.min(pageWanted, pages - 1); // 모드가 바뀌어 쪽 수가 줄어도 범위 안에 둔다
  const shown = size ? items.slice(page * size, (page + 1) * size) : items;
  const chooseCategory = (id: string | null) => { setCategoryId(id); setPage(0); };
  const qty = (id: string) => state.cart.find(l => l.menuId === id)?.quantity ?? 0;
  const activeName = categories.find(cat => cat.id === active)?.name;

  const chatButton = (
    <button className="btn btn-block btn-lg" onClick={c.openChat}><ChatIcon />{TEXT.menu.chat}</button>
  );

  const body = () => {
    if (!menu) {
      return catalog.loadError
        ? <div className="center body"><p className="title error-text" role="alert">{catalog.loadError}</p>
            <button className="btn btn-primary btn-lg" onClick={c.retryLoad}>{TEXT.common.retry}</button></div>
        : <div className="center body"><div className="spinner" /></div>;
    }
    // 큰 글씨 1단계: 종류만 크게 고른다
    if (layout.menuTwoStep && !active) {
      return (
        <>
          <p className="title">{TEXT.menu.chooseTitle}</p>
          <div className="cat-grid">
            {categories.map(cat => (
              <button key={cat.id} className="btn btn-lg" onClick={() => chooseCategory(cat.id)}>{cat.name}</button>
            ))}
          </div>
          <div className="spacer" />
          {chatButton}
        </>
      );
    }
    return (
      <>
        {layout.menuTwoStep ? (
          // 큰 글씨 2단계: 고른 종류의 메뉴만. 위에서 종류를 다시 고를 수 있다
          <div className="row cat-head">
            <button className="btn" onClick={() => chooseCategory(null)}><ChevronLeft />{TEXT.menu.otherCategory}</button>
            <p className="title">{activeName}</p>
          </div>
        ) : (
          <>
            {chatButton}
            <div className="tabs" role="tablist">
              {categories.map(cat => (
                <button key={cat.id} role="tab" aria-selected={cat.id === active}
                  className={`tab${cat.id === active ? ' on' : ''}`} onClick={() => chooseCategory(cat.id)}>
                  {cat.name}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="grid">
          {shown.map(item => (
            <MenuCard key={item.id} variant="tile" item={item} categories={categories} qty={qty(item.id)} easy={easy}
              showDescription={layout.showMenuDescription} ariaLabel={TEXT.tile.add(item.name, item.price)}
              onAdd={() => c.addToCart(item.id)} />
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
    );
  };

  return (
    <div className="screen">
      <TopBar />
      <div className="body">
        {notice && <Notice message={notice} actionLabel={TEXT.common.close} onAction={c.dismissNotice} />}
        {body()}
      </div>
      <CartBar cart={state.cart} items={menu?.items ?? []} onCheckout={c.checkout} />
    </div>
  );
}
