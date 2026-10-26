import { CartBar } from '../components/CartBar';
import { MenuThumb, TopBar } from '../components/common';
import { REASON_LABEL, TEXT, won } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 추천 3개. 누르면 담긴다 */
export function RecommendScreen() {
  const k = useKioskContext();
  const { state, catalog, commands: c } = k;
  const categories = catalog.menu?.categories ?? [];
  const items = catalog.menu?.items ?? state.recommendations.map(r => r.menu);
  const qty = (id: string) => state.cart.find(l => l.menuId === id)?.quantity ?? 0;

  return (
    <div className="screen">
      <TopBar onBack={c.back} />
      <div className="body">
        <p className="title">{TEXT.recommend.title}</p>
        <p className="lead mute">{TEXT.recommend.guide}</p>
        {state.recommendations.map((r, i) => (
          <button key={r.menu.id} className={`tile rec${qty(r.menu.id) ? ' in-cart' : ''}`}
            aria-label={TEXT.recommend.add(i + 1, r.menu.name, r.menu.price)} onClick={() => c.addToCart(r.menu.id)}>
            <MenuThumb item={r.menu} categories={categories} />
            <div className="info">
              <span className="rank">{TEXT.recommend.rank(i + 1)}</span>
              <span className="name">{r.menu.name}</span>
              <span className="price">{won(r.menu.price)}</span>
              {r.reasons.length > 0 && (
                <div className="chips">{r.reasons.map(x => <span key={x} className="chip">{REASON_LABEL[x]}</span>)}</div>
              )}
            </div>
            {qty(r.menu.id) > 0 && <span className="badge">{TEXT.tile.inCart(qty(r.menu.id))}</span>}
          </button>
        ))}
        <div className="spacer" />
        <button className="btn btn-block" onClick={c.goMenu}>{TEXT.recommend.moreMenu}</button>
      </div>
      <CartBar cart={state.cart} items={items} onCheckout={c.checkout} />
    </div>
  );
}
