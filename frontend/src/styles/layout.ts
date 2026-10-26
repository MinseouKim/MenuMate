// 쉬운/일반 모드에서 CSS로 표현할 수 없는 배치 규칙. 크기·색은 tokens.css 에 있다.
// 두 모드는 같은 컴포넌트를 쓰고 이 값과 data-mode 토큰만 다르다 (RULES 4장).
import type { Mode } from '../kiosk/types';

export interface ModeLayout {
  menuTwoStep: boolean;           // 메뉴판을 "종류 고르기 → 메뉴 고르기" 두 단계로 (사용성 점검 U5)
  menuPageSize: number | null;    // 메뉴판 한 화면 메뉴 카드 수. null 이면 넘기지 않고 스크롤
  showMenuDescription: boolean;   // 메뉴 카드에 한 줄 설명을 보일지
}

export const MODE_LAYOUT: Record<Mode, ModeLayout> = {
  easy: { menuTwoStep: true, menuPageSize: 4, showMenuDescription: false }, // 고르는 대상 4개 이하 (kiosk-flow 5장)
  normal: { menuTwoStep: false, menuPageSize: null, showMenuDescription: true },
};

export const layoutFor = (mode: Mode | null): ModeLayout => MODE_LAYOUT[mode ?? 'normal'];
