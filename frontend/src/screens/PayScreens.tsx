import { useEffect, useState } from 'react';
import { TopBar } from '../components/common';
import { config } from '../config';
import type { KioskController } from '../kiosk/useKiosk';

/** 결제 진행 중 (시뮬레이션, D13) */
export function PayingScreen({ k }: { k: KioskController }) {
  return (
    <div className="screen">
      <TopBar mode={k.state.mode} storeName={k.catalog.menu?.storeName} onToggleMode={k.commands.toggleMode} />
      <div className="body center">
        <div className="spinner" />
        <p className="hero">결제하고 있어요</p>
        <p className="title mute">잠시만 기다려 주세요</p>
      </div>
    </div>
  );
}

/** 결제 실패: 장바구니는 그대로 */
export function PayFailedScreen({ k }: { k: KioskController }) {
  const c = k.commands;
  return (
    <div className="screen">
      <TopBar mode={k.state.mode} storeName={k.catalog.menu?.storeName} onToggleMode={c.toggleMode} />
      <div className="body center">
        <p className="hero" style={{ color: 'var(--danger)' }}>결제가 되지 않았어요</p>
        <p className="title">{k.payFailReason ?? '다시 시도해 주세요.'}</p>
        <div className="spacer" />
        <button className="btn btn-primary btn-block btn-lg" onClick={c.pay}>다시 결제하기</button>
        <button className="btn btn-outline btn-block btn-lg" onClick={c.backToCart}>장바구니로</button>
      </div>
    </div>
  );
}

/** 주문번호. 10초 뒤 처음 화면 (D30, D43) */
export function DoneScreen({ k }: { k: KioskController }) {
  const { state, commands: c } = k;
  const [left, setLeft] = useState(Math.ceil(config.doneResetMs / 1000));
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((state.lastInteractionAt + config.doneResetMs - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state.lastInteractionAt]);

  return (
    <div className="screen">
      <div className="body center">
        <p className="title" style={{ color: 'var(--ok)' }}>주문이 끝났어요</p>
        <p className="title mute">주문번호</p>
        <div className="order-number">{state.orderNumber}</div>
        <p className="title">번호를 부르면 받아 가세요</p>
        <div className="spacer" />
        <p className="mute">{left}초 뒤 처음 화면으로 돌아가요</p>
        <button className="btn btn-primary btn-block btn-lg" onClick={c.reset}>처음으로</button>
      </div>
    </div>
  );
}
