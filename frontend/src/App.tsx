import { useRef } from 'react';
import { KioskFrame } from './components/common';
import { useKiosk } from './kiosk/useKiosk';
import { CartScreen } from './screens/CartScreen';
import { DetectingScreen } from './screens/DetectingScreen';
import { IdleScreen } from './screens/IdleScreen';
import { MenuScreen } from './screens/MenuScreen';
import { OrderTypeScreen } from './screens/OrderTypeScreen';
import { DoneScreen, PayFailedScreen, PayingScreen } from './screens/PayScreens';
import { RecommendScreen } from './screens/RecommendScreen';
import { SurveyScreen } from './screens/SurveyScreen';

export function App() {
  // 카메라 영상은 화면에 보이지 않는 video 요소로만 받는다. 프레임은 AI 모듈 안에서만 쓰고 저장하지 않는다 (D2)
  const videoRef = useRef<HTMLVideoElement>(null);
  const k = useKiosk(videoRef);

  const screen = (() => {
    switch (k.state.screen) {
      case 'idle': return <IdleScreen k={k} />;
      case 'detecting': return <DetectingScreen k={k} />;
      case 'survey': return <SurveyScreen k={k} />;
      case 'recommend': return <RecommendScreen k={k} />;
      case 'menu': return <MenuScreen k={k} />;
      case 'order_type': return <OrderTypeScreen k={k} />;
      case 'cart': return <CartScreen k={k} />;
      case 'paying': return <PayingScreen k={k} />;
      case 'pay_failed': return <PayFailedScreen k={k} />;
      case 'done': return <DoneScreen k={k} />;
    }
  })();

  return (
    <KioskFrame mode={k.state.mode}>
      <video ref={videoRef} className="camera" muted playsInline aria-hidden />
      {screen}
    </KioskFrame>
  );
}
