import { useEffect, useState, useSyncExternalStore } from 'react';
import { clearAgeLog, getAgeLog, getAgeStatus, subscribeAgeLog } from './ageLog';
import './styles/ai-log.css';

const hhmmss = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour12: false });

/** 얼굴 연령대 판정 로그 창. 주소 끝에 #/ai-log 를 붙이거나 Ctrl+Shift+L 로 열고 닫는다. 전시 화면에는 기본으로 보이지 않는다 */
export function AgeLogPanel() {
  const [open, setOpen] = useState(() => location.hash.startsWith('#/ai-log'));
  const entries = useSyncExternalStore(subscribeAgeLog, getAgeLog);
  const status = useSyncExternalStore(subscribeAgeLog, getAgeStatus);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') setOpen(o => !o); };
    const onHash = () => { if (location.hash.startsWith('#/ai-log')) setOpen(true); };
    window.addEventListener('keydown', onKey); window.addEventListener('hashchange', onHash);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('hashchange', onHash); };
  }, []);
  if (!open) return null;
  return (
    <aside className="age-log" aria-label="얼굴 연령대 판정 로그">
      <header>
        <strong>연령대 판정 로그</strong>
        <span><button onClick={clearAgeLog}>지우기</button><button onClick={() => setOpen(false)}>닫기</button></span>
      </header>
      <dl>
        <div><dt>카메라</dt><dd>{status.camera}</dd></div>
        <div><dt>모델</dt><dd>{status.model}</dd></div>
        <div><dt>최근 판정</dt><dd>{status.decision}</dd></div>
      </dl>
      <ol>
        {entries.length === 0 && <li className="info">아직 기록이 없어요. 시작 화면에서 카메라 앞에 서 보세요.</li>}
        {[...entries].reverse().map(e => <li key={e.id} className={e.kind}><time>{hhmmss(e.at)}</time> {e.text}</li>)}
      </ol>
      <footer>Shift+S 55세 이상 강제 · Shift+N 미만 강제 · Ctrl+Shift+L 닫기</footer>
    </aside>
  );
}
