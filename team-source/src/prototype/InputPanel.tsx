import { useEffect, useRef, useState } from 'react';
import { WebSpeechSttProvider } from '../services/stt/webSpeechSttProvider';
import { microphoneGranted, requestMicrophone } from './media';
import { usage } from './usage';
export function InputPanel({ mode, onSubmit, onTouch }: { mode: 'recommend' | 'order'; onSubmit: (text: string) => void; onTouch: () => void }) {
  const [listening, setListening] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [heard, setHeard] = useState('');
  const stt = useRef(new WebSpeechSttProvider()); const active = useRef(true); const busy = useRef(false); const epoch = useRef(0); const micReady = useRef(false); const limit = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { void microphoneGranted().then(granted => { if (granted) micReady.current = true; }); }, []);
  useEffect(() => { active.current = true;
    const stop = () => { epoch.current++; busy.current = false; clearTimeout(limit.current); stt.current.cancel(); };
    const hidden = () => { if (document.hidden) { stop(); setListening(false); } };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', stop);
    return () => { active.current = false; stop(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', stop); };
  }, []);
  // 누르면 듣기 시작, 한 번 더 누르면 듣기를 끝내고 들은 문장으로 메뉴를 찾습니다(키오스크에서 계속 누르고 있기 어려움).
  function toggle() { if (listening) finish(); else void start(); }
  function finish() { clearTimeout(limit.current); setNotice('들은 내용을 정리하고 있어요…'); stt.current.stop(); }
  async function start() { if (busy.current) return; if (!stt.current.isSupported()) { setError('이 브라우저에서는 음성 인식을 사용할 수 없어요. Chrome이나 Edge에서 열거나 메뉴판에서 직접 골라 주세요.'); return; }
    // 처음 누를 때 권한 창이 떠서 인식이 끊기지 않도록, 마이크 권한을 먼저 받아 둡니다.
    if (!micReady.current) { busy.current = true; setError(''); setNotice('마이크 권한을 확인하고 있어요…'); const token = ++epoch.current; const failure = await requestMicrophone(); busy.current = false; if (!active.current || token !== epoch.current) return; setNotice(''); if (failure) { setError(failure); return; } micReady.current = true; }
    window.speechSynthesis?.cancel(); busy.current = true; const token = ++epoch.current; setError(''); setNotice(''); setHeard(''); setListening(true); usage.count('voiceTries');
    // 끝내기를 잊어도 계속 듣지 않도록 20초가 지나면 스스로 끝냅니다.
    clearTimeout(limit.current); limit.current = setTimeout(() => { if (active.current && token === epoch.current) finish(); }, 20000);
    try { stt.current.start({ onInterim: t => { if (active.current && token === epoch.current) setHeard(t); }, onResult: t => { if (active.current && token === epoch.current && t.trim()) { usage.count('voiceOk'); onSubmit(t); } }, onError: message => { if (active.current && token === epoch.current) { clearTimeout(limit.current); setError(message); setNotice(''); setListening(false); busy.current = false; } }, onEnd: () => { if (active.current && token === epoch.current) { clearTimeout(limit.current); setNotice(''); setListening(false); busy.current = false; } } }); } catch { clearTimeout(limit.current); setError('마이크를 시작하지 못했어요. 메뉴판에서 직접 골라 주세요.'); setListening(false); busy.current = false; } }
  return <><div className="eyebrow">{mode === 'order' ? '음성 주문' : '메뉴 추천'}</div><h1>{mode === 'order' ? '주문할 메뉴를 말씀해 주세요' : '어떤 메뉴를 찾으세요?'}</h1><p className="muted">{mode === 'order' ? '메뉴 이름과 개수를 말해 주세요. 담기 전에 확인할 수 있어요.' : '예: 두 명이고, 새우 없는 딤섬을 먹고 싶어요.'}</p>
    <button className={`talk ${listening ? 'listening' : ''}`} aria-pressed={listening} onClick={toggle}>{listening ? '듣고 있어요 · 눌러서 끝내기' : '눌러서 말하기'}<small>{listening ? '다 말씀하셨으면 한 번 더 눌러 주세요' : '말을 마치면 한 번 더 눌러 주세요'}</small></button>{listening && <p className="heard" aria-live="polite">{heard ? `“${heard}”` : '말씀해 주세요…'}</p>}{error && <p role="alert">{error}</p>}{!error && notice && <p role="status">{notice}</p>}
    {mode === 'recommend' && <div className="examples"><span className="muted">예시 요청으로 체험하기</span>{['두 명이고 베이징덕 먹고 싶어요','딤섬 먹고 싶어요. 새우는 빼주세요','2명이요. 안 매운 면 요리로 1인당 15000원 이내로 부탁해요'].map(t => <button className="example" key={t} onClick={() => onSubmit(t)}>{t}</button>)}</div>}
    <div className="actions"><button type="button" className="secondary" onClick={onTouch}>{mode === 'order' ? '메뉴판으로 돌아가기' : '메뉴판에서 직접 고르기'}</button></div></>;
}
