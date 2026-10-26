import { Lines, TopBar } from '../components/common';
import { ORDER_TYPE_LABEL, TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 매장/포장 선택. 장바구니 직전 (D42) */
export function OrderTypeScreen() {
  const { commands: c } = useKioskContext();
  return (
    <div className="screen">
      <TopBar onBack={c.back} />
      <div className="body center">
        <p className="hero"><Lines lines={TEXT.orderType.title} /></p>
        <div className="answers stack">
          <button className="btn btn-primary" onClick={() => c.chooseOrderType('dine_in')}>{ORDER_TYPE_LABEL.dine_in}</button>
          <button className="btn" onClick={() => c.chooseOrderType('takeout')}>{ORDER_TYPE_LABEL.takeout}</button>
        </div>
      </div>
    </div>
  );
}
