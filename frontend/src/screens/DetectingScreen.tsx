import { CAMERA_NOTICE, TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';
import { StartButtons } from './StartButtons';

/** 인식 중: 확정 전까지 보여 준다. 시작 버튼으로 바로 시작할 수도 있다 */
export function DetectingScreen() {
  const k = useKioskContext();
  const p = k.detectProgress;
  return (
    <div className="screen idle">
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
        <StartButtons />
      </div>
      <div className="camera-notice">{CAMERA_NOTICE}</div>
    </div>
  );
}
