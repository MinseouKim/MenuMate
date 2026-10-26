import { CartBar } from '../components/CartBar';
import { TopBar } from '../components/common';
import { MenuCard } from '../components/MenuCard';
import { TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 추천 3개. 카드를 누르면 담긴다 (아래 "담기" 띠) */
export function RecommendScreen() {
  const { state, catalog, commands: c } = useKioskContext();
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
          <MenuCard key={r.menu.id} variant="row" item={r.menu} categories={categories} qty={qty(r.menu.id)}
            easy={state.mode === 'easy'} rank={TEXT.recommend.rank(i + 1)} reasons={r.reasons}
            ariaLabel={TEXT.recommend.add(i + 1, r.menu.name, r.menu.price)} onAdd={() => c.addToCart(r.menu.id)} />
        ))}
        <div className="spacer" />
        <button className="btn btn-block" onClick={c.goMenu}>{TEXT.recommend.moreMenu}</button>
      </div>
      <CartBar cart={state.cart} items={items} onCheckout={c.checkout} />
    </div>
  );
}
