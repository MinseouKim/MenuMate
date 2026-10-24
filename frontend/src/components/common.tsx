import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import type { Category, MenuItem } from '../api/contracts';
import type { Mode } from '../kiosk/types';

const W = 1080;
const H = 1920;

/** 세로 1080x1920 캔버스. 창 크기에 맞게 줄이고 가운데에 둔다 (D25) */
export function KioskFrame({ mode, children }: { mode: Mode | null; children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="viewport">
      <div className="kiosk" data-mode={mode ?? 'normal'} style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/** 판정 후 모든 화면 상단: 이전 버튼, 매장 이름, 모드 전환 버튼 */
export function TopBar({ mode, storeName, onToggleMode, onBack }: {
  mode: Mode | null; storeName?: string; onToggleMode: () => void; onBack?: () => void;
}) {
  return (
    <header className="topbar">
      {onBack && <button className="btn btn-outline" onClick={onBack}>‹ 이전</button>}
      <span className="store">{storeName ?? 'MenuMate'}</span>
      <span className="spacer" />
      {mode && (
        <button className="btn btn-outline" onClick={onToggleMode}>
          {mode === 'easy' ? '일반 화면으로 보기' : '쉬운 화면으로 보기'}
        </button>
      )}
    </header>
  );
}

// 사진이 없을 때 카테고리 색 카드 (D40). 카테고리 순서로 색을 고른다 (이름을 코드에 박지 않음)
const CARD_COLORS = ['#f6d7b0', '#cfe3c4', '#f3c6c0', '#c9dcec', '#e7d3ee', '#efe1a6', '#d6d0c4'];

export function MenuThumb({ item, categories }: { item: MenuItem; categories: Category[] }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [item.imageUrl]);
  if (item.imageUrl && !broken) {
    return <img className="thumb" src={item.imageUrl} alt="" onError={() => setBroken(true)} draggable={false} />;
  }
  const idx = Math.max(0, [...categories].sort((a, b) => a.sortOrder - b.sortOrder).findIndex(c => c.id === item.categoryId));
  return <div className="thumb" style={{ background: CARD_COLORS[idx % CARD_COLORS.length] }}>{item.name}</div>;
}

export function Notice({ message, actionLabel, onAction }: { message: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="notice" role="alert">
      <span>{message}</span>
      <button className="btn btn-outline" onClick={onAction}>{actionLabel}</button>
    </div>
  );
}
