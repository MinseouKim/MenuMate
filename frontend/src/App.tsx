import { useRef } from 'react';
import { KioskFrame } from './components/common';
import { KioskProvider, useKioskContext } from './kiosk/KioskContext';
import type { Screen } from './kiosk/types';
import { CartScreen } from './screens/CartScreen';
import { DetectingScreen, IdleScreen } from './screens/IdleScreen';
import { MenuScreen } from './screens/MenuScreen';
import { OrderTypeScreen } from './screens/OrderTypeScreen';
import { DoneScreen, PayFailedScreen, PayingScreen } from './screens/PayScreens';
import { RecommendScreen } from './screens/RecommendScreen';
import { SurveyScreen } from './screens/SurveyScreen';

const SCREENS: Record<Screen, () => React.JSX.Element> = {
  idle: IdleScreen,
  detecting: DetectingScreen,
  survey: SurveyScreen,
  recommend: RecommendScreen,
  menu: MenuScreen,
  order_type: OrderTypeScreen,
  cart: CartScreen,
  paying: PayingScreen,
  pay_failed: PayFailedScreen,
  done: DoneScreen,
};

function CurrentScreen() {
  const { state } = useKioskContext();
  const ScreenView = SCREENS[state.screen];
  return <ScreenView />;
}

/** 대기·인식 중은 판정 전이라 항상 큰 글씨 크기로 그린다 (디자인 명세 1-3) */
function Frame({ children }: { children: React.ReactNode }) {
  const { state } = useKioskContext();
  const beforeDecision = state.screen === 'idle' || state.screen === 'detecting';
  return <KioskFrame mode={beforeDecision ? 'easy' : state.mode ?? 'normal'}>{children}</KioskFrame>;
}

export function App() {
  // 카메라 영상은 화면에 보이지 않는 video 요소로만 받는다. 프레임은 AI 모듈 안에서만 쓰고 저장하지 않는다 (D2)
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <KioskProvider videoRef={videoRef}>
      <Frame>
        <video ref={videoRef} className="camera" muted playsInline aria-hidden />
        <CurrentScreen />
      </Frame>
    </KioskProvider>
  );
}
