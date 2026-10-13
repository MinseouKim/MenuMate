import { useEffect, useRef, useState } from 'react';
import { WebSpeechSttProvider } from '../services/stt/webSpeechSttProvider';
import { microphoneGranted, requestMicrophone } from './media';
import { usage } from './usage';
export function InputPanel({ mode, onSubmit, onTouch }: { mode: 'recommend' | 'order'; onSubmit: (text: string) => void; onTouch: () => void }) {
  const [listening, setListening] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const stt = useRef(new WebSpeechSttProvider()); const active = useRef(true); const busy = useRef(false); const epoch = useRef(0); const micReady = useRef(false); const pressed = useRef(false);
  useEffect(() => { void microphoneGranted().then(granted => { if (granted) micReady.current = true; }); }, []);
  useEffect(() => { active.current = true;
    const stop = () => { epoch.current++; busy.current = false; stt.current.cancel(); };
    const hidden = () => { if (document.hidden) { stop(); setListening(false); } };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', stop);
    return () => { active.current = false; stop(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', stop); };
  }, []);
  function press() { pressed.current = true; void start(); }
  function release() { pressed.current = false; stt.current.stop(); }
  async function start() { if (busy.current) return; if (!stt.current.isSupported()) { setError('이 브라우저에서는 음성 인식을 사용할 수 없어요. Chrome이나 Edge에서 열거나 버튼으로 골라 주세요.'); return; }
    // 처음 누를 때 권한 창이 떠서 인식이 끊기지 않도록, 마이크 권한을 먼저 받아 둡니다.
    if (!micReady.current) { busy.current = true; setError(''); setNotice('마이크 권한을 확인하고 있어요…'); const token = ++epoch.current; const failure = await requestMicrophone(); busy.current = false; if (!active.current || token !== epoch.current) return; setNotice(''); if (failure) { setError(failure); return; } micReady.current = true; if (!pressed.current) { setNotice('마이크가 준비됐어요. 다시 누르고 말해 주세요.'); return; } }
    window.speechSynthesis?.cancel(); busy.current = true; const token = ++epoch.current; setError(''); setNotice(''); setListening(true); usage.count('voiceTries'); try { stt.current.start({ onResult: t => { if (active.current && token === epoch.current && t.trim()) { usage.count('voiceOk'); onSubmit(t); } }, onError: message => { if (active.current && token === epoch.current) { setError(message); setListening(false); busy.current = false; } }, onEnd: () => { if (active.current && token === epoch.current) { setListening(false); busy.current = false; } } }); } catch { setError('마이크를 시작하지 못했어요. 버튼으로 골라 주세요.'); setListening(false); busy.current = false; } }
  return <><div className="eyebrow">{mode === 'order' ? '음성 주문' : '메뉴 추천'}</div><h1>{mode === 'order' ? '주문할 메뉴를 말씀해 주세요' : '어떤 메뉴를 찾으세요?'}</h1><p className="muted">{mode === 'order' ? '메뉴 이름과 개수를 말해 주세요. 담기 전에 확인할 수 있어요.' : '예: 두 명이고, 새우 없는 딤섬을 먹고 싶어요.'}</p>
    <button className={`talk ${listening ? 'listening' : ''}`} aria-pressed={listening} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); press(); }} onPointerUp={release} onPointerCancel={() => { pressed.current = false; epoch.current++; stt.current.cancel(); busy.current = false; setListening(false); }} onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } }}>{listening ? '듣고 있어요…' : '누르고 있는 동안 말하기'}<small>손을 떼면 인식이 끝나요</small></button>{error && <p role="alert">{error}</p>}{!error && notice && <p role="status">{notice}</p>}
    {mode === 'recommend' && <div className="examples"><span className="muted">예시 요청으로 체험하기</span>{['두 명이고 베이징덕 먹고 싶어요','딤섬 먹고 싶어요. 새우는 빼주세요','2명이요. 안 매운 면 요리로 1인당 15000원 이내로 부탁해요'].map(t => <button className="example" key={t} onClick={() => onSubmit(t)}>{t}</button>)}</div>}
    <div className="actions"><button type="button" className="secondary" onClick={onTouch}>{mode === 'order' ? '메뉴판으로 돌아가기' : '버튼으로 고르기'}</button></div></>;
}
