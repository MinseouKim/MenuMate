// 모든 화면에 공통인 틀: 머리(로고·보기 설정), 진행 단계, 담은 메뉴 막대, 아래 이동 버튼.
import { useState } from 'react';
import { lineKey, lineName } from '../cart';
import type { Kiosk } from '../useKiosk';
import { money, type Mode, type Screen } from '../types';
import { CameraIcon, Meander } from './art';

/** 로고·보기 설정 막대. 시작 화면에서는 아래(bottom)에 더 크게 놓이고 아래 이동 버튼 대신 직원 호출도 품습니다. */
export function Header({ kiosk, bottom = false }: { kiosk: Kiosk; bottom?: boolean }) {
  const { state, camera, act } = kiosk;
  const { prefs } = state;
  const watching = camera.state === 'on' || camera.state === 'starting';
  // 메뉴판에서는 보기 설정이 아래 '화면 설정' 버튼 안으로 들어가므로 머리에는 로고와 카메라 표시만 둡니다.
  const toolsInFooter = state.screen === 'menu';
  const bar = (
    <header className={`kx-head${bottom ? ' kx-head-bottom' : ''}`}>
      <a className="kx-brand" href="#" onClick={e => { e.preventDefault(); if (state.cart.length) act.open({ kind: 'home' }); else act.reset(); }}>menumate</a>
      <div className="kx-tools">
        {watching && (
          <span className="kx-camera-live" role="status" aria-label="카메라 작동 중" title="화면 설정을 맞추려고 얼굴 나이대만 추정해요. 영상은 저장하거나 화면에 보여 주지 않아요.">
            <CameraIcon /><i aria-hidden="true" /><span className="label">카메라 작동 중</span>
          </span>
        )}
        {!toolsInFooter && <>
          <button className="kx-tool" aria-pressed={prefs.large} onClick={() => act.togglePref('large')}>{prefs.large ? '기본 글씨' : '글자 크게'}</button>
          {/* 아래 막대는 번잡하지 않게 세 개만 둡니다. 음성 안내는 '화면 설정' 안에서 켭니다. */}
          {!bottom && <button className="kx-tool" aria-pressed={prefs.voice} onClick={() => act.togglePref('voice')}>음성 안내 {prefs.voice ? '켜짐' : '꺼짐'}</button>}
          <button className="kx-tool" onClick={() => act.open({ kind: 'settings' })}>화면 설정</button>
        </>}
        {bottom && <button className="kx-tool" onClick={() => act.open({ kind: 'help' })}>직원 호출</button>}
      </div>
    </header>
  );
  const note = state.faceNote && (
    <div className="kx-face-note" role="status">
      <CameraIcon /><span>보기 편하도록 큰 글씨와 음성 안내를 켰어요.</span>
      <button className="kx-btn kx-btn-ghost" onClick={act.undoFace}>원래대로</button>
    </div>
  );
  return bottom ? <>{note}<Meander />{bar}</> : <>{bar}<Meander />{note}</>;
}

// 진행 단계: 직접 주문과 말로 추천은 거치는 화면이 달라서 단계를 따로 보여 줍니다.
function steps(mode: Mode, screen: Screen): { labels: string[]; current: number } {
  if (mode === 'recommend') {
    const at: Partial<Record<Screen, number>> = { notice: 0, input: 0, review: 1, results: 1, menu: 1, payment: 2, done: 3 };
    return { labels: ['말로 요청', '추천 확인', '결제', '완료'], current: at[screen] ?? 0 };
  }
  const at: Partial<Record<Screen, number>> = { menu: 0, input: 0, payment: 1, done: 2 };
  return { labels: ['메뉴 선택', '결제', '완료'], current: at[screen] ?? 0 };
}

export function Progress({ mode, screen }: { mode: Mode; screen: Screen }) {
  const { labels, current } = steps(mode, screen);
  return (
    <ol className="kx-progress" aria-label="주문 진행 단계">
      {labels.map((text, i) => (
        <li key={text} className={i === current ? 'current' : i < current ? 'passed' : ''} aria-current={i === current ? 'step' : undefined}>
          <b>{`0${i + 1}`}</b>{text}
        </li>
      ))}
    </ol>
  );
}

export function Footer({ kiosk }: { kiosk: Kiosk }) {
  const { state, act } = kiosk;
  const { screen } = state;
  return (
    <footer className="kx-foot">
      <button className="kx-btn kx-btn-ghost" onClick={() => { if (screen === 'done') act.reset(); else if (screen !== 'welcome') act.open({ kind: 'home' }); }}>처음으로</button>
      {/* 메뉴판에서는 '이전 화면'(= 처음으로) 대신 '화면 설정'(글자 크게·음성 안내·고대비·낮은 화면)을 둡니다. */}
      {screen === 'menu'
        ? <button className="kx-btn kx-btn-ghost" onClick={() => act.open({ kind: 'settings' })}>화면 설정</button>
        : <button className="kx-btn kx-btn-ghost" disabled={screen === 'welcome' || screen === 'done'} onClick={act.back}>이전 화면</button>}
      <button className="kx-btn kx-btn-ghost" onClick={() => act.open({ kind: 'help' })}>직원 호출 · 도움</button>
    </footer>
  );
}

/** 담은 메뉴 막대. 접어 두면 개수와 금액만, 펼치면 줄마다 수량을 바꾸거나 지울 수 있습니다. */
export function Dock({ kiosk }: { kiosk: Kiosk }) {
  const { state, catalog, total, count, act } = kiosk;
  const [open, setOpen] = useState(false);
  return (
    <section className="kx-dock" aria-label="담은 메뉴">
      {state.message && state.screen === 'menu' && <div className="kx-toast" role="status">{state.message}</div>}
      {open && (
        <ul className="kx-dock-list">
          {state.cart.length === 0 && <li className="kx-empty">메뉴 카드를 눌러 주문에 추가해 주세요.</li>}
          {state.cart.map(line => {
            const menu = catalog.get(line.id);
            const key = lineKey(line);
            const name = lineName(menu.name, line);
            return (
              <li key={key}>
                <span className="name"><strong>{name}</strong><small>{money(menu.price)}{menu.quantityUnit ? ` / ${menu.quantityUnit}` : ''}</small></span>
                <span className="qty">
                  <button className="kx-step" disabled={line.quantity === 1} aria-label={`${name} 수량 줄이기`} onClick={() => act.changeQuantity(key, -1)}>−</button>
                  <output aria-label={`${name} 수량`}>{line.quantity}</output>
                  <button className="kx-step" aria-label={`${name} 수량 늘리기`} onClick={() => act.changeQuantity(key, 1)}>+</button>
                </span>
                <strong className="sum">{money(menu.price * line.quantity)}</strong>
                <button className="kx-btn kx-btn-quiet" aria-label={`${name} 삭제`} onClick={() => act.removeLine(key)}>삭제</button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="kx-dock-bar">
        <button className="kx-dock-sum" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span>담은 메뉴 {count}개</span>
          <strong>{money(total)}</strong>
          <small>{open ? '목록 접기' : '목록 보기 · 수량 바꾸기'}</small>
        </button>
        <button className="kx-btn kx-btn-ghost" disabled={!count} onClick={act.clearCart}>비우기</button>
        <button className="kx-btn kx-btn-primary kx-order" disabled={!count} onClick={act.checkout}>주문하기</button>
      </div>
    </section>
  );
}
