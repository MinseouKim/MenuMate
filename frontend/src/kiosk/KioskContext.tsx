// 화면 컴포넌트는 이 context 로만 상태와 명령을 받는다. useKiosk 내부(리듀서, API, AI)가 바뀌어도 화면은 그대로다.
import { createContext, use, type ReactNode, type RefObject } from 'react';
import { useKiosk, type KioskController } from './useKiosk';

const KioskContext = createContext<KioskController | null>(null);

export function KioskProvider({ videoRef, children }: { videoRef: RefObject<HTMLVideoElement | null>; children: ReactNode }) {
  const kiosk = useKiosk(videoRef);
  return <KioskContext value={kiosk}>{children}</KioskContext>;
}

export function useKioskContext(): KioskController {
  const kiosk = use(KioskContext);
  if (!kiosk) throw new Error('KioskProvider 안에서만 쓸 수 있습니다');
  return kiosk;
}
