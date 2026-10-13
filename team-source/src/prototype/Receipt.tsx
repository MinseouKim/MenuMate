export interface ReceiptItem { id: string; name: string; quantity: number; price: number; option?: string }
import type { PaymentResult } from './Payment';
export interface Order { number: string; items: ReceiptItem[]; total: number; paidAt: Date; payment?: PaymentResult }
const money = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const time = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export function Receipt({ order }: { order: Order }) {
  return <section className="receipt" aria-label="영수증">
    <header className="receipt-head"><strong>menumate</strong><span>{time(order.paidAt)}</span></header>
    {order.payment && <div className="receipt-dine">{order.payment.dine === '포장' ? '포장 주문' : '매장 식사'}</div>}
    <div className="receipt-number"><span>주문 번호</span><strong>{order.number}</strong></div>
    <ul className="receipt-items">{order.items.map(item => <li key={`${item.id}|${item.option ?? ''}`}>
      <span className="receipt-name">{item.option ? `${item.name} (${item.option})` : item.name}</span>
      <span className="receipt-qty">{item.quantity}개</span>
      <span className="receipt-price">{money(item.price * item.quantity)}</span>
      {item.quantity > 1 && <small>{money(item.price)} × {item.quantity}</small>}
    </li>)}</ul>
    <div className="receipt-total"><span>합계</span><strong>{money(order.total)}</strong></div>
    {order.payment && <div className="receipt-payment"><div><span>결제 수단</span><strong>{order.payment.method}</strong></div><div><span>결제 금액</span><strong>{money(order.payment.amount)}</strong></div></div>}
  </section>;
}
