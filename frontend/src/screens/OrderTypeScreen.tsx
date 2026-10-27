import { BagIcon, BowlIcon, glowIf, Lines, TopBar } from '../components/common';
import { ORDER_TYPE_LABEL, TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 매장/포장 선택. 장바구니 직전 (D42) */
export function OrderTypeScreen() {
  const { state, commands: c } = useKioskContext();
  const glow = glowIf(state.mode === 'easy');
  return (
    <div className="screen">
      <TopBar onBack={c.back} />
      <div className="body center">
        <p className="hero"><Lines lines={TEXT.orderType.title} /></p>
        <div className="answers stack">
          {/* 두 버튼 같은 무게, 그림으로 구분 (사용성 점검 U2) */}
          <button className={`btn${glow}`} onClick={() => c.chooseOrderType('dine_in')}><BowlIcon />{ORDER_TYPE_LABEL.dine_in}</button>
          <button className={`btn${glow}`} onClick={() => c.chooseOrderType('takeout')}><BagIcon />{ORDER_TYPE_LABEL.takeout}</button>
        </div>
      </div>
    </div>
  );
}
