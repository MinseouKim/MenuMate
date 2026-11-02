// 말하기 버튼: 누르면 듣기 시작, 한 번 더 누르면 끝내고 들은 문장을 넘깁니다(키오스크에서 계속 누르고 있기 어려움).
// 인식 수단(브라우저 음성 인식 → 인터넷이 끊기면 이 기기 안의 Whisper)은 HybridSttProvider 가 고릅니다 (D32, D89).
// 녹음은 저장하거나 보내지 않습니다. 화면 밖으로 나가거나 이 화면을 떠나면 바로 끊습니다.
import { useEffect, useRef, useState } from 'react';
import { microphoneGranted, requestMicrophone } from '../prototype/media';
import { usage } from '../prototype/usage';
import { HybridSttProvider } from '../services/stt/hybridSttProvider';
import type { SttCallbacks } from '../services/stt/types';
import { endpointDelay, isEcho, stripEcho } from './listening';
import { speakingText, stopSpeaking } from './speech';

/** 끝내기를 잊어도 계속 듣지 않도록 이 시간이 지나면 스스로 끝냅니다. 핸즈프리는 한 번에 8초. */
const LISTEN_LIMIT_MS = 20_000;
const HANDS_FREE_LIMIT_MS = 8_000;
/** 핸즈프리: 듣기가 끝나면 이만큼 쉬고 다시 듣습니다 */
const RESTART_MS = 300;

interface Stt { isSupported(): boolean; start(c: SttCallbacks): void; stop(): void; cancel(): void }
export interface SpeechInputOptions {
  /**
   * 핸즈프리(2026-11-03 설계 4-1): 버튼을 다시 누르지 않아도 말끝을 알아서 끝내고, 끝나면 다시 듣습니다.
   * 직원이 말하는 중에도 들으며, 자기 목소리 메아리는 무시하고 손님이 끼어들면 직원 말을 멈춥니다.
   */
  handsFree?: boolean;
  /** 큰 글씨 모드(고령 손님): 말끝을 조금 더 기다립니다 */
  large?: boolean;
  /** 손님이 직원 말을 끊었을 때 */
  onBargeIn?: () => void;
  /** 테스트용 음성 인식 */
  provider?: Stt;
}

export function useSpeechInput(onResult: (text: string) => void, opts: SpeechInputOptions = {}) {
  const [stt] = useState<Stt>(() => opts.provider ?? new HybridSttProvider());
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });
  /** 끼어들 때 섞여 들어온 직원 문장 (끝난 문장에서 덜어 냄) */
  const echoOf = useRef('');
  const endpoint = useRef<ReturnType<typeof setTimeout>>(undefined);
  const restart = useRef<ReturnType<typeof setTimeout>>(undefined);
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
    const stop = () => { epoch.current++; busy.current = false; clearTimeout(limit.current); clearTimeout(endpoint.current); clearTimeout(restart.current); stt.cancel(); };
    const onHidden = () => { if (document.hidden) { stop(); setListening(false); } };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', stop);
    return () => { alive.current = false; stop(); document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('pagehide', stop); };
  }, [stt]);

  const current = (token: number) => alive.current && token === epoch.current;

  function finish() {
    clearTimeout(limit.current);
    clearTimeout(endpoint.current);
    if (!optsRef.current.handsFree) setNotice('들은 내용을 정리하고 있어요…');
    stt.stop();
  }

  /** 핸즈프리 중간 결과: 메아리는 버리고, 끼어들면 직원 말을 멈추고, 말끝 타이머를 다시 잽니다 */
  function heardSoFar(text: string, token: number) {
    const spoken = speakingText();
    if (spoken) {
      if (isEcho(text, spoken)) { echoOf.current = spoken; return; }
      echoOf.current = spoken;
      stopSpeaking();
      optsRef.current.onBargeIn?.();
    }
    setHeard(stripEcho(text, echoOf.current));
    clearTimeout(endpoint.current);
    endpoint.current = setTimeout(() => { if (current(token)) finish(); }, endpointDelay(text, optsRef.current.large));
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
    const handsFree = !!optsRef.current.handsFree;
    // 버튼으로 들을 때는 안내 음성을 멈추고 듣습니다. 핸즈프리는 직원이 말하는 중에도 듣고, 손님이 끼어들 때만 멈춥니다.
    if (!handsFree) stopSpeaking();
    busy.current = true;
    const token = ++epoch.current;
    setError(''); setNotice(''); setHeard(''); setListening(true);
    echoOf.current = '';
    usage.count('voiceTries');
    clearTimeout(limit.current);
    limit.current = setTimeout(() => { if (current(token)) finish(); }, handsFree ? HANDS_FREE_LIMIT_MS : LISTEN_LIMIT_MS);
    const end = () => { clearTimeout(limit.current); clearTimeout(endpoint.current); setNotice(''); setListening(false); busy.current = false; };
    try {
      stt.start({
        onInterim: text => { if (!current(token)) return; if (handsFree) heardSoFar(text, token); else setHeard(text); },
        onResult: text => {
          if (!current(token)) return;
          const said = handsFree ? stripEcho(text, echoOf.current) : text;
          if (said.trim()) { usage.count('voiceOk'); resultRef.current(said); }
        },
        onError: (message, code) => {
          if (!current(token)) return;
          // 핸즈프리에서 아무 말이 없던 것(코드 없음)은 오류가 아니라 다시 들을 일입니다.
          if (handsFree && !code) return;
          setError(message); end();
        },
        onEnd: () => {
          if (!current(token)) return;
          const again = handsFree && busy.current; // 오류로 이미 끝났으면(busy=false) 다시 듣지 않음
          end();
          if (again) restart.current = setTimeout(() => { if (alive.current && optsRef.current.handsFree) void start(); }, RESTART_MS);
        },
      });
    } catch {
      setError('마이크를 시작하지 못했어요. 메뉴판에서 직접 골라 주세요.');
      end();
    }
  }

  return { listening, heard, error, notice, toggle: () => (listening ? finish() : void start()), start: () => void start(), finish };
}
