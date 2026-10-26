import type { Category, MenuItem } from '../api/contracts';
import { TEXT, won } from '../kiosk/copy';
import { Thumb } from './common';
import { Icon } from './icons';

/** 메뉴 줄: 색 카드 | 이름·이유·가격 | [담기] (쉬운 메뉴판, 추천. 디자인 명세 2-5) */
export function ItemRow({ item, categories, qty, why, onAdd }: {
  item: MenuItem; categories: Category[]; qty: number; why?: string; onAdd: () => void;
}) {
  const on = qty > 0;
  return (
    <div className={on ? 'item is-on' : 'item'}>
      <Thumb item={item} categories={categories} />
      <div className="info">
        <span className="name">{item.name}</span>
        {why && <span className="why">{why}</span>}
        <span className="price t-num">{won(item.price)}</span>
      </div>
      <button className="btn" aria-label={on ? TEXT.add.ariaDone(item.name) : TEXT.add.aria(item.name)} onClick={onAdd}>
        {on ? <><Icon.check />{qty > 1 ? TEXT.add.doneQty(qty) : TEXT.add.done}</> : TEXT.add.button}
      </button>
    </div>
  );
}

/** 메뉴 타일 (기본 화면 메뉴판): 타일 전체가 버튼, 아래 "담기 +" 띠 (디자인 명세 2-6) */
export function Tile({ item, categories, qty, showDescription, onAdd }: {
  item: MenuItem; categories: Category[]; qty: number; showDescription: boolean; onAdd: () => void;
}) {
  return (
    <button className={qty ? 'tile is-on' : 'tile'} aria-label={TEXT.tile.aria(item.name, item.price)} onClick={onAdd}>
      <Thumb item={item} categories={categories} />
      <div className="info">
        <span className="name">{item.name}</span>
        <span className="price t-num">{won(item.price)}</span>
        {showDescription && item.description && <span className="desc">{item.description}</span>}
      </div>
      <div className="add"><span>{qty ? TEXT.tile.added(qty) : TEXT.tile.add}</span><Icon.plus /></div>
    </button>
  );
}
