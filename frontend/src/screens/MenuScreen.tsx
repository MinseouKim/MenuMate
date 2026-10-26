import { useMemo, useState } from 'react';
import { Icon } from '../components/icons';
import { ItemRow, Tile } from '../components/MenuItems';
import { Lines, Notice, TopBar } from '../components/common';
import { OrderBar } from '../components/OrderBar';
import { TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';
import { layoutFor } from '../styles/layout';

/**
 * 메뉴판 (디자인 명세 2-6, 2-7, 4장). 쉬운/일반이 배치가 다른 두 곳 중 하나다:
 * 쉬운 = 카테고리 3x2 격자 + 메뉴 줄 4개 + 앞/다음, 일반 = 카테고리 한 줄 + 3열 타일(스크롤)
 */
export function MenuScreen() {
  const { state, catalog, notice, commands: c } = useKioskContext();
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
  const page = Math.min(pageWanted, pages - 1); // 모드가 바뀌어 쪽 수가 줄어도 범위 안에 둔다
  const shown = size ? items.slice(page * size, (page + 1) * size) : items;
  const chooseCategory = (id: string) => { setCategoryId(id); setPage(0); };
  const qty = (id: string) => state.cart.find(l => l.menuId === id)?.quantity ?? 0;

  if (!menu) {
    return (
      <div className="screen">
        <TopBar />
        <div className="body">
          {catalog.loadError && (
            <div className="sheet menu-error">
              <h1 className="t-h1 t-stamp"><Lines lines={TEXT.menu.loadErrorTitle} /></h1>
              <p className="t-body" role="alert">{catalog.loadError}</p>
              <p className="t-body">{TEXT.menu.loadErrorBody}</p>
              <button className="btn btn-primary btn-lg btn-block" onClick={c.retryLoad}>{TEXT.menu.retry}</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar />
      <div className={layout.menuPageSize ? 'body' : 'body scroll'}>
        {notice
          ? <Notice lines={TEXT.menu.recFailed} actionLabel={TEXT.menu.close} onAction={c.dismissNotice} />
          : <button className="btn btn-block" onClick={c.openChat}><Icon.chat />{TEXT.menu.ai}</button>}
        <div className="cats" role="tablist">
          {categories.map(cat => (
            <button key={cat.id} role="tab" aria-selected={cat.id === active}
              className={cat.id === active ? 'btn is-on' : 'btn'} onClick={() => chooseCategory(cat.id)}>
              <span className="tick"><Icon.check /></span>{cat.name}
            </button>
          ))}
        </div>
        {layout.menuRows ? (
          <>
            <div className="items compact">
              {shown.map(item => (
                <ItemRow key={item.id} item={item} categories={categories} qty={qty(item.id)} onAdd={() => c.addToCart(item.id)} />
              ))}
            </div>
            {pages > 1 && (
              <div className="row pager">
                <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>{TEXT.menu.prev}</button>
                <span className="t-body t-bold">{TEXT.menu.page(page + 1, pages)}</span>
                <button className="btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>{TEXT.menu.next}</button>
              </div>
            )}
          </>
        ) : (
          <div className="tiles">
            {shown.map(item => (
              <Tile key={item.id} item={item} categories={categories} qty={qty(item.id)}
                showDescription={layout.showMenuDescription} onAdd={() => c.addToCart(item.id)} />
            ))}
          </div>
        )}
      </div>
      <OrderBar cart={state.cart} items={menu.items} onCheckout={c.checkout} />
    </div>
  );
}
