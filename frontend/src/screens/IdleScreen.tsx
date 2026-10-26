import { Lines } from '../components/common';
import { CAMERA_NOTICE, TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 대기: 카메라 앞에 서면 인식 시작, 화면을 누르면 카메라 없이 일반 메뉴판 (D20, D46) */
export function IdleScreen() {
  const k = useKioskContext();
  const down = k.serverDown;
  return (
    <div className="screen idle" onClick={down ? undefined : k.commands.touchStart}>
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
            <button className="btn btn-primary btn-lg btn-block">{TEXT.idle.start}</button>
          </>
        )}
      </div>
      <div className="camera-notice">{CAMERA_NOTICE}</div>
    </div>
  );
}
