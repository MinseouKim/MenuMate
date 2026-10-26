import { Icon } from '../components/icons';
import { Lines } from '../components/common';
import { TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 대기·인식 중 화면의 시작 버튼 두 개. 같은 무게, 큰 글씨가 위. 화면의 다른 곳을 눌러도 시작하지 않는다 (kiosk-flow v1.2) */
export function StartButtons() {
  const { commands: c } = useKioskContext();
  return (
    <>
      <p className="t-body t-bold start-choose">{TEXT.idle.choose}</p>
      <div className="stack start-buttons">
        <button className="btn btn-lg btn-block start-big" onClick={c.startEasy}>
          <span className="big-glyph" aria-hidden>{TEXT.idle.startEasyGlyph}</span>{TEXT.idle.startEasy}
        </button>
        <button className="btn btn-lg btn-block" onClick={c.startNormal}>{TEXT.idle.startNormal}</button>
      </div>
    </>
  );
}

/** 하단 카메라 안내. 대기·인식 중에 항상 보인다 (D20) */
export function CameraNotice() {
  return (
    <div className="camera-notice"><Icon.camera /><span><Lines lines={TEXT.common.cameraNotice} /></span></div>
  );
}
