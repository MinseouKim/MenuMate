import { useState } from 'react';
import { cartTotals } from '../components/CartBar';
import { TopBar } from '../components/common';
import { ORDER_TYPE_LABEL, TEXT, won } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';
import { MAX_QUANTITY } from '../kiosk/reducer';

/**
 * 장바구니: 수량 변경 (메뉴 옵션 없음, D26).
 * 수량이 1이면 "−" 대신 [빼기] → 그 줄에서 한 번 묻는다 (사용성 점검 U4). 묻는 상태는 이 화면 안의 상태다.
 */
export function CartScreen() {
  const { state, catalog, commands: c } = useKioskContext();
  const items = catalog.menu?.items ?? [];
  const { amount } = cartTotals(state.cart, items);
  const [confirming, setConfirming] = useState<string | null>(null);
  const askRemove = (menuId: string) => { setConfirming(menuId); c.askRemove(menuId); };
  const remove = (menuId: string) => { setConfirming(null); c.removeLine(menuId); };

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
            if (confirming === line.menuId) {
              return (
                <div key={line.menuId} className="line is-confirm">
                  <div className="name">{item.name}<div className="caption">{TEXT.cart.confirm}</div></div>
                  <div className="stepper">
                    <button className="btn btn-wide" onClick={() => remove(line.menuId)}>{TEXT.cart.confirmYes}</button>
                    <button className="btn btn-wide" onClick={() => setConfirming(null)}>{TEXT.cart.confirmNo}</button>
                  </div>
                </div>
              );
            }
            return (
              <div key={line.menuId} className="line">
                <div className="name">{item.name}<div className="price caption">{won(item.price * line.quantity)}</div></div>
                <div className="stepper">
                  {line.quantity === 1
                    ? <button className="btn btn-wide" aria-label={TEXT.cart.removeAria(item.name)} onClick={() => askRemove(line.menuId)}>{TEXT.cart.remove}</button>
                    : <button className="btn" aria-label={TEXT.cart.minus(item.name)} onClick={() => c.changeQty(line.menuId, -1)}>−</button>}
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
