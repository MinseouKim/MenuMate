import { cartTotals } from '../components/CartBar';
import { TopBar } from '../components/common';
import { ORDER_TYPE_LABEL, TEXT, won } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';
import { MAX_QUANTITY } from '../kiosk/reducer';

/** 장바구니: 수량 변경 (메뉴 옵션 없음, D26) */
export function CartScreen() {
  const { state, catalog, commands: c } = useKioskContext();
  const items = catalog.menu?.items ?? [];
  const { amount } = cartTotals(state.cart, items);

  return (
    <div className="screen">
      <TopBar onBack={c.back} />
      <div className="body">
        <p className="title">{TEXT.cart.title}</p>
        {state.cart.length === 0 && (
          // 다 비워도 장바구니에 머문다 (v1.2)
          <div className="body center">
            <p className="title">{TEXT.cart.empty}</p>
            <button className="btn btn-primary btn-lg btn-block" onClick={c.goMenu}>{TEXT.cart.goMenu}</button>
          </div>
        )}
        {state.orderType && <p className="lead mute">{ORDER_TYPE_LABEL[state.orderType]}</p>}
        <div className="lines">
          {state.cart.map(line => {
            const item = items.find(i => i.id === line.menuId);
            if (!item) return null;
            return (
              <div key={line.menuId} className="line">
                <div className="name">{item.name}<div className="price caption">{won(item.price * line.quantity)}</div></div>
                <div className="stepper">
                  <button className="btn" aria-label={TEXT.cart.minus(item.name)} onClick={() => c.changeQty(line.menuId, -1)}>−</button>
                  <span className="qty">{line.quantity}</span>
                  <button className="btn" aria-label={TEXT.cart.plus(item.name)} disabled={line.quantity >= MAX_QUANTITY}
                    onClick={() => c.changeQty(line.menuId, 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>
        {state.cart.length > 0 && (<>
        <div className="spacer" />
        <div className="total"><span className="title">{TEXT.cart.total}</span><span className="price">{won(amount)}</span></div>
        <button className="btn btn-primary btn-block btn-lg" onClick={c.pay}>{TEXT.cart.pay(amount)}</button>
        <button className="btn btn-quiet btn-block" onClick={c.back}>{TEXT.cart.more}</button>
        </>)}
      </div>
    </div>
  );
}
