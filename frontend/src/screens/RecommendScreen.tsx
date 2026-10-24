import { CartBar } from '../components/CartBar';
import { MenuThumb, TopBar } from '../components/common';
import { REASON_LABEL, won } from '../kiosk/copy';
import type { KioskController } from '../kiosk/useKiosk';

/** 추천 3개. 누르면 담긴다 */
export function RecommendScreen({ k }: { k: KioskController }) {
  const { state, catalog, commands: c } = k;
  const categories = catalog.menu?.categories ?? [];
  const items = catalog.menu?.items ?? state.recommendations.map(r => r.menu);
  const qty = (id: string) => state.cart.find(l => l.menuId === id)?.quantity ?? 0;

  return (
    <div className="screen">
      <TopBar mode={state.mode} storeName={catalog.menu?.storeName} onToggleMode={c.toggleMode} onBack={c.back} />
      <div className="body">
        <p className="title">이런 메뉴는 어떠세요?</p>
        <p className="mute">마음에 드는 메뉴를 누르면 담겨요</p>
        {state.recommendations.map((r, i) => (
          <button key={r.menu.id} className={`rec card${qty(r.menu.id) ? ' in-cart' : ''}`}
            style={{ flexDirection: 'row' }} onClick={() => c.addToCart(r.menu.id)}>
            <MenuThumb item={r.menu} categories={categories} />
            <div className="info">
              <span className="rank">추천 {i + 1}</span>
              <span className="name">{r.menu.name}</span>
              <span className="price" style={{ fontWeight: 700, color: 'var(--primary)' }}>{won(r.menu.price)}</span>
              {r.reasons.length > 0 && (
                <div className="chips">{r.reasons.map(x => <span key={x} className="chip">{REASON_LABEL[x]}</span>)}</div>
              )}
            </div>
            {qty(r.menu.id) > 0 && <span className="badge">{qty(r.menu.id)}개</span>}
          </button>
        ))}
        <div className="spacer" />
        <button className="btn btn-outline btn-block btn-lg" onClick={c.goMenu}>다른 메뉴 보기</button>
      </div>
      <CartBar cart={state.cart} items={items} onCheckout={c.checkout} />
    </div>
  );
}
