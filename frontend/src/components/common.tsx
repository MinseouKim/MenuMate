import { Fragment, useLayoutEffect, useState, type ReactNode } from 'react';
import type { Category, MenuItem } from '../api/contracts';
import { TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';
import { canToggleMode } from '../kiosk/reducer';
import type { Mode } from '../kiosk/types';
import { Icon } from './icons';

const W = 1080;
const H = 1920;
const CARD_COUNT = 6; // tokens.css 의 --card-1 ~ --card-6

/** 세로 1080x1920 캔버스. 창 크기에 맞게 줄이고 가운데에 둔다 (D25) */
export function KioskFrame({ mode, children }: { mode: Mode; children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="viewport">
      <div className="kiosk" data-mode={mode} style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/**
 * 상단 띠: [이전] [매장 이름] [모드 전환]. 버튼이 없어도 높이는 같다 (디자인 명세 2-2).
 * 모드 전환은 결제 중·주문번호 화면에서 숨긴다 (kiosk-flow v1.2)
 */
export function TopBar({ onBack }: { onBack?: () => void }) {
  const { state, catalog, commands } = useKioskContext();
  const easy = state.mode === 'easy';
  return (
    <header className="topbar">
      <div className="left">
        {onBack && <button className="btn" onClick={onBack}><Icon.back />{TEXT.common.back}</button>}
      </div>
      <div className="store">{catalog.menu?.storeName ?? TEXT.common.appName}</div>
      <div className="right">
        {canToggleMode(state) && (
          <button className={easy ? 'btn mode-toggle' : 'btn mode-toggle to-easy'} onClick={commands.toggleMode}>
            {easy ? TEXT.common.toNormal : TEXT.common.toEasy}
          </button>
        )}
      </div>
    </header>
  );
}

/** 여러 줄 문구 (copy.ts 의 배열). 줄 사이에 <br> */
export function Lines({ lines }: { lines: readonly string[] }) {
  return lines.map((line, i) => (
    <Fragment key={i}>{i > 0 && <br />}{line}{i < lines.length - 1 && ' '}</Fragment>
  ));
}

/** 메뉴 사진. 없거나 깨지면 카테고리 색 카드 + 메뉴 이름 첫 글자 (D40, 디자인 명세 2-4) */
export function Thumb({ item, categories }: { item: MenuItem; categories: Category[] }) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (item.imageUrl && item.imageUrl !== brokenUrl) {
    return <img className="thumb" src={item.imageUrl} alt="" onError={() => setBrokenUrl(item.imageUrl)} draggable={false} />;
  }
  const idx = Math.max(0, categories.toSorted((a, b) => a.sortOrder - b.sortOrder).findIndex(c => c.id === item.categoryId));
  return <div className="thumb" data-card={(idx % CARD_COUNT) + 1} aria-hidden>{item.name.slice(0, 1)}</div>;
}

/** 알림 (메뉴판 위, 추천 실패 등) */
export function Notice({ lines, actionLabel, onAction }: { lines: readonly string[]; actionLabel: string; onAction: () => void }) {
  return (
    <div className="notice" role="alert">
      <Icon.alert />
      <p><Lines lines={lines} /></p>
      <button className="btn" onClick={onAction}>{actionLabel}</button>
    </div>
  );
}
