// 말하기 버튼: 누르면 듣기 시작, 한 번 더 누르면 끝내고 들은 문장을 넘깁니다(키오스크에서 계속 누르고 있기 어려움).
// 인식 수단(브라우저 음성 인식 → 인터넷이 끊기면 이 기기 안의 Whisper)은 HybridSttProvider 가 고릅니다 (D32, D89).
// 녹음은 저장하거나 보내지 않습니다. 화면 밖으로 나가거나 이 화면을 떠나면 바로 끊습니다.
import { useEffect, useRef, useState } from 'react';
import { microphoneGranted, requestMicrophone } from '../prototype/media';
import { usage } from '../prototype/usage';
import { HybridSttProvider } from '../services/stt/hybridSttProvider';
import type { SttCallbacks } from '../services/stt/types';
import { dropPrefix, endpointDelay, isEcho, stripEcho } from './listening';
import { onSilence, speakingText, stopSpeaking } from './speech';

/** 끝내기를 잊어도 계속 듣지 않도록 이 시간이 지나면 스스로 끝냅니다. 핸즈프리는 손님이 말을 시작한 뒤 8초. */
const LISTEN_LIMIT_MS = 20_000;
const HANDS_FREE_LIMIT_MS = 8_000;
/** 핸즈프리: 듣기가 끝나면 이만큼 쉬고 다시 듣습니다 */
const RESTART_MS = 300;
/** 직원이 말하는 중 메아리가 아닌 말이 이만큼 연달아 들려야 끼어들기로 봅니다 (기침·잡음 한 번으로 끊지 않게) */
const BARGE_IN_STREAK = 2;

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
  // ── 핸즈프리 한 번 듣는 동안의 메아리 기록 (start 마다 비움) ──
  /** 직원이 말하는 동안 들린 메아리 원문(가장 최근). 손님 말은 이 뒤부터입니다 */
  const echoSnap = useRef('');
  /** 그 메아리의 원래 직원 문장. 스냅샷으로 못 덜어 낸 조각을 한 번 더 덜어 냅니다 */
  const echoOf = useRef('');
  /** 직원이 말하는 중 메아리가 아닌 말이 연달아 들린 횟수 */
  const streak = useRef(0);
  /** 손님이 끼어들어 직원 말을 멈췄는지. 멈출 때 오는 onSilence 에서 듣던 것을 버리지 않게 먼저 세웁니다 */
  const bargedIn = useRef(false);
  /** 직원이 말하는 동안 무언가를 들었는지(메아리·잡음). 직원 말이 끝나면 버리고 새로 듣습니다 */
  const staffHeard = useRef(false);
  /** 손님이 말을 시작했는지(메아리 아닌 중간 결과). 8초 제한을 이때부터 잽니다 */
  const spoke = useRef(false);
  const endpoint = useRef<ReturnType<typeof setTimeout>>(undefined);
  const restart = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /** 손님이 "마이크 끄기"를 눌렀음. 켜기 전까지 저절로 다시 듣지 않습니다 */
  const [off, setOff] = useState(false);
  const offRef = useRef(false);
  const alive = useRef(true);
  const busy = useRef(false);
  const epoch = useRef(0); // 지난 시도의 늦은 응답을 버리기 위한 번호
  const micReady = useRef(false);
  const limit = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resultRef = useRef(onResult);
  useEffect(() => { resultRef.current = onResult; });

  /** 듣던 것을 버리고 끊습니다(결과를 넘기지 않음) */
  function abandon() {
    epoch.current++;
    busy.current = false;
    clearTimeout(limit.current); clearTimeout(endpoint.current); clearTimeout(restart.current);
    stt.cancel();
  }

  useEffect(() => { void microphoneGranted().then(granted => { if (granted) micReady.current = true; }); }, []);
  useEffect(() => {
    alive.current = true;
    const onHidden = () => { if (document.hidden) { abandon(); setListening(false); } };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', abandon);
    // 직원 음성이 끝났는데 그동안 들은 것이 끼어들기가 아니었으면(메아리·맞장구·잡음) 버리고 새로 듣습니다.
    // 연속 인식은 들은 것을 한 버퍼에 쌓으므로, 그대로 두면 손님 말 앞에 메아리가 붙어 서버로 갑니다.
    const unsubscribe = onSilence(() => {
      if (!busy.current || !optsRef.current.handsFree || bargedIn.current || !staffHeard.current) return;
      abandon();
      void start();
    });
    return () => {
      alive.current = false; abandon(); unsubscribe();
      document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('pagehide', abandon);
    };
  }, [stt]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = (token: number) => alive.current && token === epoch.current;

  function finish() {
    clearTimeout(limit.current);
    clearTimeout(endpoint.current);
    if (!optsRef.current.handsFree) setNotice('들은 내용을 정리하고 있어요…');
    stt.stop();
  }

  /** 들은 말에서 손님 말만: 메아리 스냅샷 뒤를 잘라 내고, 원래 직원 문장 조각을 한 번 더 덜어 냅니다 */
  const customerPart = (text: string) => stripEcho(dropPrefix(text, echoSnap.current), echoOf.current);

  /** 손님이 말을 시작했으면 그때부터 8초 */
  function startedSpeaking(token: number) {
    if (spoke.current) return;
    spoke.current = true;
    clearTimeout(limit.current);
    limit.current = setTimeout(() => { if (current(token)) finish(); }, HANDS_FREE_LIMIT_MS);
  }

  /**
   * 핸즈프리 중간 결과. 직원이 말하는 중이면 메아리는 스냅샷으로 기억하고 무시하며,
   * 메아리가 아닌 말이 연달아 들려야 끼어들기로 보고 직원 말을 멈춥니다. 그 밖에는 자막을 보이고 말끝 타이머를 다시 잽니다.
   */
  function heardSoFar(text: string, token: number) {
    const spoken = speakingText();
    if (spoken) {
      staffHeard.current = true;
      echoOf.current = spoken;
      const rest = dropPrefix(text, echoSnap.current);
      if (!rest || isEcho(rest, spoken)) { echoSnap.current = text; streak.current = 0; return; }
      startedSpeaking(token);
      if (++streak.current < BARGE_IN_STREAK) return;
      bargedIn.current = true; // stopSpeaking 이 곧바로 onSilence 를 부르므로 먼저 세웁니다
      stopSpeaking();
      optsRef.current.onBargeIn?.();
    }
    const said = customerPart(text);
    if (said) startedSpeaking(token);
    setHeard(said);
    clearTimeout(endpoint.current);
    endpoint.current = setTimeout(() => { if (current(token)) finish(); }, endpointDelay(said || text, optsRef.current.large));
  }

  async function start() {
    if (busy.current || offRef.current) return;
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
    echoSnap.current = ''; echoOf.current = ''; streak.current = 0; bargedIn.current = false; staffHeard.current = false; spoke.current = false;
    usage.count('voiceTries');
    clearTimeout(limit.current);
    // 핸즈프리는 조용히 기다리는 시간을 빼고, 손님이 말을 시작한 뒤부터 8초를 잽니다(startedSpeaking). 그 전에는 안전장치로 20초.
    limit.current = setTimeout(() => { if (current(token)) finish(); }, LISTEN_LIMIT_MS);
    const end = () => { clearTimeout(limit.current); clearTimeout(endpoint.current); setNotice(''); setListening(false); busy.current = false; };
    try {
      stt.start({
        onInterim: text => { if (!current(token)) return; if (handsFree) heardSoFar(text, token); else setHeard(text); },
        onResult: text => {
          if (!current(token)) return;
          const said = handsFree ? customerPart(text) : text;
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

  /** 마이크 끄기: 듣던 것을 버리고, 켜기 전까지 다시 듣지 않습니다 */
  function stop() {
    offRef.current = true;
    setOff(true);
    abandon();
    setListening(false); setHeard(''); setNotice('');
  }
  /** 마이크 켜기: 다시 듣기 시작합니다 */
  function resume() {
    offRef.current = false;
    setOff(false);
    void start();
  }

  return { listening, heard, error, notice, off, toggle: () => (listening ? finish() : void start()), start: () => void start(), finish, stop, resume };
}
