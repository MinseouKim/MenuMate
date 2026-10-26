import { useEffect, useState } from 'react';
import { glowIf, TopBar } from '../components/common';
import { config } from '../config';
import { TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 결제 진행 중 (시뮬레이션, D13) */
export function PayingScreen() {
  return (
    <div className="screen">
      <TopBar />
      <div className="body center">
        <div className="spinner" />
        <p className="hero">{TEXT.paying.title}</p>
        <p className="title mute">{TEXT.paying.detail}</p>
      </div>
    </div>
  );
}

/** 결제 실패: 장바구니는 그대로 */
export function PayFailedScreen() {
  const { state, payFailReason, commands: c } = useKioskContext();
  return (
    <div className="screen">
      <TopBar />
      <div className="body center">
        <div className="spacer" />
        <p className="hero error-text">{TEXT.payFailed.title}</p>
        <p className="lead" role="alert">{payFailReason ?? TEXT.payFailed.fallbackReason}</p>
        <p className="lead mute">{TEXT.payFailed.cartKept}</p>
        <div className="spacer" />
        <button className={`btn btn-primary btn-block btn-lg${glowIf(state.mode === 'easy')}`} onClick={c.pay}>{TEXT.payFailed.retry}</button>
        <button className="btn btn-block btn-lg" onClick={c.backToCart}>{TEXT.payFailed.toCart}</button>
      </div>
    </div>
  );
}

const secondsLeft = (since: number) => Math.max(0, Math.ceil((since + config.doneResetMs - Date.now()) / 1000));

/** 주문번호. 10초 뒤 처음 화면 (D30, D43) */
export function DoneScreen() {
  const { state, commands: c } = useKioskContext();
  const since = state.lastInteractionAt;
  const [left, setLeft] = useState(() => secondsLeft(since));
  useEffect(() => {
    const id = setInterval(() => setLeft(secondsLeft(since)), 250);
    return () => clearInterval(id);
  }, [since]);

  return (
    <div className="screen">
      <TopBar />
      <div className="body center">
        <div className="spacer" />
        <p className="hero">{TEXT.done.title}</p>
        <div className="ticket">
          <p className="lead">{TEXT.done.numberLabel}</p>
          <div className="order-number" aria-label={TEXT.done.numberAria(state.orderNumber ?? '')}>{state.orderNumber}</div>
        </div>
        <p className="title">{TEXT.done.pickup}</p>
        <div className="spacer" />
        <p>{TEXT.done.countdown(left)}</p>
        {/* 손님이 꼭 할 일이 아니라 흰 버튼 (사용성 점검 U6, U10) */}
        <button className="btn btn-block btn-lg" onClick={c.reset}>{TEXT.done.home}</button>
      </div>
    </div>
  );
}
