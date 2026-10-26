import { useState } from 'react';
import { Icon } from '../components/icons';
import { Lines, TopBar } from '../components/common';
import { cartTotals } from '../components/OrderBar';
import { ORDER_TYPE_LABEL, TEXT, won } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';
import { MAX_QUANTITY } from '../kiosk/reducer';

/**
 * 주문 확인 (장바구니). 주문서 한 장 (디자인 명세 2-10).
 * 수량이 1이면 [−] 대신 [빼기] → 그 줄 안에서 확인. 확인 상태는 이 화면 안의 상태다 (리듀서 밖).
 */
export function CartScreen() {
  const { state, catalog, commands: c } = useKioskContext();
  const items = catalog.menu?.items ?? [];
  const { amount } = cartTotals(state.cart, items);
  const [confirming, setConfirming] = useState<string | null>(null);

  const askRemove = (menuId: string) => { setConfirming(menuId); c.askRemove(menuId); };
  const remove = (menuId: string) => { setConfirming(null); c.removeLine(menuId); };

  if (state.cart.length === 0) {
    // 다 빼도 이 화면에 머문다 (kiosk-flow v1.2)
    return (
      <div className="screen">
        <TopBar onBack={c.back} />
        <div className="body">
          <h1 className="t-h1"><Lines lines={TEXT.cart.title} /></h1>
          <div className="sheet cart-empty">
            <p className="t-h2">{TEXT.cart.empty}</p>
            <p className="t-body">{TEXT.cart.emptyBody}</p>
          </div>
          <div className="spacer" />
          <button className="btn btn-primary btn-lg btn-block" onClick={c.goMenu}>{TEXT.cart.emptyGo}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar onBack={c.back} />
      <div className="body">
        <h1 className="t-h1"><Lines lines={TEXT.cart.title} /></h1>
        {state.orderType && (
          <div className="ordertype">
            <p className="t-body t-bold">{state.orderType === 'dine_in' ? <Icon.bowl /> : <Icon.bag />}{ORDER_TYPE_LABEL[state.orderType]}</p>
          </div>
        )}
        <div className="slip">
          {state.cart.map(line => {
            const item = items.find(i => i.id === line.menuId);
            if (!item) return null;
            if (confirming === line.menuId) {
              return (
                <div key={line.menuId} className="line is-confirm">
                  <span className="name">{item.name}</span>
                  <p className="t-body t-bold">{TEXT.cart.confirm}</p>
                  <div className="stepper">
                    <button className="btn wide" onClick={() => remove(line.menuId)}>{TEXT.cart.confirmYes}</button>
                    <button className="btn wide" onClick={() => setConfirming(null)}>{TEXT.cart.confirmNo}</button>
                  </div>
                </div>
              );
            }
            return (
              <div key={line.menuId} className="line">
                <span className="name">{item.name}</span>
                <div className="stepper">
                  {line.quantity === 1
                    ? <button className="btn wide" aria-label={TEXT.cart.removeAria(item.name)} onClick={() => askRemove(line.menuId)}>{TEXT.cart.remove}</button>
                    : <button className="btn" aria-label={TEXT.cart.minus(item.name)} onClick={() => c.changeQty(line.menuId, -1)}><Icon.minus /></button>}
                  <span className="qty t-num">{TEXT.cart.qty(line.quantity)}</span>
                  <button className="btn" aria-label={TEXT.cart.plus(item.name)} disabled={line.quantity >= MAX_QUANTITY}
                    onClick={() => c.changeQty(line.menuId, 1)}><Icon.plus /></button>
                </div>
                <span className="amount t-num">{won(item.price * line.quantity)}</span>
              </div>
            );
          })}
          <div className="tear" />
          <div className="total"><span className="t-h2">{TEXT.cart.total}</span><span className="amount t-num">{won(amount)}</span></div>
        </div>
        <div className="spacer" />
        <button className="btn btn-primary btn-lg btn-block" onClick={c.pay}>{TEXT.cart.pay(amount)}</button>
        <button className="btn btn-block" onClick={c.back}>{TEXT.cart.more}</button>
      </div>
    </div>
  );
}
