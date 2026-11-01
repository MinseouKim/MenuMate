// 화면 위에 뜨는 팝업들. 어떤 팝업인지는 state.dialog.kind 하나로 정해집니다.
import { useEffect, useState } from 'react';
import { IDLE_GRACE_MS, type Kiosk } from '../useKiosk';
import { lineKey, lineName } from '../cart';
import { money, type Dialog } from '../types';
import { CameraIcon } from './art';
import { Modal } from './Modal';
import { Photo } from './Photo';
import { ReviewItem } from '../../prototype/ReviewItem';
import { REVIEWS_UPDATED } from '../../prototype/menuReviews';

function titleOf(d: Dialog): string {
  switch (d.kind) {
    case 'info': return d.menu.name;
    case 'home': return '처음으로 돌아갈까요?';
    case 'spoken': return '이 메뉴를 담을까요?';
    case 'idle': return '아직 계세요?';
    case 'option': return `${d.menu.name} 옵션을 골라 주세요`;
    case 'settings': return '화면 설정';
    case 'confirm': return '담은 메뉴를 확인해 주세요';
    case 'help': return '도움이 필요하세요?';
  }
}

export function Dialogs({ kiosk }: { kiosk: Kiosk }) {
  const { state, act } = kiosk;
  const dialog = state.dialog;
  if (!dialog) return null;
  const title = titleOf(dialog);
  const aside = dialog.kind === 'info' ? <span className="kx-price">{money(dialog.menu.price)}</span> : undefined;

  // 반응 없음 안내는 닫기 버튼 대신 '계속 주문하기'가 그 역할을 하므로 머리의 닫기를 숨깁니다.
  const idle = dialog.kind === 'idle';
  return (
    <Modal title={title} aside={aside} onClose={act.close} hideClose={idle} className={idle ? 'kx-modal-idle' : ''}>
      {dialog.kind === 'info' && <MenuInfo kiosk={kiosk} dialog={dialog} />}

      {dialog.kind === 'home' && (
        <><p>담은 메뉴와 입력한 요청이 모두 지워집니다.</p><button className="kx-btn kx-btn-primary" onClick={() => act.reset()}>초기화하기</button></>
      )}

      {dialog.kind === 'spoken' && (
        <>
          <p>{dialog.menu.name} {dialog.quantity}개 · {money(dialog.menu.price * dialog.quantity)}</p>
          <button className="kx-btn kx-btn-primary" onClick={() => act.confirmSpoken(dialog.menu, dialog.quantity)}>확인하고 담기</button>
          <button className="kx-btn kx-btn-ghost" onClick={act.close}>다시 말할게요</button>
        </>
      )}

      {dialog.kind === 'idle' && <IdleNotice kiosk={kiosk} />}

      {dialog.kind === 'confirm' && <ConfirmCart kiosk={kiosk} />}

      {dialog.kind === 'option' && (
        <>
          <p>{dialog.quantity}개 · {money(dialog.menu.price * dialog.quantity)}</p>
          <div className="kx-option-list">
            {dialog.menu.options!.map(op => (
              <button key={op} className="kx-btn kx-btn-primary" onClick={() => act.chooseOption(dialog.menu, dialog.quantity, op)}>{op}</button>
            ))}
          </div>
        </>
      )}

      {dialog.kind === 'settings' && (
        <div className="kx-settings">
          {([['글자 크게', 'large'], ['음성 안내', 'voice'], ['고대비 화면', 'contrast'], ['낮은 화면 (휠체어·어린이)', 'low']] as const).map(([label, name]) => (
            <button key={name} className="kx-setting" aria-pressed={state.prefs[name]} onClick={() => act.togglePref(name)}>
              <span>{label}</span><b>{state.prefs[name] ? '켜짐' : '꺼짐'}</b>
            </button>
          ))}
          <p className="kx-camera-status">
            <CameraIcon />
            {kiosk.camera.state === 'error' ? `카메라 화면 맞춤을 쓸 수 없어요. ${kiosk.camera.error}`
              : kiosk.camera.state === 'off' ? '카메라 화면 맞춤: 이번 손님은 이미 맞췄어요(처음 화면에서 다시 켜져요).'
              : '카메라 화면 맞춤: 작동 중이에요. 영상은 저장하지 않아요.'}
          </p>
          <button className="kx-btn kx-btn-primary" onClick={act.close}>확인</button>
        </div>
      )}

      {dialog.kind === 'help' && (state.staffCalled
        ? <><p className="kx-alert">키오스크에서 호출 알림음을 울렸어요. 가까운 직원이 오지 않으면 손을 들어 알려 주세요.</p><button className="kx-btn kx-btn-primary" onClick={act.close}>확인</button></>
        : <><p>메뉴 카드를 누르면 주문에 담겨요. 설명 아이콘(ⓘ)은 메뉴 설명을 열고, 아래 목록에서 개수를 바꾸거나 지울 수 있어요.</p><button className="kx-btn kx-btn-primary" onClick={act.callStaff}>직원 호출하기</button></>)}
    </Modal>
  );
}

/** 결제 직전 확인: 담은 메뉴를 줄마다 이름·수량·금액으로 보여 주고, 합계 아래에서 결제로 가거나 돌아가 더 담습니다. */
function ConfirmCart({ kiosk }: { kiosk: Kiosk }) {
  const { state, catalog, total, count, act } = kiosk;
  return (
    <div className="kx-confirm">
      <ul className="kx-confirm-list" aria-label="담은 메뉴">
        {state.cart.map(line => {
          const menu = catalog.get(line.id);
          return (
            <li key={lineKey(line)}>
              <span className="name">{lineName(menu.name, line)}</span>
              <span className="qty">{line.quantity}개</span>
              <span className="sum">{money(menu.price * line.quantity)}</span>
            </li>
          );
        })}
      </ul>
      <div className="kx-confirm-total"><span>총 {count}개</span><strong>{money(total)}</strong></div>
      <button className="kx-btn kx-btn-primary" onClick={() => { act.close(); act.go('payment'); }} autoFocus>이대로 결제하기</button>
      <button className="kx-btn kx-btn-ghost" onClick={act.close}>더 담을게요</button>
    </div>
  );
}

const IDLE_SECONDS = IDLE_GRACE_MS / 1000;

/** 반응 없음 안내: 남은 초를 20, 19, 18… 으로 세어 내려가며 금색 고리가 줄어듭니다. 실제 되돌리기는 useKiosk 의 타이머가 맡습니다. */
function IdleNotice({ kiosk }: { kiosk: Kiosk }) {
  const { act } = kiosk;
  const [left, setLeft] = useState(IDLE_SECONDS);
  useEffect(() => {
    const t = setInterval(() => setLeft(n => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const R = 54, C = 2 * Math.PI * R;
  return (
    <div className="kx-idle">
      <div className="kx-idle-ring" role="timer" aria-live="polite" aria-label={`${left}초 뒤 처음 화면으로 돌아가요`}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={R} className="track" />
          <circle cx="60" cy="60" r={R} className="bar" strokeDasharray={C} strokeDashoffset={C * (1 - left / IDLE_SECONDS)} />
        </svg>
        <strong>{left}</strong>
      </div>
      <p className="kx-idle-text">{left}초 뒤 처음 화면으로 돌아가요.<br /><span className="kx-muted">담은 메뉴는 지워져요.</span></p>
      <div className="kx-idle-actions">
        <button className="kx-btn kx-btn-primary" onClick={act.close} autoFocus>계속 주문하기</button>
        <button className="kx-btn kx-btn-ghost" onClick={() => act.reset('welcome', true)}>처음으로</button>
      </div>
    </div>
  );
}

function MenuInfo({ kiosk, dialog }: { kiosk: Kiosk; dialog: Extract<Dialog, { kind: 'info' }> }) {
  const { state, catalog, act } = kiosk;
  const { menu } = dialog;
  const photo = catalog.photo(menu.id);
  const reviews = catalog.reviews(menu.id);
  const tab = reviews ? dialog.tab : 'info';
  const show = (t: 'info' | 'reviews') => act.open({ ...dialog, tab: t });
  return (
    <>
      {photo && !(tab === 'reviews' && reviews) && <Photo className="kx-info-photo" src={photo} focus={catalog.focus(menu.id)} />}
      {reviews && (
        <div className="kx-tabs" role="tablist" aria-label="메뉴 정보">
          <button role="tab" id="kx-tab-info" aria-selected={tab === 'info'} aria-controls="kx-info-panel" onClick={() => show('info')}>메뉴 설명</button>
          <button role="tab" id="kx-tab-reviews" aria-selected={tab === 'reviews'} aria-controls="kx-info-panel" onClick={() => show('reviews')}>메뉴 리뷰</button>
        </div>
      )}
      <div id="kx-info-panel" role={reviews ? 'tabpanel' : undefined} aria-labelledby={reviews ? `kx-tab-${tab}` : undefined}>
        {tab === 'reviews' && reviews ? (
          <section className="kx-reviews">
            <div className="kx-review-summary">
              <span>{REVIEWS_UPDATED} 업데이트</span>
              {!!reviews.keywords.length && <span className="kx-keywords">{reviews.keywords.map(k => <span key={k}>{k}</span>)}</span>}
            </div>
            <ul>{reviews.reviews.map(r => <ReviewItem key={r.quote} review={r} />)}</ul>
            <p className="kx-muted">저희 식당을 이용하신 고객님들이 남겨주신 리뷰입니다.</p>
          </section>
        ) : (
          <>
            <p>{menu.description || [...menu.flavor, ...menu.texture].join(' · ') || '메뉴 설명이 아직 없습니다.'}</p>
            <p className="kx-muted">알레르기 재료는 직원에게 확인해 주세요.</p>
          </>
        )}
      </div>
      {state.screen === 'menu' && (menu.soldOut
        ? <p className="kx-alert">오늘 품절된 메뉴예요.</p>
        : <button className="kx-btn kx-btn-primary" onClick={() => act.pick(menu)}>이 메뉴 담기</button>)}
    </>
  );
}
