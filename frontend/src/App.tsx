import { useEffect, useState } from 'react';
import KioskNext from './kiosk-next/KioskNext';
import { ReceiptPage } from './prototype/ReceiptPage';
import { StatsPage } from './prototype/StatsPage';

// 주소의 # 뒤로 화면을 고릅니다: #/receipt/<코드>·#2~<코드> 휴대폰 영수증, #/stats 운영자 통계, 그 밖은 키오스크.
// 키오스크는 2026-11-01부터 새 구조(kiosk-next)를 씁니다. 옛 화면(prototype/KioskApp)은 데이터·추천 엔진 재사용을 위해 남겨 두었습니다.
export default function App() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => { const on = () => setHash(location.hash); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  const receipt = hash.match(/^#\/receipt\/([\w.~-]+)/) ?? hash.match(/^#(2~[\w.~-]+)/);
  if (receipt) return <ReceiptPage code={receipt[1]}/>;
  if (hash.startsWith('#/stats')) return <StatsPage/>;
  return <KioskNext/>;
}
