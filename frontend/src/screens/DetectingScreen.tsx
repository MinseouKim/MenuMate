import { CAMERA_NOTICE, TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 인식 중: 확정 전까지 보여 준다. 누르면 바로 일반 메뉴판 */
export function DetectingScreen() {
  const k = useKioskContext();
  const p = k.detectProgress;
  return (
    <div className="screen idle" onClick={k.commands.touchStart}>
      <div className="body center">
        <div className="ring" aria-hidden />
        <p className="hero">{TEXT.detecting.title}</p>
        <p className="lead">{TEXT.detecting.detail}</p>
        {p && (
          <div className="dots" aria-hidden>
            {Array.from({ length: p.required }, (_, i) => <i key={i} className={i < p.run ? 'on' : ''} />)}
          </div>
        )}
        <p className="mute">{TEXT.detecting.skip}</p>
      </div>
      <div className="camera-notice">{CAMERA_NOTICE}</div>
    </div>
  );
}
