import { TopBar } from '../components/common';
import { ORDER_TYPE_LABEL } from '../kiosk/copy';
import type { KioskController } from '../kiosk/useKiosk';

/** 매장/포장 선택. 장바구니 직전 (D42) */
export function OrderTypeScreen({ k }: { k: KioskController }) {
  const { state, catalog, commands: c } = k;
  return (
    <div className="screen">
      <TopBar mode={state.mode} storeName={catalog.menu?.storeName} onToggleMode={c.toggleMode} onBack={c.back} />
      <div className="body center">
        <p className="hero">드시고 가세요?<br />포장하세요?</p>
        <div className="answers stack">
          <button className="btn btn-primary" onClick={() => c.chooseOrderType('dine_in')}>{ORDER_TYPE_LABEL.dine_in}</button>
          <button className="btn" onClick={() => c.chooseOrderType('takeout')}>{ORDER_TYPE_LABEL.takeout}</button>
        </div>
      </div>
    </div>
  );
}
