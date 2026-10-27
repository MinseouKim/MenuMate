import { Lines } from '../components/common';
import { CAMERA_NOTICE, TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';
import { StartButtons } from './StartButtons';

/** 대기: 카메라 앞에 서면 인식 시작. 카메라 없이 시작하는 버튼 두 개 (D20, D46, v1.2) */
export function IdleScreen() {
  const k = useKioskContext();
  const down = k.serverDown;
  return (
    <div className="screen idle">
      <div className="signboard">
        <div className="wordmark">{TEXT.common.appName}</div>
        <p className={down ? 'greeting small' : 'greeting'}><Lines lines={down ? TEXT.idle.serverDown : TEXT.idle.greeting} /></p>
      </div>
      <div className="body">
        {down ? (
          <p className="lead" role="status">{TEXT.idle.serverDownDetail}</p>
        ) : (
          <>
            <p className="lead">{TEXT.idle.guide}</p>
            <div className="spacer" />
            <StartButtons />
          </>
        )}
      </div>
      <div className="camera-notice">{CAMERA_NOTICE}</div>
    </div>
  );
}
