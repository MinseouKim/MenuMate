// 리듀서 바깥의 모든 부수 효과: API, 카메라·연령 판정, TTS, 자동 초기화, 시연 단축키.
// 화면 컴포넌트는 이 훅이 돌려주는 state 와 명령(commands)만 쓴다.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Answer, MenuResponse, OrderType, Question } from '../api/contracts';
import { simulatedPayment } from '../api/payment';
import { forcedOnlyAgeGate, silentSpeaker } from '../ai/fallback';
import { loadAi } from '../ai/loadAi';
import type { AgeGate, AgeGateUpdate, Speaker } from '../ai/types';
import { config } from '../config';
import { SPEECH } from './copy';
import { initialState, kioskReducer, shouldAutoReset } from './reducer';
import type { KioskState } from './types';

const HEALTH_RETRY_MS = 5000;
const INTERACT_THROTTLE_MS = 1000;

export interface Catalog {
  menu: MenuResponse | null;
  questions: Question[] | null;
  loadError: string | null;
}

export function useKiosk(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [state, dispatch] = useReducer(kioskReducer, Date.now(), initialState);
  const [catalog, setCatalog] = useState<Catalog>({ menu: null, questions: null, loadError: null });
  const [serverDown, setServerDown] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);      // 메뉴판 위에 띄우는 오류 (추천 실패 등)
  const [payFailReason, setPayFailReason] = useState<string | null>(null);
  const [detectProgress, setDetectProgress] = useState<{ run: number; required: number } | null>(null);
  const [speakerAvailable, setSpeakerAvailable] = useState(false);

  const stateRef = useRef<KioskState>(state);
  stateRef.current = state;
  // 모델이 준비되기 전에는 단축키만 받는 판정기와 무음 음성을 쓴다. 준비되면 바꿔 끼운다
  const [fallbackGate] = useState(forcedOnlyAgeGate);
  const aiRef = useRef<{ ageGate: AgeGate; speaker: Speaker }>({ ageGate: fallbackGate, speaker: silentSpeaker });
  const sessionRef = useRef(0);           // 초기화할 때마다 올린다. 이전 세션의 늦은 응답은 버린다
  const forceFailNextRef = useRef(false); // Shift+F

  const speak = useCallback((text: string) => {
    aiRef.current.speaker.speak(text).catch(() => {});
  }, []);
  const stopSpeaking = useCallback(() => aiRef.current.speaker.cancel(), []);

  // ---------- 메뉴·질문 ----------
  const loadCatalog = useCallback(async () => {
    try {
      const [menu, questions] = await Promise.all([api.menu(), api.questions()]);
      setCatalog({ menu, questions: [...questions].sort((a, b) => a.order - b.order), loadError: null });
    } catch (e) {
      setCatalog(c => ({ ...c, loadError: errorMessage(e) }));
    }
  }, []);

  // 서버가 떠 있는지 확인하고, 떠 있으면 메뉴를 받는다. 실패하면 5초마다 다시 확인 (kiosk-flow 3장)
  // 대기 화면에 들어올 때마다(초기화 포함) 확인한다
  const idleSince = state.screen === 'idle' ? state.lastInteractionAt : null;
  useEffect(() => {
    if (idleSince === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const ok = await api.health().then(r => r.ok, () => false);
      if (cancelled) return;
      setServerDown(!ok);
      if (ok) loadCatalog();
      else timer = setTimeout(check, HEALTH_RETRY_MS);
    };
    check();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [idleSince, loadCatalog]);

  // ---------- 카메라와 연령 판정 ----------
  // 화면은 AI를 기다리지 않는다. 큰 모델을 받는 동안에도 대기 화면·터치·단축키가 동작한다 (D46)
  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | null = null;
    const onUpdate = (update: AgeGateUpdate) => {
      if (update.type === 'detecting') setDetectProgress({ run: update.run, required: update.required });
      else setDetectProgress(null);
      if (update.type === 'error') console.error('[ai] 추론 오류', update.code);
      dispatch({ type: 'AI_UPDATE', update, now: Date.now() });
    };
    let unsubscribe = aiRef.current.ageGate.onUpdate(onUpdate);
    const loading = loadAi();

    loading.speaker.then(speaker => {
      if (disposed) return;
      aiRef.current.speaker = speaker;
      setSpeakerAvailable(speaker.available);
    });

    loading.ageGate.then(async gate => {
      if (disposed || !gate) return;
      unsubscribe();
      aiRef.current.ageGate = gate;
      unsubscribe = gate.onUpdate(onUpdate);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      } catch (e) {
        console.error('[camera] 카메라를 열 수 없습니다. 터치로만 시작합니다', e);
        return;
      }
      const video = videoRef.current;
      if (disposed || !video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (stateRef.current.screen === 'idle' || stateRef.current.screen === 'detecting') gate.start(video);
    });

    return () => {
      disposed = true;
      unsubscribe();
      aiRef.current.ageGate.stop();
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [videoRef]);

  // 판정이 끝나면 추론을 멈춘다. 다음 손님은 reset() 에서 다시 시작
  const judging = state.screen === 'idle' || state.screen === 'detecting';
  useEffect(() => {
    if (!judging) {
      aiRef.current.ageGate.stop();
      setDetectProgress(null);
    }
  }, [judging]);

  // ---------- 초기화 (D30) ----------
  const reset = useCallback(() => {
    sessionRef.current += 1;
    forceFailNextRef.current = false;
    stopSpeaking();
    setNotice(null);
    setPayFailReason(null);
    setDetectProgress(null);
    dispatch({ type: 'RESET', now: Date.now() });
    const gate = aiRef.current.ageGate;
    const video = videoRef.current;
    gate.reset();
    if (video?.srcObject) gate.start(video);
  }, [stopSpeaking, videoRef]);

  useEffect(() => {
    const id = setInterval(() => {
      if (shouldAutoReset(stateRef.current, Date.now(), config)) reset();
    }, 500);
    return () => clearInterval(id);
  }, [reset]);

  // 화면 어디를 눌러도 무입력 타이머를 미룬다
  useEffect(() => {
    const onDown = () => {
      const now = Date.now();
      if (now - stateRef.current.lastInteractionAt > INTERACT_THROTTLE_MS) dispatch({ type: 'INTERACT', now });
    };
    window.addEventListener('pointerdown', onDown, { capture: true });
    return () => window.removeEventListener('pointerdown', onDown, { capture: true });
  }, []);

  // ---------- 시연 단축키 (kiosk-flow 4장). 화면에는 아무것도 표시하지 않는다 ----------
  useEffect(() => {
    if (!config.devShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.repeat) return;
      switch (e.code) {
        case 'KeyS': aiRef.current.ageGate.force('senior'); break;
        case 'KeyN': aiRef.current.ageGate.force('non_senior'); break;
        case 'KeyF': forceFailNextRef.current = true; break;
        case 'KeyR': reset(); break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reset]);

  // ---------- 음성 안내 ----------
  const questions = catalog.questions;
  const currentQuestion = state.screen === 'survey' ? questions?.[state.surveyIndex] ?? null : null;

  const readQuestion = useCallback(() => {
    const s = stateRef.current;
    const q = questions?.[s.surveyIndex];
    if (!q) return;
    speak(s.surveyIndex === 0 && s.answers.length === 0 ? `${SPEECH.greeting} ${q.text}` : q.text);
  }, [questions, speak]);

  useEffect(() => {
    if (currentQuestion) readQuestion();
  }, [currentQuestion, readQuestion]);

  useEffect(() => {
    const easy = state.mode === 'easy';
    switch (state.screen) {
      case 'recommend': speak(SPEECH.recommend); break;
      case 'order_type': if (easy) speak(SPEECH.orderType); break;
      case 'cart': if (easy) speak(SPEECH.cart); break;
      case 'paying': if (easy) speak(SPEECH.paying); break;
      case 'done': if (state.orderNumber) speak(SPEECH.done(state.orderNumber)); break;
      case 'survey': break;
      default: stopSpeaking();
    }
  }, [state.screen]);

  useEffect(() => {
    if (state.screen === 'pay_failed' && payFailReason && state.mode === 'easy') speak(payFailReason);
  }, [state.screen, payFailReason]);

  // ---------- 명령 ----------
  const commands = useMemo(() => {
    const now = () => Date.now();
    return {
      reset,
      readQuestion,
      dismissNotice: () => setNotice(null),
      retryLoad: () => { setCatalog(c => ({ ...c, loadError: null })); loadCatalog(); },
      startEasy: () => dispatch({ type: 'START_EASY', now: now() }),
      startNormal: () => dispatch({ type: 'START_NORMAL', now: now() }),
      toggleMode: () => dispatch({ type: 'TOGGLE_MODE', now: now() }),
      openChat: () => { setNotice(null); dispatch({ type: 'OPEN_CHAT', now: now() }); },
      exitSurvey: () => { stopSpeaking(); dispatch({ type: 'EXIT_SURVEY', now: now() }); },
      back: () => { stopSpeaking(); dispatch({ type: 'BACK', now: now() }); },

      answer: async (answer: Answer) => {
        const s = stateRef.current;
        const qs = questions ?? [];
        const q = qs[s.surveyIndex];
        if (s.screen !== 'survey' || !q) return;
        stopSpeaking();
        dispatch({ type: 'ANSWER', questionId: q.id, answer, questionCount: qs.length, now: now() });
        if (s.surveyIndex + 1 < qs.length) return;

        const session = sessionRef.current;
        const answers = [...s.answers.slice(0, s.surveyIndex), { questionId: q.id, answer }];
        try {
          const items = await api.recommendations(answers);
          if (session === sessionRef.current) dispatch({ type: 'RECS_LOADED', items });
        } catch (e) {
          if (session !== sessionRef.current) return;
          setNotice(errorMessage(e));
          dispatch({ type: 'RECS_FAILED' });
        }
      },

      addToCart: (menuId: string) => dispatch({ type: 'ADD_TO_CART', menuId, now: now() }),
      goMenu: () => dispatch({ type: 'GO_MENU', now: now() }),
      checkout: () => dispatch({ type: 'CHECKOUT', now: now() }),
      chooseOrderType: (orderType: OrderType) => dispatch({ type: 'CHOOSE_ORDER_TYPE', orderType, now: now() }),
      changeQty: (menuId: string, delta: number) => dispatch({ type: 'CHANGE_QTY', menuId, delta, now: now() }),
      backToCart: () => dispatch({ type: 'BACK_TO_CART', now: now() }),

      pay: async () => {
        const s = stateRef.current;
        if ((s.screen !== 'cart' && s.screen !== 'pay_failed') || !s.orderType || s.cart.length === 0) return;
        const session = sessionRef.current;
        const forceFail = forceFailNextRef.current;
        forceFailNextRef.current = false;
        setPayFailReason(null);
        dispatch({ type: 'PAY_START', now: now() });
        try {
          let orderId = s.orderId;
          if (!orderId) {
            const order = await api.createOrder(s.orderType, s.cart);
            if (session !== sessionRef.current) return;
            orderId = order.orderId;
            dispatch({ type: 'ORDER_CREATED', orderId });
          }
          const result = await simulatedPayment.pay(orderId, { forceFail });
          if (session !== sessionRef.current) return;
          if (result.result === 'success') {
            dispatch({ type: 'PAY_SUCCEEDED', orderNumber: result.orderNumber, now: now() });
          } else {
            setPayFailReason(result.reason);
            dispatch({ type: 'PAY_FAILED' });
          }
        } catch (e) {
          if (session !== sessionRef.current) return;
          setPayFailReason(errorMessage(e));
          dispatch({ type: 'PAY_FAILED' });
        }
      },
    };
  }, [reset, readQuestion, loadCatalog, questions, stopSpeaking]);

  return {
    state, catalog, serverDown, notice, payFailReason, detectProgress, speakerAvailable, currentQuestion, commands,
  };
}

export type KioskController = ReturnType<typeof useKiosk>;
