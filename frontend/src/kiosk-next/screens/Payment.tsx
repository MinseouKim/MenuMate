// 결제(전시 체험용: 실제 금액은 청구되지 않습니다). 먹는 곳 → 주문 확인 → 결제 수단 → 확인 팝업.
import { useEffect, useRef, useState } from 'react';
import { lineKey, lineName } from '../cart';
import type { Kiosk } from '../useKiosk';
import { money, type Dine } from '../types';
import { CardArt, PhoneArt } from '../ui/art';
import { Modal } from '../ui/Modal';

const METHODS = [['card', '카드결제', '신용 · 체크카드'], ['online', '간편결제', '카카오페이 · 네이버페이 · 토스페이']] as const;
const PROVIDERS = ['카카오페이', '네이버페이', '토스페이'];

export function Payment({ kiosk }: { kiosk: Kiosk }) {
  const { state, catalog, total, count, act } = kiosk;
  // 먹는 곳과 결제 수단은 둘 다 손님이 직접 고르기 전까지 비어 있습니다(미리 골라 두지 않음).
  const [method, setMethod] = useState<'card' | 'online' | null>(null);
  const [provider, setProvider] = useState<string | null>(null); // 간편결제 종류도 손님이 직접 고릅니다
  const [dine, setDine] = useState<Dine | null>(null);
  const [confirming, setConfirming] = useState(false);
  // 아직 안 고른 것이 있는 채로 결제하기를 누르면, 그 선택 칸들이 잠깐 반짝여 눈이 가게 합니다.
  const [nudge, setNudge] = useState<{ n: number; dine: boolean; method: boolean }>({ n: 0, dine: false, method: false });
  const dinePanel = useRef<HTMLElement>(null);
  const methodPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!nudge.n) return;
    (nudge.dine ? dinePanel : methodPanel).current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setNudge({ n: 0, dine: false, method: false }), 2600);
    return () => clearTimeout(t);
  }, [nudge]);
  const paid = useRef(false); // 결제 버튼을 두 번 눌러도 주문이 두 번 만들어지지 않게
  const label = method === 'online' ? (provider ?? '간편결제') : '카드결제';
  const Art = method === 'online' ? PhoneArt : CardArt;
  // 간편결제를 골랐으면 세 가지 페이 중 하나까지 골라야 결제할 수 있습니다.
  const methodDone = method === 'card' || (method === 'online' && provider !== null);
  const canPay = state.cart.length > 0 && dine !== null && methodDone;
  const missing = [!dine && '매장에서 드실지 포장하실지', !method && '결제 수단을', method === 'online' && !provider && '간편결제 종류를'].filter(Boolean).join(', ');

  return (
    <div className="kx-page kx-pay">
      <div className="kx-eyebrow">결제</div>
      <h1>결제 방법을 선택해 주세요</h1>
      <p className="kx-muted">주문 내역과 결제 금액을 확인해 주세요.</p>

      <section ref={dinePanel} className={`kx-panel${nudge.dine ? ' is-nudged' : ''}`} aria-labelledby="kx-pay-dine">
        <h2 id="kx-pay-dine">어디에서 드시나요?</h2>
        <div className="kx-choice-row">
          {(['매장', '포장'] as const).map(d => (
            <button key={d} className="kx-option" aria-pressed={dine === d} onClick={() => { setDine(d); setNudge(v => ({ ...v, dine: false })); }}>{d === '매장' ? '매장에서 먹기' : '포장하기'}</button>
          ))}
        </div>
      </section>

      <section className="kx-panel" aria-labelledby="kx-pay-order">
        <div className="kx-panel-head"><h2 id="kx-pay-order">주문 내역</h2><button className="kx-btn kx-btn-quiet" onClick={() => act.go('menu')}>메뉴 수정</button></div>
        <ul className="kx-pay-items">
          {state.cart.map(line => {
            const menu = catalog.get(line.id);
            return <li key={lineKey(line)}><span>{lineName(menu.name, line)} <small>× {line.quantity}</small></span><strong>{money(menu.price * line.quantity)}</strong></li>;
          })}
        </ul>
      </section>

      {/* 결제 수단을 아예 안 골랐으면 두 수단이, 간편결제까지 골랐는데 페이 종류만 안 골랐으면 페이 버튼 세 개만 반짝입니다. */}
      <section ref={methodPanel} className={`kx-panel${nudge.method ? (method ? ' is-nudged-pills' : ' is-nudged') : ''}`} aria-labelledby="kx-pay-method">
        <h2 id="kx-pay-method">결제 수단</h2>
        <div className="kx-choice-row">
          {METHODS.map(([id, title, detail]) => (
            <button key={id} className="kx-option kx-method" aria-pressed={method === id} onClick={() => { setMethod(id); setNudge(v => ({ ...v, method: false })); }}>
              <span className="art">{id === 'card' ? <CardArt /> : <PhoneArt />}</span>
              <strong>{title}</strong><small>{detail}</small>
            </button>
          ))}
        </div>
        {method === 'online' && (
          <div className="kx-pills" aria-label="간편결제 서비스">
            {PROVIDERS.map(name => <button key={name} className="kx-pill" aria-pressed={provider === name} onClick={() => { setProvider(name); setNudge(v => ({ ...v, method: false })); }}>{name}</button>)}
          </div>
        )}
      </section>

      <section className="kx-total" aria-label="결제 금액"><span>최종 결제 금액</span><strong>{money(total)}</strong></section>
      <div className="kx-actions">
        <p className={nudge.n ? 'kx-alert' : 'kx-muted'} role={nudge.n ? 'alert' : undefined}>{canPay ? '전시 체험용 결제예요. 실제 금액은 청구되지 않아요.' : `${missing} 먼저 골라 주세요.`}</p>
        {/* 다 고르기 전에도 눌리게 두되(disabled 아님) 눌림 반응은 없고, 누르면 아직 안 고른 칸을 반짝여 안내합니다. */}
        <button className="kx-btn kx-btn-primary" aria-disabled={!canPay} disabled={!state.cart.length}
          onClick={() => (canPay ? setConfirming(true) : setNudge(v => ({ n: v.n + 1, dine: !dine, method: !methodDone })))}>{`${money(total)} 결제하기`}</button>
        <button className="kx-btn kx-btn-quiet" onClick={() => act.go('menu')}>메뉴로 돌아가기</button>
      </div>

      {confirming && dine && methodDone && (
        <Modal title={`${label}로 결제할까요?`} onClose={() => setConfirming(false)} hideClose className="kx-modal-pay">
          <div className="kx-pay-confirm">
            <div className="art"><Art /></div>
            <strong className="amount">{money(total)}</strong>
            <dl className="kx-pay-summary">
              <div><dt>먹는 곳</dt><dd>{dine === '매장' ? '매장에서 먹기' : '포장하기'}</dd></div>
              <div><dt>결제 수단</dt><dd>{label}</dd></div>
              <div><dt>메뉴</dt><dd>{count}개</dd></div>
            </dl>
            <p className="kx-muted">{method === 'card' ? '실제 매장에서는 리더기에 카드를 넣거나 대요.' : '실제 매장에서는 결제 앱 QR코드를 리더기에 보여 줘요.'} 전시에서는 아래 버튼만 누르면 돼요.</p>
            <div className="kx-pay-actions">
              <button className="kx-btn kx-btn-primary" autoFocus onClick={() => { if (paid.current) return; paid.current = true; act.pay({ method: label, amount: total, dine }); }}>결제 진행하기</button>
              <button className="kx-btn kx-btn-ghost" onClick={() => setConfirming(false)}>결제 수단 변경</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
