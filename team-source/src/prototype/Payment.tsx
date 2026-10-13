import { useRef, useState } from 'react';
import { Modal } from './Modal';
import type { Line, Menu } from './types';
import { findMenu, lineKey, lineName, linesTotal } from './cart';
import './styles/payment.css';

export type Dine = '매장' | '포장';
export interface PaymentResult { method: string; amount: number; dine: Dine }
const money = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const methods = [['card', '카드결제', '신용 · 체크카드'], ['online', '간편결제', '카카오페이 · 네이버페이 · 토스페이']] as const;

// 결제 안내 그림: 카드는 리더기에 꽂는 모습, 간편결제는 휴대폰 QR을 리더기에 보여 주는 모습.
const CardArt = () => <svg viewBox="0 0 120 90" aria-hidden="true"><rect x="22" y="44" width="76" height="40" rx="6" fill="currentColor" opacity=".18"/><rect x="34" y="56" width="52" height="5" rx="2.5" fill="currentColor" opacity=".6"/><g className="pay-art-move"><rect x="38" y="6" width="44" height="58" rx="5" fill="currentColor"/><rect x="44" y="14" width="12" height="9" rx="2" fill="white" opacity=".85"/></g><path d="M60 70v10m-6-5 6 6 6-6" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"/></svg>;
const PhoneArt = () => <svg viewBox="0 0 120 90" aria-hidden="true"><rect x="70" y="40" width="40" height="44" rx="6" fill="currentColor" opacity=".18"/><rect x="78" y="48" width="24" height="16" rx="2" fill="currentColor" opacity=".5"/><g className="pay-art-move"><rect x="14" y="6" width="40" height="72" rx="7" fill="currentColor"/><rect x="20" y="16" width="28" height="28" fill="white"/><path d="M23 19h8v8h-8zM37 19h8v8h-8zM23 33h8v8h-8zM37 33h3v3h-3zM42 38h3v3h-3z" fill="currentColor"/></g><path d="M58 44h8m-3-4 4 4-4 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"/></svg>;

export function Payment({ lines, menus, onBack, onComplete }: { lines: Line[]; menus: Menu[]; onBack: () => void; onComplete: (result: PaymentResult) => void }) {
  const [method, setMethod] = useState<'card' | 'online'>('card');
  const [provider, setProvider] = useState('카카오페이');
  const [dine, setDine] = useState<Dine | null>(null);
  const [confirm, setConfirm] = useState(false);
  const completed = useRef(false);
  const total = linesTotal(lines, menus);
  const label = method === 'online' ? provider : '카드결제';

  return <div className="payment-page">
    <div className="eyebrow">결제</div>
    <h1>결제 방법을 선택해 주세요</h1>
    <p className="payment-intro">주문 내역과 결제 금액을 확인해 주세요.</p>
    <section className="payment-panel" aria-labelledby="payment-dine-title">
      <h2 id="payment-dine-title">어디에서 드시나요?</h2>
      <div className="payment-dine">{(['매장', '포장'] as const).map(d => <button key={d} className={dine === d ? 'selected' : ''} aria-pressed={dine === d} onClick={() => setDine(d)}><strong>{d === '매장' ? '매장에서 먹기' : '포장하기'}</strong></button>)}</div>
    </section>
    <section className="payment-panel" aria-labelledby="payment-order-title">
      <div className="payment-section-heading"><h2 id="payment-order-title">주문 내역</h2><button className="payment-text-button" onClick={onBack}>메뉴 수정</button></div>
      <ul className="payment-order-items">{lines.map(line => { const menu = findMenu(menus, line.id); return <li key={lineKey(line)}><span>{lineName(menu, line)} <small>× {line.quantity}</small></span><strong>{money(menu.price * line.quantity)}</strong></li>; })}</ul>
    </section>
    <section className="payment-panel" aria-labelledby="payment-method-title">
      <h2 id="payment-method-title">결제 수단</h2>
      <div className="payment-methods">{methods.map(([id, title, detail]) => <button key={id} className={`payment-method ${method === id ? 'selected' : ''}`} aria-pressed={method === id} onClick={() => setMethod(id)}><span className="payment-method-icon">{id === 'card' ? <CardArt/> : <PhoneArt/>}</span><strong>{title}</strong><small>{detail}</small><span className="payment-selection" aria-hidden="true">{method === id ? '●' : '○'}</span></button>)}</div>
      {method === 'online' && <div className="payment-providers" aria-label="간편결제 서비스">{['카카오페이', '네이버페이', '토스페이'].map(name => <button key={name} className={provider === name ? 'selected' : ''} aria-pressed={provider === name} onClick={() => setProvider(name)}>{name}</button>)}</div>}
    </section>
    <section className="payment-summary" aria-label="결제 금액">
      <div className="payment-final"><span>최종 결제 금액</span><strong>{money(total)}</strong></div>
    </section>
    <div className="payment-actions"><p>{dine ? '전시 체험용 결제예요. 실제 금액은 청구되지 않아요.' : '매장에서 드실지 포장하실지 먼저 골라 주세요.'}</p><button className="primary" disabled={!lines.length || !dine} onClick={() => setConfirm(true)}>{`${money(total)} 결제하기`}</button><button className="payment-text-button" onClick={onBack}>메뉴로 돌아가기</button></div>
    {confirm && dine && <Modal title={`${label}로 결제할까요?`} onClose={() => setConfirm(false)}>
      <div className="payment-confirm"><div className="payment-confirm-art">{method === 'card' ? <CardArt/> : <PhoneArt/>}</div><strong>{money(total)}</strong><p>{method === 'card' ? '실제 매장에서는 카드 리더기에 카드를 넣거나 대서 결제해요.' : '실제 매장에서는 결제 앱의 QR코드를 리더기에 보여 줘서 결제해요.'}</p><p className="payment-hint">전시에서는 카드나 휴대폰이 필요 없어요. 아래 버튼을 누르면 바로 결제가 진행돼요.</p><button className="primary" onClick={() => { if (completed.current) return; completed.current = true; onComplete({ method: label, amount: total, dine }); }}>결제 진행하기</button><button className="secondary" onClick={() => setConfirm(false)}>결제 수단 변경</button></div>
    </Modal>}
  </div>;
}
