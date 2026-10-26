// 쉬운/일반 모드에서 CSS로 표현할 수 없는 배치 규칙. 크기·색은 tokens.css 에 있다.
// 두 모드는 같은 컴포넌트와 토큰을 쓰고, 디자이너가 정한 예외 두 곳(메뉴판 배치, 담기 동작)만 다르다 (디자인 명세 4장).
import type { Mode } from '../kiosk/types';

export interface ModeLayout {
  menuRows: boolean;              // 메뉴판을 메뉴 줄(담기 버튼)로 그릴지. false 면 3열 타일
  menuPageSize: number | null;    // 메뉴판 한 쪽의 메뉴 수. null 이면 넘기지 않고 스크롤
  showMenuDescription: boolean;   // 메뉴 타일에 한 줄 설명을 보일지
}

export const MODE_LAYOUT: Record<Mode, ModeLayout> = {
  easy: { menuRows: true, menuPageSize: 4, showMenuDescription: false }, // 고르는 대상 4개 이하 (kiosk-flow 5장)
  normal: { menuRows: false, menuPageSize: null, showMenuDescription: true },
};

export const layoutFor = (mode: Mode | null): ModeLayout => MODE_LAYOUT[mode ?? 'normal'];
