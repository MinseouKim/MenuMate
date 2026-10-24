import { CAMERA_NOTICE } from '../kiosk/copy';
import type { KioskController } from '../kiosk/useKiosk';

/** 대기: 카메라 앞에 서면 인식 시작, 화면을 누르면 카메라 없이 일반 메뉴판 (D20, D46) */
export function IdleScreen({ k }: { k: KioskController }) {
  const down = k.serverDown;
  return (
    <div className="screen idle" onClick={down ? undefined : k.commands.touchStart}>
      <div className="body center">
        <div className="logo">MenuMate</div>
        {down ? (
          <>
            <p className="hero">잠시 후 이용해 주세요</p>
            <p className="title mute">주문 준비 중이에요</p>
          </>
        ) : (
          <>
            <p className="hero">어서 오세요</p>
            <p className="title mute">화면 앞에 서 주세요</p>
            <div className="spacer" style={{ flex: 'none', height: 80 }} />
            <button className="btn btn-primary btn-lg" style={{ minWidth: 560 }}>눌러서 주문 시작</button>
          </>
        )}
      </div>
      <div className="camera-notice">{CAMERA_NOTICE}</div>
    </div>
  );
}
