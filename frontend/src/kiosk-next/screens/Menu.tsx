// 메뉴판(A안): 왼쪽 세로 카테고리 레일 + 오른쪽 2열 사진 카드. 초성 검색을 켜면 카드 위에 자판이 열립니다.
import { useRef, useState } from 'react';
import { KEYPAD } from '../../prototype/hangul';
import { quantityOf } from '../cart';
import type { Kiosk } from '../useKiosk';
import { money, type Menu } from '../types';
import { InfoIcon, PlateArt } from '../ui/art';
import { Photo } from '../ui/Photo';

const servingLabel = (menu: Menu) => {
  const min = menu.servingMin ?? menu.servingPeople;
  return `${min === menu.servingPeople ? min : `${min}~${menu.servingPeople}`}인용`;
};

function MenuCard({ menu, quantity, photo, focus, onPick, onMinus, onInfo }: {
  menu: Menu; quantity: number; photo?: string; focus?: string; onPick: () => void; onMinus: () => void; onInfo: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const meta = [menu.quantityUnit, servingLabel(menu), ...menu.flavor, ...menu.texture].filter(Boolean).join(' · ');
  return (
    <article className={`kx-card ${quantity ? 'is-added' : ''} ${menu.soldOut ? 'is-sold-out' : ''}`}>
      <div className="kx-photo">
        {photo && !broken ? <Photo src={photo} focus={focus} onError={() => setBroken(true)} /> : <><PlateArt /><span>사진 준비 중</span></>}
        {menu.badge && <b className="kx-badge">{menu.badge}</b>}
        {menu.soldOut && <b className="kx-soldout">품절</b>}
        <button className="kx-info" onClick={onInfo} aria-label={`${menu.name} 설명 보기`} aria-haspopup="dialog"><InfoIcon /></button>
      </div>
      <div className="kx-card-body">
        <h3>{menu.name}</h3>
        <span className="kx-meta">{meta}</span>
        <span className="kx-spicy">{menu.spicy > 0 ? `맵기 ${'●'.repeat(menu.spicy)}${'○'.repeat(3 - menu.spicy)}` : ''}</span>
        <strong className="kx-price">{money(menu.price)}</strong>
        {quantity === 0 ? (
          <button className="kx-btn kx-btn-primary kx-add" disabled={menu.soldOut} aria-label={`${menu.name} ${menu.soldOut ? '품절' : '담기'}, ${money(menu.price)}`} onClick={onPick}>
            {menu.soldOut ? '품절' : '담기'}
          </button>
        ) : (
          <div className="kx-stepper">
            <button className="kx-step" aria-label={`${menu.name} 하나 빼기`} onClick={onMinus}>−</button>
            <output aria-label={`${menu.name} 수량`}>{quantity}개</output>
            <button className="kx-step kx-step-plus" aria-label={`${menu.name} 하나 더`} onClick={onPick}>+</button>
          </div>
        )}
      </div>
    </article>
  );
}

export function MenuScreen({ kiosk }: { kiosk: Kiosk }) {
  const { state, catalog, act } = kiosk;
  const { category, search, cart } = state;
  const scroller = useRef<HTMLDivElement>(null);
  const searching = search !== null;
  const shown = searching ? catalog.search(search) : catalog.inCategory(category);
  const label = searching ? '메뉴 찾기' : catalog.categories.find(c => c.id === category)?.label;
  const inCategory = (id: string) => cart.reduce((n, l) => (catalog.get(l.id).category === id ? n + l.quantity : n), 0);

  return (
    <div className="kx-menu">
      <nav className="kx-rail" aria-label="메뉴 종류">
        {catalog.categories.map(c => {
          const n = inCategory(c.id);
          return (
            <button key={c.id} className="kx-rail-tab" aria-pressed={!searching && category === c.id}
              aria-label={n ? `${c.label}, ${n}개 담음` : c.label}
              onClick={() => { act.selectCategory(c.id); act.search(null); scroller.current?.scrollTo?.({ top: 0 }); }}>
              {c.label}
              {n > 0 && <span className="kx-rail-count" aria-hidden="true">{n}</span>}
            </button>
          );
        })}
      </nav>
      <section className="kx-menu-main">
        <div className="kx-menu-title">
          <h1>{label}</h1>
          <button className="kx-btn kx-btn-ghost" aria-pressed={searching} onClick={() => act.search(searching ? null : '')}>{searching ? '찾기 닫기' : '메뉴 찾기'}</button>
        </div>
        {searching && (
          <div className="kx-chosung" role="group" aria-label="초성으로 메뉴 찾기">
            <div className="kx-chosung-query" aria-live="polite">
              {search ? <><strong>{search}</strong><span>초성으로 찾는 중</span></> : <span>메뉴 이름의 첫 자음을 눌러 주세요. 예: 짬뽕 → ㅉ ㅃ</span>}
            </div>
            <div className="kx-chosung-keys">
              {KEYPAD.map(k => <button key={k} className="kx-key" onClick={() => act.search(search + k)}>{k}</button>)}
              <button className="kx-key wide" aria-label="한 글자 지우기" onClick={() => act.search(search.slice(0, -1))}>⌫</button>
              <button className="kx-key wide" onClick={() => act.search('')}>전체 지우기</button>
            </div>
          </div>
        )}
        <div className="kx-grid-scroll" ref={scroller}>
          {searching && search && !shown.length
            ? <p className="kx-empty">‘{search}’로 시작하는 메뉴가 없어요.</p>
            : (
              <div className="kx-grid">
                {shown.map(m => (
                  <MenuCard key={m.id} menu={m} quantity={quantityOf(cart, m.id)} photo={catalog.photo(m.id)} focus={catalog.focus(m.id)}
                    onPick={() => act.pick(m)} onMinus={() => act.decrementMenu(m.id)}
                    onInfo={() => act.open({ kind: 'info', menu: m, tab: 'info' })} />
                ))}
              </div>
            )}
        </div>
      </section>
    </div>
  );
}
