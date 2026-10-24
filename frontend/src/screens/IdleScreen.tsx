import { CAMERA_NOTICE } from '../kiosk/copy';
import type { KioskController } from '../kiosk/useKiosk';

/** 대기: 카메라 앞에 서면 인식 시작, 화면을 누르면 카메라 없이 일반 메뉴판 (D20, D46) */
export function IdleScreen({ k }: { k: KioskController }) {
  const down = k.serverDown;
  return (
    <div className="screen idle" onClick={down ? undefined : k.commands.touchStart}>
      <div className="signboard">
        <div className="wordmark">MenuMate</div>
        <p className={down ? 'greeting small' : 'greeting'}>{down ? <>잠시 후{' '}<br />이용해 주세요</> : <>어서{' '}<br />오세요</>}</p>
      </div>
      <div className="body">
        {down ? (
          <p className="lead" role="status">주문 준비를 하고 있어요</p>
        ) : (
          <>
            <p className="lead">화면 앞에 서 계시면 보기 편한 화면으로 바꿔 드려요</p>
            <div className="spacer" />
            <button className="btn btn-primary btn-lg btn-block">눌러서 주문 시작</button>
          </>
        )}
      </div>
      <div className="camera-notice">{CAMERA_NOTICE}</div>
    </div>
  );
}
