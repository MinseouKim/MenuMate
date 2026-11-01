import { useState } from 'react';
import type { Menu } from './types';
import { hasAnyPhoto, menuImage } from './menuImages';
const servingLabel = (menu: Menu) => { const min = menu.servingMin ?? menu.servingPeople; return `${min === menu.servingPeople ? min : `${min}~${menu.servingPeople}`}인용`; };
export function MenuCard({ menu, quantity, onSelect, onInfo }: { menu: Menu; quantity: number; onSelect: () => void; onInfo: () => void }) {
  const src = menuImage(menu.id); const [broken, setBroken] = useState(false);
  return <article className={`menu-card tap-card ${quantity ? 'is-added' : ''} ${menu.soldOut ? 'is-sold-out' : ''}`}>
    <button className="menu-select" onClick={onSelect} disabled={menu.soldOut} aria-label={`${menu.name} ${menu.soldOut ? '품절' : '선택'}, ${menu.price.toLocaleString('ko-KR')}원`}>{menu.soldOut && <span className="sold-out-label">품절</span>}{hasAnyPhoto ? <span className="menu-photo">{src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)}/> : <span>사진 준비 중</span>}{menu.badge && <b className="menu-badge">{menu.badge}</b>}</span> : menu.badge && <span className="tag"><b className="menu-badge">{menu.badge}</b></span>}<h3>{menu.name}</h3><span className="menu-description">{[menu.quantityUnit, servingLabel(menu), ...menu.flavor, ...menu.texture].filter(Boolean).join(' · ')}</span><strong className="price">{menu.price.toLocaleString('ko-KR')}원</strong>{quantity > 0 && <span className="in-cart">{quantity}개 담김</span>}</button>
    <button className="menu-info" onClick={onInfo} aria-label={`${menu.name} 설명 보기`} aria-haspopup="dialog"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></svg></button>
  </article>;
}
