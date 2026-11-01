import { useEffect, useState } from 'react';
import type { Kiosk } from '../useKiosk';
import type { Catalog } from '../catalog';
import { CameraIcon } from '../ui/art';

// 시작 화면을 채우는 사진 다섯 장. 네이버 플레이스에서 받은 고해상도(가로 1400) 중 가로로 긴 사진만 골라 요리 → 딤섬 → 면 순으로 둡니다.
// 세로로 긴 사진(동파육·우육탕면 등)은 위아래가 많이 잘려 시작 화면에는 쓰지 않습니다. 출처: menu/PHOTO_SOURCES.md
const COVER_PHOTOS = ['duck-fish-1', 'seafood-1', 'dimsum-7', 'chicken-4', 'noodle-4'];
const SLIDE_MS = 6000;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 사진이 6초마다 서서히 바뀝니다. 손님이 누르고 있는 동안은 멈추고 떼면 다시 넘어갑니다(접근성 검증 기준 2.a의 제어 수단).
 *  움직임 줄이기를 켠 기기에서는 처음부터 멈춰 둡니다. */
function useSlides(catalog: Catalog) {
  const slides = COVER_PHOTOS.flatMap(id => { const src = catalog.photo(id); return src ? [{ id, src, focus: catalog.focus(id) }] : []; });
  // 지금 사진(at)과 바로 전 사진(prev). 전 사진은 새 사진이 다 나타날 때까지 밑에 그대로 깔려 있어, 바뀌는 동안 바탕색이 비쳐 번쩍이지 않습니다.
  const [pos, setPos] = useState({ at: 0, prev: -1 });
  const { at, prev } = pos;
  const [holding, setHolding] = useState(false);
  const still = holding || reducedMotion();
  useEffect(() => {
    if (still || slides.length < 2) return;
    const t = setInterval(() => setPos(p => ({ at: (p.at + 1) % slides.length, prev: p.at })), SLIDE_MS);
    return () => clearInterval(t);
  }, [still, slides.length]);
  const hold = () => setHolding(true);
  const release = () => setHolding(false);
  const handlers = { onPointerDown: hold, onPointerUp: release, onPointerCancel: release, onPointerLeave: release, onContextMenu: (e: React.SyntheticEvent) => e.preventDefault() };
  // 같은 사진 묶음을 두 겹(흐린 배경·선명한 앞)으로 그릴 수 있게 함수로 돌려줍니다.
  const imgs = () => slides.map((s, i) => <img key={s.id} className={i === at ? 'on' : i === prev ? 'prev' : ''} src={s.src} alt="" aria-hidden="true" draggable={false} style={{ objectPosition: s.focus }} />);
  return { imgs, handlers };
}

/** 시작 화면. 같은 사진을 흐리고 어둡게 화면 전체에 깔고, 그 위 아래쪽에 선명한 사진을 윗선이 번지게 얹습니다.
 *  글은 그 위에 왼쪽 맞춤·넓은 자간으로 올립니다. 위아래가 한 장면으로 이어지게 하는 구성입니다(2026-11-01 확정). */
export function Welcome({ kiosk }: { kiosk: Kiosk }) {
  const { act, camera, catalog } = kiosk;
  const watching = camera.state === 'on' || camera.state === 'starting';
  const { imgs, handlers } = useSlides(catalog);
  return (
    <div className="kx-welcome" {...handlers}>
      <div className="kx-welcome-bg">{imgs()}</div>
      <div className="kx-welcome-fg">{imgs()}</div>
      <div className="kx-welcome-copy">
        <h1>어떻게<br />주문하실 건가요?</h1>
        <p className="sub">주문 방법을 골라 주세요</p>
        <div className="kx-welcome-actions">
          <button className="kx-choice" onClick={() => act.start('order')}>
            <small>직접 고르기</small><strong>메뉴 보고 주문</strong>
          </button>
          <button className="kx-choice alt" onClick={() => act.start('recommend')}>
            <small>고민될 때</small><strong>말로 추천 받아 주문</strong>
          </button>
        </div>
      </div>
      {/* 안내문은 항상 보입니다. 카메라가 판정을 마치고 꺼지거나 아예 없을 때는 첫 문장만 바뀝니다. 출처는 큰 글씨 모드에서만 줄을 바꿉니다(한 줄로 이어 쓰면 뒤가 잘렸습니다). */}
      <p className="kx-camera-notice">
        <CameraIcon />
        <span>
          {watching ? '카메라가 켜져 있어요. ' : '카메라는 화면 맞춤에만 써요. '}
          글자 크기·음성 안내를 맞추려고 얼굴 나이대만 추정하고, 글씨가 작아 불편해 보이면 큰 글씨를 제안해요. 영상은 저장하거나 화면에 보여 주지 않아요.
          <br className="kx-br-large" /> (사진 출처: 우루루 네이버 플레이스)
        </span>
      </p>
    </div>
  );
}
