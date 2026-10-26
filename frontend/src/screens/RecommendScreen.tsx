import { ItemRow } from '../components/MenuItems';
import { Lines, TopBar } from '../components/common';
import { OrderBar } from '../components/OrderBar';
import { reasonsText, TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 추천 3개. 줄마다 [담기] (디자인 명세 2-5) */
export function RecommendScreen() {
  const { state, catalog, commands: c } = useKioskContext();
  const categories = catalog.menu?.categories ?? [];
  const items = catalog.menu?.items ?? state.recommendations.map(r => r.menu);
  const qty = (id: string) => state.cart.find(l => l.menuId === id)?.quantity ?? 0;
  const anyAdded = state.recommendations.some(r => qty(r.menu.id) > 0);

  return (
    <div className="screen recommend">
      <TopBar onBack={c.back} />
      <div className="body">
        <h1 className="t-h1"><Lines lines={TEXT.recommend.title} /></h1>
        <p className="t-body">{anyAdded ? TEXT.recommend.guideAfter : TEXT.recommend.guide}</p>
        <div className="items">
          {state.recommendations.map(r => (
            <ItemRow key={r.menu.id} item={r.menu} categories={categories} qty={qty(r.menu.id)}
              why={reasonsText(r.reasons) || undefined} onAdd={() => c.addToCart(r.menu.id)} />
          ))}
        </div>
        <div className="spacer" />
        <button className="btn btn-block" onClick={c.goMenu}>{TEXT.recommend.more}</button>
      </div>
      <OrderBar cart={state.cart} items={items} onCheckout={c.checkout} />
    </div>
  );
}
