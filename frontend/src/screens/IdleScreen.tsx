import { Icon } from '../components/icons';
import { Lines } from '../components/common';
import { TEXT } from '../kiosk/copy';
import { useKioskContext } from '../kiosk/KioskContext';
import { CameraNotice, StartButtons } from './StartButtons';

/** 대기와 인식 중은 같은 배치. 가운데 안내 두 줄만 바뀐다 (디자인 명세 2-14) */
function Welcome({ detecting }: { detecting: boolean }) {
  const { catalog, serverDown } = useKioskContext();
  const store = catalog.menu?.storeName ?? TEXT.common.appName;
  return (
    <div className="screen idle">
      <div className="body">
        <p className="t-h2">{store}</p>
        {serverDown && !detecting ? (
          <>
            <p className="greet down"><Lines lines={TEXT.idle.downTitle} /></p>
            <p className="t-body down-body" role="status">{TEXT.idle.downBody}</p>
          </>
        ) : (
          <>
            <p className="greet"><Lines lines={TEXT.idle.greeting} /></p>
            <p className="t-h2 guide"><Lines lines={detecting ? TEXT.detecting.guide : TEXT.idle.guide} /></p>
            {/* 인식 중에는 자리를 지킨 채 숨긴다 (레이아웃이 움직이지 않게) */}
            <div className={detecting ? 'camera-hint is-hidden' : 'camera-hint'} aria-hidden={detecting}>
              <Icon.up /><p className="t-body">{TEXT.idle.cameraHint}</p>
            </div>
            <div className="spacer" />
            <StartButtons />
          </>
        )}
      </div>
      <CameraNotice />
    </div>
  );
}

export function IdleScreen() {
  return <Welcome detecting={false} />;
}

export function DetectingScreen() {
  return <Welcome detecting />;
}
