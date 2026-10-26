import { Icon } from '../components/icons';
import { Lines, TopBar } from '../components/common';
import { ORDER_TYPE_LABEL, TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 매장/포장 선택 (D42). 두 상자 같은 무게, 그림과 말로 구분 (디자인 명세 2-9) */
export function OrderTypeScreen() {
  const { commands: c } = useKioskContext();
  return (
    <div className="screen">
      <TopBar onBack={c.back} />
      <div className="body">
        <h1 className="t-h1"><Lines lines={TEXT.orderType.title} /></h1>
        <div className="choices">
          <button className="btn" onClick={() => c.chooseOrderType('dine_in')}><Icon.bowl />{ORDER_TYPE_LABEL.dine_in}</button>
          <button className="btn" onClick={() => c.chooseOrderType('takeout')}><Icon.bag />{ORDER_TYPE_LABEL.takeout}</button>
        </div>
      </div>
    </div>
  );
}
