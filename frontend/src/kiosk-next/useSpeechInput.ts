// 말하기 버튼: 누르면 듣기 시작, 한 번 더 누르면 끝내고 들은 문장을 넘깁니다(키오스크에서 계속 누르고 있기 어려움).
// 인식 수단(브라우저 음성 인식 → 인터넷이 끊기면 이 기기 안의 Whisper)은 HybridSttProvider 가 고릅니다 (D32, D89).
// 녹음은 저장하거나 보내지 않습니다. 화면 밖으로 나가거나 이 화면을 떠나면 바로 끊습니다.
import { useEffect, useRef, useState } from 'react';
import { microphoneGranted, requestMicrophone } from '../prototype/media';
import { usage } from '../prototype/usage';
import { HybridSttProvider } from '../services/stt/hybridSttProvider';

/** 끝내기를 잊어도 계속 듣지 않도록 이 시간이 지나면 스스로 끝냅니다. */
const LISTEN_LIMIT_MS = 20_000;

export function useSpeechInput(onResult: (text: string) => void) {
  const [stt] = useState(() => new HybridSttProvider());
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const alive = useRef(true);
  const busy = useRef(false);
  const epoch = useRef(0); // 지난 시도의 늦은 응답을 버리기 위한 번호
  const micReady = useRef(false);
  const limit = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resultRef = useRef(onResult);
  useEffect(() => { resultRef.current = onResult; });

  useEffect(() => { void microphoneGranted().then(granted => { if (granted) micReady.current = true; }); }, []);
  useEffect(() => {
    alive.current = true;
    const stop = () => { epoch.current++; busy.current = false; clearTimeout(limit.current); stt.cancel(); };
    const onHidden = () => { if (document.hidden) { stop(); setListening(false); } };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', stop);
    return () => { alive.current = false; stop(); document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('pagehide', stop); };
  }, [stt]);

  const current = (token: number) => alive.current && token === epoch.current;

  function finish() {
    clearTimeout(limit.current);
    setNotice('들은 내용을 정리하고 있어요…');
    stt.stop();
  }

  async function start() {
    if (busy.current) return;
    if (!stt.isSupported()) { setError('이 브라우저에서는 음성 인식을 사용할 수 없어요. Chrome이나 Edge에서 열거나 메뉴판에서 직접 골라 주세요.'); return; }
    // 처음 누를 때 권한 창이 떠서 인식이 끊기지 않도록, 마이크 권한을 먼저 받아 둡니다.
    if (!micReady.current) {
      busy.current = true; setError(''); setNotice('마이크 권한을 확인하고 있어요…');
      const token = ++epoch.current;
      const failure = await requestMicrophone();
      busy.current = false;
      if (!current(token)) return;
      setNotice('');
      if (failure) { setError(failure); return; }
      micReady.current = true;
    }
    window.speechSynthesis?.cancel();
    busy.current = true;
    const token = ++epoch.current;
    setError(''); setNotice(''); setHeard(''); setListening(true);
    usage.count('voiceTries');
    clearTimeout(limit.current);
    limit.current = setTimeout(() => { if (current(token)) finish(); }, LISTEN_LIMIT_MS);
    const end = () => { clearTimeout(limit.current); setNotice(''); setListening(false); busy.current = false; };
    try {
      stt.start({
        onInterim: text => { if (current(token)) setHeard(text); },
        onResult: text => { if (current(token) && text.trim()) { usage.count('voiceOk'); resultRef.current(text); } },
        onError: message => { if (current(token)) { setError(message); end(); } },
        onEnd: () => { if (current(token)) end(); },
      });
    } catch {
      setError('마이크를 시작하지 못했어요. 메뉴판에서 직접 골라 주세요.');
      end();
    }
  }

  return { listening, heard, error, notice, toggle: () => (listening ? finish() : void start()) };
}
