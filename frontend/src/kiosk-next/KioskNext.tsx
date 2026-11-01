// 중식당 "원탁" 키오스크(새 구조). 화면은 useKiosk 가 주는 state 를 그리기만 합니다.
import { useEffect, useRef } from 'react';
import { AgeLogPanel } from '../prototype/AgeLogPanel';
import { Done } from './screens/Done';
import { MenuScreen } from './screens/Menu';
import { Payment } from './screens/Payment';
import { Input, Notice, Results, Review } from './screens/Recommend';
import { Welcome } from './screens/Welcome';
import { Dialogs } from './ui/Dialogs';
import { Dock, Footer, Header, Progress } from './ui/Frame';
import { useKiosk, type KioskDeps } from './useKiosk';
import './kiosk-next.css';

export default function KioskNext(deps: KioskDeps = {}) {
  const kiosk = useKiosk(deps);
  const { state } = kiosk;
  const { screen, prefs, message } = state;
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { body.current?.scrollTo?.({ top: 0 }); }, [screen]);

  // 메뉴판·추천 중에 뭔가 담았으면 담은 메뉴 막대를 보여 줍니다.
  const showDock = screen !== 'welcome' && screen !== 'done' && screen !== 'payment' && (screen === 'menu' || state.cart.length > 0);
  const flags = [prefs.large && 'large', prefs.contrast && 'contrast', prefs.low && 'low'].filter(Boolean).join(' ');
  // 시작 화면은 사진이 맨 위부터 차고, 로고·설정 막대가 아래에 크게 놓입니다(아래 이동 버튼 없음). 다른 화면은 머리 위·이동 버튼 아래.
  const barBelow = screen === 'welcome';

  return (
    <main className="kx-stage">
      <section className={`kx screen-${screen} ${flags}`}>
        {prefs.low && <div className="kx-low-spacer"><span>낮은 화면 모드예요. 버튼을 아래로 모았어요.</span></div>}
        {!barBelow && <Header kiosk={kiosk} />}
        {screen !== 'welcome' && <Progress mode={state.mode} screen={screen} />}
        <div className="kx-body" ref={body}>
          {screen === 'welcome' && <Welcome kiosk={kiosk} />}
          {screen === 'menu' && <MenuScreen kiosk={kiosk} />}
          {screen === 'notice' && <Notice kiosk={kiosk} />}
          {screen === 'input' && <Input kiosk={kiosk} />}
          {screen === 'review' && <Review kiosk={kiosk} />}
          {screen === 'results' && <Results kiosk={kiosk} />}
          {screen === 'payment' && <Payment kiosk={kiosk} />}
          {screen === 'done' && <Done kiosk={kiosk} />}
        </div>
        {showDock && <Dock kiosk={kiosk} />}
        {barBelow ? <Header kiosk={kiosk} bottom /> : <Footer kiosk={kiosk} />}
        {message && !(showDock && screen === 'menu') && <div className="kx-toast kx-toast-float" role="status">{message}</div>}
        <Dialogs kiosk={kiosk} />
      </section>
      <AgeLogPanel />
    </main>
  );
}
