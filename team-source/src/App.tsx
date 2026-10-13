import { useEffect, useState } from 'react';
import KioskApp from './prototype/KioskApp';
import { ReceiptPage } from './prototype/ReceiptPage';
import { StatsPage } from './prototype/StatsPage';

// 주소의 # 뒤로 화면을 고릅니다: #/receipt/<코드> 휴대폰 영수증, #/stats 운영자 통계, 그 밖은 키오스크.
export default function App() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => { const on = () => setHash(location.hash); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  const receipt = hash.match(/^#\/receipt\/([\w-]+)/);
  if (receipt) return <ReceiptPage code={receipt[1]}/>;
  if (hash.startsWith('#/stats')) return <StatsPage/>;
  return <KioskApp/>;
}
