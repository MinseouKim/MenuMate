// 키오스크 한 대의 모든 동작. 화면(UI)은 이 훅이 돌려주는 state 와 act 만 압니다.
// 안에서 하는 일: 흐름 상태(session reducer), 카메라 화면 맞춤, 자리를 비운 손님 정리 타이머, 음성 안내,
// 말로 추천·말로 주문 해석, 결제 후 주문 만들기, 익명 사용 기록(usage). 개인정보는 연령대 결과(senior/adult)만 상태에 둡니다 (D2).
import { useEffect, useReducer, useRef } from 'react';
import { useAgeAssist } from '../prototype/ageAssist';
import { logAge } from '../prototype/ageLog';
import { matchMenus, parseCount } from '../prototype/parse';
import { usage } from '../prototype/usage';
import { catalog as defaultCatalog, type Catalog } from './catalog';
import * as Cart from './cart';
import { defaultRecommender, type Recommender } from './recommender';
import { createInitialState, lineOf, reducer, type SessionState } from './session';
import { ACKS, GREETING, wakeServer } from './chatClient';
import { chime, prefetchSpeech, speak, stopSpeaking } from './speech';
import { useFaceSignals } from './useFaceSignals';
import { money, type ChatTurn, type Conditions, type Dialog, type Menu, type PaymentResult, type PickReason, type Prefs, type Recommendation, type Screen } from './types';
import { config } from '../config';

export const IDLE_MS = 60_000;
export const IDLE_GRACE_MS = 20_000;
export const DONE_MS = 60_000;
/** 시작 화면을 지나 이 시간 안에 얼굴 나이대를 알지 못하면 카메라를 끕니다. */
export const FACE_WAIT_MS = 20_000;
/** 시작 화면에서 켜진 큰 글씨는 주문을 시작하지 않으면 이 시간 뒤 처음 상태로(지나가던 사람 때문에 켜진 경우). */
const WELCOME_RESET_MS = 30_000;
const NOTE_MS = 10_000;
const MESSAGE_MS = 3_000;
/** 무료 서버(Render)는 15분 동안 요청이 없으면 잠듭니다 */
const WAKE_MS = 10 * 60_000;

// 시연 모드(운영자 단축키 Ctrl+Shift+1~4): 전시장 소음으로 음성 인식이 어려울 때 준비한 문장을 말한 것처럼 넣습니다.
const DEMO = {
  recommend: ['두 명이고 새우는 빼고 딤섬 먹고 싶어요', '네 명이서 1인당 3만원으로 안 매운 거 추천해 주세요', '짬뽕 먹고 싶어요. 돼지고기는 빼 주세요', '혼자 왔어요. 만원 이하로 면 요리 부탁해요'],
  order: ['하가우 두 개 주세요', '홍게살 소룡포 세 개', '베이징덕 한 마리 주세요', '원심 유니짜장 하나요'],
};

export interface KioskDeps { catalog?: Catalog; recommender?: Recommender }

// 음성 안내: 화면 제목만이 아니라 추천 결과·결제 금액·주문 번호까지 읽어 줍니다(고령층·저시력 이용자용).
function narration(s: SessionState, catalog: Catalog, total: number): string {
  const nameOf = (id: string) => catalog.get(id).name;
  const by: Record<Screen, string> = {
    welcome: '직접 메뉴를 고르거나, 말로 추천받을 수 있어요.',
    menu: '드실 메뉴를 누르면 주문에 담겨요.',
    notice: '말로 추천받기 시작 버튼을 눌러 주세요.',
    input: s.mode === 'order'
      ? '말하기 버튼을 누르고 메뉴 이름과 개수를 말씀해 주세요. 다 말씀하시면 한 번 더 눌러 주세요.'
      // 직원 AI와 대화 중이면 마지막 답변을 그대로 읽습니다(음성 안내가 꺼져 있어도 대화 답변은 읽습니다 — 아래 effect).
      : lastAssistant(s) ?? (s.chat.pending ? '잠시만요, 생각하고 있어요.' : '말하기 버튼을 누르고 원하는 메뉴나 취향을 말씀해 주세요. 다 말씀하시면 한 번 더 눌러 주세요.'),
    review: `${s.conditions.party}명으로 이해했어요. 맞으면 추천해 주세요 버튼을 눌러 주세요.`,
    results: s.results.length
      ? `추천 메뉴 ${s.results.length}가지예요. ${s.results.map((r, i) => `${i + 1}번, ${r.lines.map(l => `${nameOf(l.id)} ${l.quantity}개`).join(', ')}, ${money(r.total)}.`).join(' ')}`
      : '조건에 맞는 메뉴가 없어요. 조건을 바꿔 주세요.',
    payment: `결제 금액은 ${money(total)}이에요. 결제 방법을 선택해 주세요.`,
    done: s.order ? `주문이 완료되었어요. 주문 번호 ${Number(s.order.number)}번이에요.` : '주문이 완료되었어요.',
  };
  return by[s.screen];
}

/** 대화 중 직원 AI의 마지막 말. 대화가 실패했거나 아직 없으면 null */
export function lastAssistant(s: SessionState): string | null {
  if (s.chat.failed) return null;
  const last = [...s.chat.turns].reverse().find(t => t.role === 'assistant');
  return last?.text ?? null;
}

export function useKiosk({ catalog = defaultCatalog, recommender = defaultRecommender }: KioskDeps = {}) {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(recommender.understand('')));
  const { screen, dialog, prefs, message } = state;
  const aiToken = useRef(0);
  const total = Cart.total(state.cart, catalog);
  const count = Cart.count(state.cart);

  // 카메라: 연령대는 손님 한 명마다 한 번만 정합니다. 그 뒤에도(결제·완료 화면 전까지) 카메라는 켜 두고
  // 얼굴이 화면에 가까워지거나 눈을 찌푸리는 '불편 신호'만 봅니다 (VITE_FACE_SIGNALS). 영상은 저장하지 않고 화면에도 띄우지 않습니다.
  const cameraOn = screen !== 'payment' && screen !== 'done' && (!state.faceDone || config.faceSignals);
  const face = useAgeAssist(cameraOn, group => dispatch({ type: 'face', group }));
  const comfort = useFaceSignals(cameraOn && state.faceDone && screen !== 'welcome' && !state.comfortAsked && !prefs.large);
  useEffect(() => {
    if (!comfort.signal || state.comfortAsked || prefs.large || screen === 'welcome') return;
    dispatch({ type: 'comfort/asked' });
    dispatch({ type: 'dialog', dialog: { kind: 'comfort', signal: comfort.signal } });
  }, [comfort.signal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 바깥 일(타이머·소리·기록) ─────────────────────────────────────────────
  useEffect(() => { if (state.faceNote) logAge('ok', '화면 적용: 큰 글씨 + 음성 안내 켬'); }, [state.faceNote]);
  useEffect(() => { if (state.faceDone || screen === 'welcome') return; const t = setTimeout(() => dispatch({ type: 'face/done' }), FACE_WAIT_MS); return () => clearTimeout(t); }, [state.faceDone, screen]);
  useEffect(() => { if (!state.faceNote) return; const t = setTimeout(() => dispatch({ type: 'face/note-clear' }), NOTE_MS); return () => clearTimeout(t); }, [state.faceNote]);
  useEffect(() => { if (screen !== 'welcome' || !state.faceDone || state.manual) return; const t = setTimeout(() => act.reset('welcome', true), WELCOME_RESET_MS); return () => clearTimeout(t); }, [screen, state.faceDone, state.manual]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!message) return; const t = setTimeout(() => dispatch({ type: 'message', text: '' }), MESSAGE_MS); return () => clearTimeout(t); }, [message]);

  // 전시·매장에서 손님이 그냥 떠나면 다음 사람이 앞사람의 장바구니를 보지 않도록 처음으로 되돌립니다.
  useEffect(() => {
    if (screen === 'welcome') return;
    if (screen === 'done') { const t = setTimeout(() => act.reset('welcome', true), DONE_MS); return () => clearTimeout(t); }
    const ask = () => dispatch({ type: 'dialog', dialog: { kind: 'idle' } });
    let timer = setTimeout(ask, IDLE_MS);
    const bump = () => { clearTimeout(timer); timer = setTimeout(ask, IDLE_MS); };
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', bump); window.removeEventListener('keydown', bump); };
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (dialog?.kind !== 'idle') return; const t = setTimeout(() => act.reset('welcome', true), IDLE_GRACE_MS); return () => clearTimeout(t); }, [dialog]); // eslint-disable-line react-hooks/exhaustive-deps

  // 음성 안내. 직원 AI 답변은 음성 안내 설정과 관계없이 읽습니다(대화가 곧 안내이므로).
  const narrated = narration(state, catalog, total);
  const talking = screen === 'input' && state.mode === 'recommend' && lastAssistant(state) !== null;
  useEffect(() => { if (prefs.voice && message) speak(message); }, [message, prefs.voice]);
  useEffect(() => {
    if (prefs.voice || talking) void speak(narrated);
    return stopSpeaking;
  }, [narrated, prefs.voice, talking]);

  // 직원 AI 대화: 말하기 화면에 들어오면 서버를 기다리지 않고 가게 첫인사부터. 상황(날씨·시간대)은 뒤에서 받아 둡니다.
  // 서버가 안 되면 손님의 첫 대답에서 알게 되고, 그때 예전 길(확인 화면)로 이어 갑니다 (chatSend).
  useEffect(() => {
    if (screen !== 'input' || state.mode !== 'recommend' || state.chat.failed || state.chat.turns.length > 0) return;
    dispatch({ type: 'chat/greet', text: GREETING });
    if (!state.chat.context) void recommender.context().then(context => dispatch({ type: 'chat/context', context }));
  }, [screen, state.mode, state.chat.failed, state.chat.turns.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 무료 서버가 잠들지 않게: 켜질 때와 시작 화면에 돌아올 때, 그리고 10분마다 깨웁니다. 맞장구 음성도 미리 받아 둡니다.
  useEffect(() => { if (screen === 'welcome') { wakeServer(); prefetchSpeech([GREETING, ...ACKS]); } }, [screen]);
  useEffect(() => { const t = setInterval(wakeServer, WAKE_MS); return () => clearInterval(t); }, []);

  // ── 손님이 하는 일 ────────────────────────────────────────────────────────
  const say = (text: string) => dispatch({ type: 'message', text });
  /** 대화 기록을 서버에 보내고 답을 반영합니다. 새로 보내면 앞선 요청의 늦은 답은 버립니다(aiToken). */
  const chatSend = (turns: ChatTurn[], latest: string) => {
    const token = ++aiToken.current;
    const raw = [state.conditions.raw, latest].filter(Boolean).join(' ');
    void recommender.converse(turns, state.conditions, state.chat.context).then(reply => {
      if (token !== aiToken.current) return;
      if (!reply) {
        // 대화 서버가 끊기면 지금까지 말한 내용을 규칙으로 읽어 예전 길(확인 화면)로 이어 갑니다.
        dispatch({ type: 'chat/failed' });
        say('AI 연결이 안 돼 간단한 질문으로 진행할게요.');
        act.askRecommend(raw);
        return;
      }
      usage.ai('llm');
      dispatch({ type: 'chat/assistant', reply });
      if (reply.done) act.showResults({ ...state.conditions, ...reply.conditions, raw }, reply.picks, reply.pickReasons ?? []);
    });
  };
  const open = (next: Dialog | null) => dispatch({ type: 'dialog', dialog: next });
  const addLines = (items: Parameters<typeof Cart.add>[1]) => dispatch({ type: 'cart', change: cart => Cart.add(cart, items) });

  const act = {
    go(to: Screen) {
      if (to === screen) return;
      if (screen === 'welcome') { usage.begin(); if (face.group) dispatch({ type: 'face', group: face.group }); }
      if (to === 'menu' && screen === 'welcome') usage.path('menu');
      if (to === 'notice' || to === 'review') usage.path('recommend');
      dispatch({ type: 'go', to });
    },
    back: () => dispatch({ type: 'back' }),
    /** fresh: 손님이 떠나서 자동으로 초기화할 때. 다음 손님을 위해 큰 글씨·음성 안내도 끕니다. */
    reset(to: Screen = 'welcome', fresh = false) {
      if (to !== 'done') usage.finish('abandoned');
      aiToken.current++;
      dispatch({ type: 'reset', to, fresh });
    },
    start(mode: 'order' | 'recommend') {
      dispatch({ type: 'mode', mode });
      act.go(mode === 'order' ? 'menu' : 'notice');
    },
    togglePref(name: keyof Prefs) {
      const on = !prefs[name];
      if (on && name === 'large') usage.flag('large');
      if (on && name === 'voice') usage.flag('voiceGuide');
      dispatch({ type: 'pref', name, on, byUser: true });
    },
    undoFace: () => dispatch({ type: 'face/undo' }),
    say,
    open,
    close: () => open(null),
    selectCategory: (id: string) => dispatch({ type: 'category', id }),
    search: (query: string | null) => dispatch({ type: 'search', query }),

    /** 메뉴를 담습니다. 품절이면 막고, 옵션이 있으면 먼저 고르게 합니다. 담았으면 true. */
    pick(menu: Menu, quantity = 1): boolean {
      if (menu.soldOut) { say(`${menu.name}는 오늘 품절이에요.`); open(null); return false; }
      if (menu.options?.length) { open({ kind: 'option', menu, quantity }); return false; }
      addLines([lineOf(menu.id, quantity)]);
      say(`${menu.name} ${quantity}개를 담았어요`);
      open(null);
      return true;
    },
    chooseOption(menu: Menu, quantity: number, option: string) {
      addLines([lineOf(menu.id, quantity, option)]);
      say(`${menu.name}(${option}) ${quantity}개를 담았어요`);
      open(null);
      if (screen === 'input') act.go('menu');
    },
    confirmSpoken(menu: Menu, quantity: number) { if (act.pick(menu, quantity)) act.go('menu'); },
    changeQuantity: (key: string, delta: number) => dispatch({ type: 'cart', change: cart => Cart.changeQuantity(cart, key, delta) }),
    removeLine: (key: string) => dispatch({ type: 'cart', change: cart => Cart.remove(cart, key) }),
    clearCart: () => dispatch({ type: 'cart', change: () => Cart.emptyCart }),
    decrementMenu: (id: string) => dispatch({ type: 'cart', change: cart => Cart.decrement(cart, id) }),

    /** 주문하기: 담은 메뉴를 한 번 더 보여 주고 확인을 받은 뒤 결제로 갑니다(곁들임 제안 대신, 2026-11-01). */
    checkout() { say(''); open({ kind: 'confirm' }); },
    pay(payment: PaymentResult) {
      const order = Cart.placeOrder({ cart: state.cart, catalog, number: state.orderCount + 1, payment, paidAt: new Date() });
      usage.finish('ordered', { total, items: Cart.count(state.cart) });
      dispatch({ type: 'ordered', order });
    },
    callStaff() { chime(); dispatch({ type: 'staff-called' }); },

    // 말로 추천 / 말로 주문
    submit(text: string) {
      if (state.mode !== 'recommend') return act.orderBySpeech(text);
      if (state.chat.failed) return act.askRecommend(text);
      // 직원 AI가 생각하는 중에 이어 말하면 앞말과 합쳐 다시 보냅니다 (예전에는 여기서 확인 화면으로 새었음)
      if (state.chat.pending) return act.chatAmend(text);
      act.chatSay(text);
    },
    /** 직원 AI에게 한 마디. 바로 맞장구를 하고, 답이 오면 읽어 주고, 조건이 충분하면(done) 바로 추천 결과로 갑니다. */
    chatSay(text: string) {
      const trimmed = text.trim();
      if (!trimmed) return;
      dispatch({ type: 'chat/user', text: trimmed });
      void speak(ACKS[state.chat.turns.length % ACKS.length]);
      chatSend([...state.chat.turns, { role: 'user', text: trimmed }], trimmed);
    },
    /** 생각 중에 손님이 이어 말함: 진행 중인 요청은 버리고 합친 문장으로 다시 묻습니다 */
    chatAmend(text: string) {
      const trimmed = text.trim();
      const turns = [...state.chat.turns];
      const last = turns.length - 1;
      if (!trimmed || turns[last]?.role !== 'user') return;
      dispatch({ type: 'chat/amend', text: trimmed });
      turns[last] = { role: 'user', text: `${turns[last].text} ${trimmed}` };
      chatSend(turns, trimmed);
    },
    /** 손님이 직원 말을 끊음 (barge-in) */
    interrupted: () => dispatch({ type: 'chat/interrupted' }),
    askRecommend(text: string) {
      const local = recommender.understand(text);
      dispatch({ type: 'mode', mode: 'recommend' });
      dispatch({ type: 'conditions', conditions: local });
      act.go('review');
      // 서버 AI가 되면 더 정확한 해석으로 바꿔 끼웁니다. 늦거나 안 되면 규칙 해석을 그대로 씁니다.
      const token = ++aiToken.current;
      void recommender.refine(text, local).then(refined => {
        if (token !== aiToken.current) return;
        usage.ai(refined ? 'llm' : 'rules');
        if (refined) dispatch({ type: 'conditions/refined', from: local, to: refined });
      });
    },
    orderBySpeech(text: string) {
      const matches = matchMenus(text, [...catalog.menus]);
      if (!matches.length) return say(`‘${text}’에서 메뉴를 찾지 못했어요. 메뉴 이름으로 다시 말씀해 주세요.`);
      if (matches.length > 1) return say('한 번에 메뉴 하나씩 말씀해 주세요.');
      if (matches[0].soldOut) return say(`${matches[0].name}는 오늘 품절이에요. 다른 메뉴를 말씀해 주세요.`);
      const quantity = parseCount(text);
      if (quantity === null) return say('개수를 알아듣지 못했어요. "두 개"처럼 다시 말씀해 주세요.');
      if (quantity < 1 || quantity > 20) return say('1개부터 20개까지 주문할 수 있어요.');
      open({ kind: 'spoken', menu: matches[0], quantity });
    },
    patchConditions: (patch: Partial<Conditions>) => dispatch({ type: 'conditions/patch', patch }),
    /** 추천 결과로. 대화에서 바로 올 때는 아직 state에 반영되기 전의 조건·picks를 직접 받습니다. */
    showResults(conditions: Conditions = state.conditions, picks: string[] = state.chat.picks, pickReasons: PickReason[] = state.chat.pickReasons) {
      // 이유가 있는 새 서버면 대화로 고른 메뉴가 자리를 먼저 차지하고(pickReasons), 옛 서버면 가점만 줍니다(picks).
      const extra = pickReasons.length ? { pickReasons, context: state.chat.context } : { picks, context: state.chat.context };
      dispatch({ type: 'results', results: recommender.recommend(conditions, catalog.menus, extra) });
      act.go('results');
    },
    /** 카메라 불편 신호 제안에 답함 */
    comfortAnswer(yes: boolean) {
      if (yes) { usage.flag('large'); dispatch({ type: 'pref', name: 'large', on: true, byUser: false }); say('글씨를 크게 바꿨어요.'); }
      open(null);
    },
    takeResult(result: Recommendation) {
      addLines(result.lines.map(l => Cart.withDefaultOption(l, catalog)));
      act.go('menu');
      say('추천 조합을 담았어요. 아래 목록을 확인해주세요.');
    },
  };

  // 시연 단축키 Ctrl+Shift+1~4
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      const n = Number(e.code.replace('Digit', '')) - 1;
      if (!(n >= 0 && n < 4) || screen === 'payment' || screen === 'done') return;
      e.preventDefault(); usage.begin(); usage.flag('demo');
      if (screen === 'input' && state.mode === 'order') act.orderBySpeech(DEMO.order[n]);
      else act.askRecommend(DEMO.recommend[n]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return { state, catalog, total, count, camera: { state: face.state, error: face.error }, act };
}

export type Kiosk = ReturnType<typeof useKiosk>;
