// 아이콘. 원본은 design/screens/index.html 의 ICON (인라인 SVG, 직각 끝). 아이콘 폰트·이미지 파일 없음 (D32)
import type { ReactNode } from 'react';

// 선 굵기는 모두 2.6: 시안 캡처가 이 굵기로 그려져 있다(시안의 아이콘별 굵기 값은 HTML에서 무시되고 있음, 디자이너에게 알림)
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2.6}
      strokeLinecap="square" strokeLinejoin="miter">
      {children}
    </svg>
  );
}

export const Icon = {
  back: () => <Svg><path d="M15 4 7 12l8 8" /></Svg>,
  speaker: () => (
    <Svg><path d="M3 9h4l6-5v16l-6-5H3z" fill="currentColor" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13" /></Svg>
  ),
  speaking: () => <Svg><path d="M3 9h4l6-5v16l-6-5H3z" fill="currentColor" /><path d="M16 10v4M19 7v10M22 9v6" /></Svg>,
  yes: () => <Svg><circle cx="12" cy="12" r="8.5" /></Svg>,
  no: () => <Svg><path d="M5 5l14 14M19 5 5 19" /></Svg>,
  bowl: () => (
    <Svg><path d="M2.5 11h19a9.5 9.5 0 0 1-19 0z" /><path d="M8 21h8M9 2.5c-1 1.5 1 2.5 0 4.5M15 2.5c-1 1.5 1 2.5 0 4.5" /></Svg>
  ),
  bag: () => <Svg><path d="M4.5 8h15l-1 13h-13z" /><path d="M8.5 11V6a3.5 3.5 0 0 1 7 0v5" /></Svg>,
  card: () => <Svg><rect x="2" y="5" width="20" height="14" /><path d="M2 10h20M5 15h5" /></Svg>,
  camera: () => <Svg><path d="M3 8h4l2-3h6l2 3h4v12H3z" /><circle cx="12" cy="13.5" r="3.5" /></Svg>,
  up: () => <Svg><path d="M12 21V4M5 11l7-7 7 7" /></Svg>,
  check: () => <Svg><path d="M4 12.5 9.5 18 20 6" /></Svg>,
  plus: () => <Svg><path d="M12 4v16M4 12h16" /></Svg>,
  minus: () => <Svg><path d="M4 12h16" /></Svg>,
  chat: () => <Svg><path d="M3 4h18v12H11l-5 4v-4H3z" /></Svg>,
  alert: () => <Svg><circle cx="12" cy="12" r="9.5" /><path d="M12 7v6M12 16.5v.5" /></Svg>,
};
