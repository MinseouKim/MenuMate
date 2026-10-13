import { useLayoutEffect, useRef } from 'react';
import type { Line, Menu } from './types';
import { findMenu, lineKey, lineName, linesTotal } from './cart';
const money = (n: number) => `${n.toLocaleString('ko-KR')}원`;
export function OrderList({ message, lines, menus, onQuantity, onRemove, onOrder }: { message?: string; lines: Line[]; menus: Menu[]; onQuantity: (id: string, delta: number) => void; onRemove: (id: string) => void; onOrder: () => void }) {
  const dockRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const items = dockRef.current?.querySelector<HTMLElement>('.order-items');
    if (!items) return;
    const visibleItems = Array.from(items.children).slice(0, 2);
    const updateHeight = () => {
      if (!lines.length) {
        items.style.removeProperty('max-height');
        return;
      }
      const height = visibleItems.reduce((sum, item) => sum + item.getBoundingClientRect().height, 0);
      items.style.maxHeight = `${height}px`;
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    visibleItems.forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, [lines, menus]);
  const total = linesTotal(lines, menus);
  return <section ref={dockRef} className="order-dock list-dock" aria-label="담은 메뉴">{message && <div id="toast" className="show order-toast" role="status">{message}</div>}<div className="list-heading"><strong>담은 메뉴 <span>{lines.reduce((n, l) => n + l.quantity, 0)}개</span></strong></div><div className="order-items">{lines.length ? lines.map(line => { const m = findMenu(menus, line.id); const key = lineKey(line); const name = lineName(m, line); return <div className="order-item" key={key}><div className="order-item-title"><strong>{name}</strong><small>{money(m.price)}{m.quantityUnit ? ` / ${m.quantityUnit}` : ''}</small></div><div className="list-quantity"><button onClick={() => onQuantity(key, -1)} disabled={line.quantity === 1} aria-label={`${name} 수량 줄이기`}>−</button><output aria-label={`${name} 수량`}>{line.quantity}</output><button onClick={() => onQuantity(key, 1)} aria-label={`${name} 수량 늘리기`}>+</button></div><strong className="line-price">{money(m.price * line.quantity)}</strong><button className="remove-item" onClick={() => onRemove(key)} aria-label={`${name} 삭제`}>삭제</button></div>; }) : <p className="empty-order">메뉴 카드를 눌러 주문에 추가해 주세요.</p>}</div>{lines.length > 2 && <p className="more-items">목록을 밀면 {lines.length - 2}개 더 있어요</p>}<div className="order-list-total"><span>총 주문 금액 <strong>{money(total)}</strong></span><button className="primary" disabled={!lines.length} onClick={onOrder}>주문하기</button></div></section>;
}
