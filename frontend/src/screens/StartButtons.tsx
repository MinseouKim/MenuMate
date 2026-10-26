import { TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';

/** 대기·인식 중 화면의 시작 버튼 두 개. 화면의 다른 곳을 눌러도 시작하지 않는다 (kiosk-flow v1.2) */
export function StartButtons() {
  const { commands: c } = useKioskContext();
  return (
    <>
      <button className="btn btn-primary btn-lg btn-block" onClick={c.startEasy}>{TEXT.idle.startEasy}</button>
      <button className="btn btn-lg btn-block" onClick={c.startNormal}>{TEXT.idle.startNormal}</button>
    </>
  );
}
