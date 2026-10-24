import { cartTotals } from '../components/CartBar';
import { TopBar } from '../components/common';
import { MAX_QUANTITY } from '../kiosk/reducer';
import { ORDER_TYPE_LABEL, won } from '../kiosk/copy';
import type { KioskController } from '../kiosk/useKiosk';

/** 장바구니: 수량 변경 (메뉴 옵션 없음, D26) */
export function CartScreen({ k }: { k: KioskController }) {
  const { state, catalog, commands: c } = k;
  const items = catalog.menu?.items ?? [];
  const { amount } = cartTotals(state.cart, items);

  return (
    <div className="screen">
      <TopBar mode={state.mode} storeName={catalog.menu?.storeName} onToggleMode={c.toggleMode} onBack={c.back} />
      <div className="body">
        <p className="title">주문 내용을 확인해 주세요</p>
        {state.orderType && <p className="lead mute">{ORDER_TYPE_LABEL[state.orderType]}</p>}
        <div className="lines">
          {state.cart.map(line => {
            const item = items.find(i => i.id === line.menuId);
            if (!item) return null;
            return (
              <div key={line.menuId} className="line">
                <div className="name">{item.name}<div className="price caption">{won(item.price * line.quantity)}</div></div>
                <div className="stepper">
                  <button className="btn" aria-label={`${item.name} 하나 빼기`} onClick={() => c.changeQty(line.menuId, -1)}>−</button>
                  <span className="qty">{line.quantity}</span>
                  <button className="btn" aria-label={`${item.name} 하나 더하기`} disabled={line.quantity >= MAX_QUANTITY}
                    onClick={() => c.changeQty(line.menuId, 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="spacer" />
        <div className="total"><span className="title">합계</span><span className="price">{won(amount)}</span></div>
        <button className="btn btn-primary btn-block btn-lg" onClick={c.pay}>{won(amount)} 결제하기</button>
        <button className="btn btn-quiet btn-block" onClick={c.back}>메뉴 더 담기</button>
      </div>
    </div>
  );
}
