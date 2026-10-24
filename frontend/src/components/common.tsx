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
      {onBack && <button className="btn" onClick={onBack}><ChevronLeft />이전</button>}
      <span className="store">{storeName ?? 'MenuMate'}</span>
      <span className="spacer" />
      {mode && (
        <button className="btn" onClick={onToggleMode}>
          {mode === 'easy' ? '일반 화면으로 보기' : '쉬운 화면으로 보기'}
        </button>
      )}
    </header>
  );
}

// 사진이 없을 때 카테고리 색 카드 (D40). 오방색을 옅게 한 색을 카테고리 순서대로 쓴다 (이름을 코드에 박지 않음)
const CARD_COLORS = ['#cddcf2', '#f5d0cd', '#f8e4a6', '#d3e8d6', '#e2e2dc', '#e4d6ee'];

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
      <button className="btn" onClick={onAction}>{actionLabel}</button>
    </div>
  );
}

// 아이콘은 인라인 SVG로 둔다 (아이콘 폰트·CDN 없음, D32)
export const ChevronLeft = () => (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>
);

export const ChatIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
    <path d="M4 5h16v11H9l-5 4z" />
  </svg>
);
