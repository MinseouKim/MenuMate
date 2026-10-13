// 운영자용 사용 통계 화면(#/stats). 이 키오스크 기기에 쌓인 익명 기록만 보여 줍니다.
import { useState } from 'react';
import { summarize, toCsv, usage } from './usage';
import './styles/receipt-page.css';

export function StatsPage() {
  const [list, setList] = useState(usage.all);
  const s = summarize(list);
  const rows: [string, string][] = [
    ['체험 수', `${s.sessions}회`], ['운영자 시연 (통계 제외)', `${s.demos}회`], ['주문 완료', `${s.ordered}회 (${s.orderRate}%)`], ['주문까지 평균 시간', `${s.avgSec}초`],
    ['추천 이용률', `${s.recommendRate}%`], ['음성 인식', `${s.voiceTries}회 시도 · 성공 ${s.voiceRate}%`],
    ['큰 글씨 사용률', `${s.largeRate}%`], ['AI(LLM) 해석 비율', `${s.llmRate}%`],
  ];
  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(list)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `menumate-usage-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return <main className="receipt-page stats-page">
    <header><strong>menumate</strong><span>운영자 통계</span></header>
    <h1>전시 사용 기록</h1>
    <p className="receipt-page-note">이 기기에만 저장된 익명 기록이에요. 개인정보는 남기지 않아요.</p>
    <dl className="stats-list">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    <div className="stats-actions">
      <button className="primary" onClick={download} disabled={!list.length}>CSV로 내려받기</button>
      <button className="secondary" onClick={() => { if (confirm('기록을 모두 지울까요?')) { usage.clear(); setList([]); } }}>기록 지우기</button>
      <a className="secondary" href="#/">키오스크로 돌아가기</a>
    </div>
  </main>;
}
