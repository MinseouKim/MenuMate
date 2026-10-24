import { CAMERA_NOTICE } from '../kiosk/copy';
import type { KioskController } from '../kiosk/useKiosk';

/** 인식 중: 확정 전까지 보여 준다. 누르면 바로 일반 메뉴판 */
export function DetectingScreen({ k }: { k: KioskController }) {
  const p = k.detectProgress;
  return (
    <div className="screen idle" onClick={k.commands.touchStart}>
      <div className="body center">
        <div className="pulse" />
        <p className="hero">반가워요</p>
        <p className="title mute">맞춤 화면을 준비하고 있어요</p>
        {p && (
          <div className="dots" aria-hidden>
            {Array.from({ length: p.required }, (_, i) => <i key={i} className={i < p.run ? 'on' : ''} />)}
          </div>
        )}
        <p className="mute">기다리지 않으려면 화면을 눌러 주세요</p>
      </div>
      <div className="camera-notice">{CAMERA_NOTICE}</div>
    </div>
  );
}
