import { useEffect, useState } from 'react';
import { Icon } from '../components/icons';
import { Lines, TopBar } from '../components/common';
import { cartTotals } from '../components/OrderBar';
import { config } from '../config';
import { TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 결제 중 (시뮬레이션, D13). 정지한 카드 그림, 버튼 없음 (디자인 명세 2-15) */
export function PayingScreen() {
  return (
    <div className="screen paying">
      <TopBar />
      <div className="body center">
        <span className="card-icon"><Icon.card /></span>
        <p className="t-h1">{TEXT.paying.title}</p>
        <p className="t-body">{TEXT.paying.body}</p>
      </div>
    </div>
  );
}

/** 결제 실패: 오류 종이 + 담은 메뉴 요약. 장바구니는 그대로 (디자인 명세 2-12) */
export function PayFailedScreen() {
  const { state, catalog, payFailReason, commands: c } = useKioskContext();
  const items = catalog.menu?.items ?? [];
  const { amount } = cartTotals(state.cart, items);
  const summary = state.cart
    .map(l => { const item = items.find(i => i.id === l.menuId); return item ? TEXT.payFailed.summaryLine(item.name, l.quantity) : null; })
    .filter(Boolean)
    .join(', ');
  return (
    <div className="screen pay-failed">
      <TopBar />
      <div className="body">
        <div className="sheet">
          <h1 className="t-h1 t-stamp"><Lines lines={TEXT.payFailed.title} /></h1>
          <p className="t-body t-bold" role="alert">{payFailReason ?? TEXT.payFailed.fallbackReason}</p>
          <p className="t-body">{TEXT.payFailed.keep}</p>
          <div className="tear" />
          <p className="t-body">{summary}</p>
          <p className="t-h2 t-num">{TEXT.payFailed.summaryTotal(amount)}</p>
        </div>
        <div className="spacer" />
        <button className="btn btn-primary btn-lg btn-block" onClick={c.pay}>{TEXT.payFailed.retry}</button>
        <button className="btn btn-lg btn-block" onClick={c.backToCart}>{TEXT.payFailed.toCart}</button>
      </div>
    </div>
  );
}

const secondsLeft = (since: number) => Math.max(0, Math.ceil((since + config.doneResetMs - Date.now()) / 1000));

/** 주문번호: 번호표 + 인주 도장 "접수" (디자인 명세 2-13). 15초 뒤 처음 화면 (D30, v1.2) */
export function DoneScreen() {
  const { state, commands: c } = useKioskContext();
  const since = state.lastInteractionAt;
  const [left, setLeft] = useState(() => secondsLeft(since));
  useEffect(() => {
    const id = setInterval(() => setLeft(secondsLeft(since)), 250);
    return () => clearInterval(id);
  }, [since]);
  const num = state.orderNumber ?? '';

  return (
    <div className="screen done">
      <TopBar />
      <div className="body">
        <div className="spacer" />
        <p className="t-h1">{TEXT.done.title}</p>
        <div className="ticket">
          <div className="stamp" aria-hidden>{TEXT.done.stamp}</div>
          <p className="t-h2">{TEXT.done.label}</p>
          <p className="t-display t-num" aria-label={TEXT.done.numberAria(num)}>{num}</p>
          <div className="tear" />
          <p className="t-h2 pickup"><Lines lines={TEXT.done.pickup} /></p>
        </div>
        <div className="spacer" />
        <p className="t-body">{TEXT.done.countdown(left)}</p>
        <button className="btn btn-block" onClick={c.reset}>{TEXT.done.home}</button>
      </div>
    </div>
  );
}
