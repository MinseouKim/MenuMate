import { Fragment, useLayoutEffect, useState, type ReactNode } from 'react';
import type { Category, MenuItem } from '../api/contracts';
import { TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';
import { canToggleMode } from '../kiosk/reducer';
import type { Mode } from '../kiosk/types';

const W = 1080;
const H = 1920;
const TINT_COUNT = 6; // tokens.css 의 --tint-1 ~ --tint-6

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

/** 판정 후 화면 상단: 이전 버튼, 매장 이름, 모드 전환 버튼 (결제 중·주문번호 화면은 모드 전환 없음, v1.2) */
export function TopBar({ onBack }: { onBack?: () => void }) {
  const { state, catalog, commands } = useKioskContext();
  return (
    <header className="topbar">
      {onBack && <button className="btn" onClick={onBack}><ChevronLeft />{TEXT.common.back}</button>}
      <span className="store">{catalog.menu?.storeName ?? TEXT.common.appName}</span>
      <span className="spacer" />
      {canToggleMode(state) && (
        <button className="btn" onClick={commands.toggleMode}>
          {state.mode === 'easy' ? TEXT.common.toNormal : TEXT.common.toEasy}
        </button>
      )}
    </header>
  );
}

/**
 * 55+ 빛 테두리 (D78): 큰 글씨 화면에서 지금 눌러야 할 버튼 1~2개에만 붙인다.
 * 주기·밝기는 tokens.css (--glow-*), "동작 줄이기" 설정이면 global.css 에서 멈춘다
 */
export const glowIf = (on: boolean) => (on ? ' glow' : '');

/** 여러 줄 문구 (copy.ts 의 배열). 줄 사이에 <br> */
export function Lines({ lines }: { lines: readonly string[] }) {
  return lines.map((line, i) => (
    <Fragment key={i}>{i > 0 && <br />}{line}{i < lines.length - 1 && ' '}</Fragment>
  ));
}

/** 사진이 없거나 깨지면 카테고리 색 카드 + 메뉴명 (D40). 색은 카테고리 순서대로 --tint-n */
export function MenuThumb({ item, categories }: { item: MenuItem; categories: Category[] }) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (item.imageUrl && item.imageUrl !== brokenUrl) {
    return <img className="thumb" src={item.imageUrl} alt="" onError={() => setBrokenUrl(item.imageUrl)} draggable={false} />;
  }
  const idx = Math.max(0, categories.toSorted((a, b) => a.sortOrder - b.sortOrder).findIndex(c => c.id === item.categoryId));
  return <div className="thumb" data-tint={(idx % TINT_COUNT) + 1}>{item.name}</div>;
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

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12.5 9.5 18 20 6" />
  </svg>
);

export const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** 질문 답 기호 (U2: 색이 아니라 기호로 구분) */
export const YesIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.6"><circle cx="12" cy="12" r="8.5" /></svg>
);

export const NoIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
    <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" />
  </svg>
);

/** 매장/포장 그림 (U2) */
export const BowlIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 11h19a9.5 9.5 0 0 1-19 0z" /><path d="M8 21h8M9 2.5c-1 1.5 1 2.5 0 4.5M15 2.5c-1 1.5 1 2.5 0 4.5" />
  </svg>
);

export const BagIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 8h15l-1 13h-13z" /><path d="M8.5 11V6a3.5 3.5 0 0 1 7 0v5" />
  </svg>
);
