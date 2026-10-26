import type { MenuItem } from '../api/contracts';
import { TEXT, won } from '../kiosk/copy';
import type { CartLine } from '../kiosk/types';

export function cartTotals(cart: CartLine[], items: MenuItem[]) {
  let count = 0;
  let amount = 0;
  for (const line of cart) {
    const item = items.find(i => i.id === line.menuId);
    count += line.quantity;
    if (item) amount += item.price * line.quantity;
  }
  return { count, amount };
}

/** 메뉴판·추천 화면 하단: 담은 개수와 합계, 주문하기 */
export function CartBar({ cart, items, onCheckout }: { cart: CartLine[]; items: MenuItem[]; onCheckout: () => void }) {
  const { count, amount } = cartTotals(cart, items);
  return (
    <footer className="cartbar">
      <div className="sum">
        {count === 0 ? <span className="mute">{TEXT.cartBar.empty}</span> : (
          <>
            <span>{TEXT.cartBar.count(count)}</span>
            <span className="price">{won(amount)}</span>
          </>
        )}
      </div>
      <button className="btn btn-primary btn-lg" disabled={count === 0} onClick={onCheckout}>{TEXT.cartBar.checkout}</button>
    </footer>
  );
}
