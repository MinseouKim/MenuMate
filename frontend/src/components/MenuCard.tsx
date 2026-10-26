import type { Category, MenuItem, Reason } from '../api/contracts';
import { REASON_LABEL, TEXT, won } from '../kiosk/copy';
import { CheckIcon, MenuThumb, PlusIcon } from './common';

/**
 * 메뉴 카드 (추천·메뉴판 공통). 카드 전체가 담기 버튼이고, 아래 "담기" 띠가 누르는 곳을 보여 준다 (사용성 점검 U1).
 * 담은 뒤: 큰 글씨 화면은 "✓ 담았어요"(다시 눌러도 늘지 않음, useKiosk), 기본 화면은 "N개 담음 +".
 */
export function MenuCard({ item, categories, qty, easy, variant, ariaLabel, rank, reasons, showDescription, onAdd }: {
  item: MenuItem;
  categories: Category[];
  qty: number;
  easy: boolean;
  variant: 'tile' | 'row';
  ariaLabel: string;
  rank?: string;
  reasons?: readonly Reason[];
  showDescription?: boolean;
  onAdd: () => void;
}) {
  const strip = qty === 0
    ? <><span>{TEXT.tile.addLabel}</span><PlusIcon /></>
    : easy
      ? <><CheckIcon /><span>{qty > 1 ? TEXT.tile.addedQty(qty) : TEXT.tile.added}</span></>
      : <><span>{TEXT.tile.addedQty(qty)}</span><PlusIcon /></>;
  return (
    <button className={`tile${variant === 'row' ? ' rec' : ''}${qty ? ' in-cart' : ''}`} aria-label={ariaLabel} onClick={onAdd}>
      <div className="tile-main">
        <MenuThumb item={item} categories={categories} />
        <div className="info">
          {rank && <span className="rank">{rank}</span>}
          <span className="name">{item.name}</span>
          <span className="price">{won(item.price)}</span>
          {showDescription && item.description && <span className="desc">{item.description}</span>}
          {reasons && reasons.length > 0 && (
            <div className="chips">{reasons.map(x => <span key={x} className="chip">{REASON_LABEL[x]}</span>)}</div>
          )}
        </div>
      </div>
      <div className="add-strip">{strip}</div>
    </button>
  );
}
