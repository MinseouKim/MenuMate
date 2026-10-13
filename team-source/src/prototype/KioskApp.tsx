import { useEffect, useRef, useState } from 'react';
import menuData from './menu/menus.json';
import type { Conditions, Line, Menu, Recommendation, Screen } from './types';
import { EXCLUDE_OPTIONS, EXCLUDE_WORDS, KIND_OPTIONS, KIND_WORDS, KioskAI } from './recommendation';
import { MenuCard } from './MenuCard';
import { OrderList } from './OrderList';
import { Modal } from './Modal';
import { InputPanel } from './InputPanel';
import { Receipt } from './Receipt';
import { explain, matchMenus, parseCount } from './parse';
import { extractWithServer, mergeConditions } from './aiClient';
import { usage } from './usage';
import { receiptUrl, isLocalBase } from './receiptLink';
import QRCode from 'qrcode';
import { menuImage } from './menuImages';
import { addLines, findMenu, lineKey, linesTotal, suggestions, withDefaultOption } from './cart';
import { KEYPAD, matchesChosung } from './hangul';
import { Payment } from './Payment';
import type { PaymentResult } from './Payment';
import type { Order } from './Receipt';
import './styles/styles.css';
import './styles/kiosk.css';
import './styles/retail.css';
import './styles/cart-list.css';
import './styles/react.css';
import './styles/overrides.css'; // 반드시 마지막에 불러옵니다.
const menus: Menu[] = menuData;
const money = (n: number) => `${n.toLocaleString('ko-KR')}원`;
type Dialog = { kind: 'info'; menu: Menu } | { kind: 'home' | 'help' | 'idle' | 'settings' } | { kind: 'spoken' | 'option'; menu: Menu; quantity: number } | { kind: 'upsell'; items: Menu[] };
const CATEGORIES = [['duck-fish','베이징덕/생선'],['dimsum','딤섬'],['vegetable','야채'],['cold','냉채/샐러드'],['soup','스프/탕'],['chicken','치킨'],['pork','돼지고기'],['beef','소고기'],['noodle','면'],['rice','밥'],['seafood','해산물']];
const IDLE_MS = 60_000, IDLE_GRACE_MS = 20_000, DONE_MS = 45_000;
// 시연 모드(운영자 단축키 Ctrl+Shift+1~4): 전시장 소음으로 음성 인식이 어려울 때 준비한 문장을 말한 것처럼 넣습니다.
const DEMO = {
  recommend: ['두 명이고 새우는 빼고 딤섬 먹고 싶어요', '네 명이서 1인당 3만원으로 안 매운 거 추천해 주세요', '짬뽕 먹고 싶어요. 돼지고기는 빼 주세요', '혼자 왔어요. 만원 이하로 면 요리 부탁해요'],
  order: ['하가우 두 개 주세요', '홍게살 소롱포 세 개', '베이징덕 한 마리 주세요', '원심 유니짜장 하나요'],
};
// 스크롤바를 숨긴 가로 목록을 마우스 휠과 마우스 끌기로도 넘길 수 있게 합니다. 정리 함수를 돌려줍니다.
function enableDragScroll(nav: HTMLElement) {
  const onWheel = (e: WheelEvent) => { if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || nav.scrollWidth <= nav.clientWidth) return; e.preventDefault(); nav.scrollLeft += e.deltaY; };
  let startX = 0, startLeft = 0, pressed = false, dragged = false;
  const onMove = (e: PointerEvent) => { if (!pressed) return; const dx = e.clientX - startX; if (!dragged && Math.abs(dx) > 5) { dragged = true; nav.classList.add('dragging'); } if (dragged) nav.scrollLeft = startLeft - dx; };
  const onUp = () => { pressed = false; nav.classList.remove('dragging'); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  const onDown = (e: PointerEvent) => { if (e.pointerType !== 'mouse' || e.button !== 0) return; pressed = true; dragged = false; startX = e.clientX; startLeft = nav.scrollLeft; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); };
  // 끌어서 넘긴 경우에는 손을 뗀 자리의 탭이 눌리지 않게 합니다.
  const onClick = (e: MouseEvent) => { if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; } };
  const onDragStart = (e: DragEvent) => e.preventDefault();
  // 앞뒤로 더 있는 항목이 있으면 가장자리를 흐리게 해서 밀 수 있다는 것을 보여 줍니다.
  const hint = () => { nav.classList.toggle('more-start', nav.scrollLeft > 4); nav.classList.toggle('more-end', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4); };
  hint(); nav.addEventListener('scroll', hint, { passive: true }); window.addEventListener('resize', hint);
  nav.addEventListener('wheel', onWheel, { passive: false }); nav.addEventListener('pointerdown', onDown); nav.addEventListener('click', onClick, true); nav.addEventListener('dragstart', onDragStart);
  return () => { onUp(); nav.removeEventListener('scroll', hint); window.removeEventListener('resize', hint); nav.removeEventListener('wheel', onWheel); nav.removeEventListener('pointerdown', onDown); nav.removeEventListener('click', onClick, true); nav.removeEventListener('dragstart', onDragStart); };
}
// 직원 호출 알림음(짧은 두 음). 소리를 낼 수 없는 환경이면 조용히 넘어갑니다.
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!Ctx) return;
    const ctx = new Ctx();
    [880, 660].forEach((hz, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = hz; g.gain.setValueAtTime(.2, ctx.currentTime + i * .25); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + i * .25 + .22); o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * .25); o.stop(ctx.currentTime + i * .25 + .25); });
  } catch { /* 소리 없이 진행 */ }
}
// 진행 단계: 직접 주문과 말로 추천은 거치는 화면이 달라서 단계를 따로 보여 줍니다.
function steps(mode: 'order' | 'recommend', screen: Screen): { labels: string[]; current: number } {
  if (mode === 'recommend') return { labels: ['말로 요청', '추천 확인', '결제', '완료'], current: ({ notice: 0, input: 0, review: 1, results: 1, menu: 1, payment: 2, done: 3 } as Record<string, number>)[screen] ?? 0 };
  return { labels: ['메뉴 선택', '결제', '완료'], current: ({ menu: 0, input: 0, payment: 1, done: 2 } as Record<string, number>)[screen] ?? 0 };
}
function speak(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'ko-KR'; utterance.rate = .85;
  window.speechSynthesis.speak(utterance);
}
// 말한 문장에서 조건으로 읽은 부분을 색으로 표시합니다. 관람객이 '어떻게 알아들었는지' 바로 볼 수 있게 합니다.
function Transcript({ text, ai }: { text: string; ai: boolean }) {
  const marks = explain(text, KIND_WORDS, EXCLUDE_WORDS);
  const parts: (string | { text: string; type: string; label: string })[] = [];
  let at = 0;
  for (const m of marks) { if (m.start > at) parts.push(text.slice(at, m.start)); parts.push({ text: text.slice(m.start, m.end), type: m.type, label: m.label }); at = m.end; }
  if (at < text.length) parts.push(text.slice(at));
  return <div className="transcript explained"><p>“{parts.map((p, i) => typeof p === 'string' ? <span key={i}>{p}</span> : <mark key={i} className={`hl hl-${p.type}`}>{p.text}<small>{p.label}</small></mark>)}”</p>{ai && <span className="ai-badge">AI가 함께 해석했어요</span>}</div>;
}
export default function KioskApp() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [history, setHistory] = useState<Screen[]>([]);
  const [category, setCategory] = useState('duck-fish');
  const [lines, setLines] = useState<Line[]>([]);
  const [large, setLarge] = useState(false);
  const [voice, setVoice] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [low, setLow] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [staffCalled, setStaffCalled] = useState(false);
  const [mode, setMode] = useState<'order' | 'recommend'>('recommend');
  const [conditions, setConditions] = useState<Conditions>(() => KioskAI.extract(''));
  const [results, setResults] = useState<Recommendation[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [message, setMessage] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [qr, setQr] = useState('');
  const [aiUsed, setAiUsed] = useState(false);
  const aiToken = useRef(0);
  const orderCount = useRef(0);
  const content = useRef<HTMLDivElement>(null);
  const categories = useRef<HTMLElement>(null);
  const kindChips = useRef<HTMLDivElement>(null);
  const total = linesTotal(lines, menus);
  useEffect(() => { content.current?.scrollTo?.({ top: 0 }); }, [screen]);
  // 음성 안내: 화면 제목만이 아니라 추천 결과·결제 금액·주문 번호까지 읽어 줍니다(고령층·저시력 이용자용).
  const nameOf = (id: string) => menus.find(m => m.id === id)!.name;
  const spoken = ({
    welcome: '직접 메뉴를 고르거나, 말로 추천받을 수 있어요.',
    menu: '드실 메뉴를 누르면 주문에 담겨요.',
    notice: '말로 추천받기 시작, 또는 버튼으로 취향 고르기를 눌러 주세요.',
    input: mode === 'order' ? '버튼을 누른 채로 메뉴 이름과 개수를 말씀해 주세요.' : '버튼을 누른 채로 원하는 메뉴나 취향을 말씀해 주세요.',
    review: `${conditions.party}명으로 이해했어요. 맞으면 추천해 주세요 버튼을 눌러 주세요.`,
    results: results.length ? `추천 메뉴 ${results.length}가지예요. ${results.map((r, i) => `${i + 1}번, ${r.lines.map(l => `${nameOf(l.id)} ${l.quantity}개`).join(', ')}, ${money(r.total)}.`).join(' ')}` : '조건에 맞는 메뉴가 없어요. 조건을 바꿔 주세요.',
    payment: `결제 금액은 ${money(total)}이에요. 결제 방법을 선택해 주세요.`,
    done: order ? `주문이 완료되었어요. 주문 번호 ${Number(order.number)}번이에요.` : '주문이 완료되었어요.',
  } as Record<Screen, string>)[screen];
  useEffect(() => { if (voice && message) speak(message); }, [message, voice]);
  useEffect(() => {
    if (voice && window.speechSynthesis) {
      speak(spoken);
    }
    return () => window.speechSynthesis?.cancel();
  }, [spoken, voice]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      const n = Number(e.code.replace('Digit', '')) - 1;
      if (!(n >= 0 && n < 4) || ['payment', 'done'].includes(screen)) return;
      e.preventDefault(); usage.begin(); usage.flag('demo');
      if (screen === 'input' && mode === 'order') submit(DEMO.order[n]);
      else { setMode('recommend'); askRecommend(DEMO.recommend[n]); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    const cleanups = [categories.current, kindChips.current].filter((el): el is HTMLElement => !!el).map(enableDragScroll);
    return () => cleanups.forEach(cleanup => cleanup());
  }, [screen]);
  // 전시·매장에서 손님이 그냥 떠나면 다음 사람이 앞사람의 장바구니를 보지 않도록 처음으로 되돌립니다.
  useEffect(() => {
    if (screen === 'welcome') return;
    if (screen === 'done') { const t = setTimeout(() => reset('welcome', true), DONE_MS); return () => clearTimeout(t); }
    let timer = setTimeout(() => setDialog({ kind: 'idle' }), IDLE_MS);
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => setDialog({ kind: 'idle' }), IDLE_MS); };
    window.addEventListener('pointerdown', bump); window.addEventListener('keydown', bump);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', bump); window.removeEventListener('keydown', bump); };
  }, [screen]);
  useEffect(() => { if (dialog?.kind !== 'idle') return; const t = setTimeout(() => reset('welcome', true), IDLE_GRACE_MS); return () => clearTimeout(t); }, [dialog]);
  useEffect(() => { let alive = true; if (!order) return; QRCode.toString(receiptUrl(order), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(svg => { if (alive) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); }).catch(() => setQr('')); return () => { alive = false; }; }, [order]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3000); return () => clearTimeout(timer); }, [message]);
  // 지나온 화면을 기록해 두고 '이전 화면'은 그 기록으로 돌아갑니다. 이미 지나온 화면으로 가면 그 지점까지 기록을 되돌립니다.
  function go(next: Screen) {
    if (next === screen) return;
    if (screen === 'welcome') usage.begin();
    if (next === 'menu' && screen === 'welcome') usage.path('menu');
    if (next === 'notice' || next === 'review') usage.path('recommend');
    setHistory(h => { const i = h.indexOf(next); return i >= 0 ? h.slice(0, i) : [...h, screen]; });
    setScreen(next);
  }
  function back() {
    setScreen(history[history.length - 1] ?? 'welcome'); setHistory(h => h.slice(0, -1));
  }
  // fresh: 손님이 떠나서 자동으로 초기화할 때. 다음 손님을 위해 큰 글씨·음성 안내도 끕니다.
  function reset(next: Screen = 'welcome', fresh = false) {
    if (next !== 'done') usage.finish('abandoned');
    if (fresh) { setLarge(false); setVoice(false); setContrast(false); setLow(false); }
    setSearch(null); setStaffCalled(false);
    aiToken.current++; setAiUsed(false);
    setHistory([]); setLines([]); setConditions(KioskAI.extract('')); setResults([]); 
    // 완료 화면은 지나온 경로(직접 주문/말로 추천)의 진행 단계를 그대로 보여 주도록 mode를 유지합니다.
    setCategory('duck-fish'); if (next !== 'done') setMode('recommend'); setDialog(null); setMessage(''); setScreen(next);
    if (next !== 'done') { setOrder(null); setQr(''); }
  }
  // 결제가 끝나면 영수증에 보여 줄 주문을 만들고 장바구니를 비웁니다. 결제 연동 시 주문 번호는 서버 값으로 바꾸면 됩니다.
  function complete(payment: PaymentResult) {
    const items = lines.map(l => { const m = findMenu(menus, l.id); return { id: m.id, name: m.name, quantity: l.quantity, price: m.price, option: l.option }; });
    setOrder({ number: String(++orderCount.current).padStart(3, '0'), items, total, paidAt: new Date(), payment });
    usage.finish('ordered', { total, items: lines.reduce((n, l) => n + l.quantity, 0) });
    reset('done');
  }
  function add(items: Line[]) { setLines(previous => addLines(previous, items)); }
  // 카드·설명 팝업·말로 주문에서 메뉴를 담을 때: 품절이면 막고, 옵션이 있으면 먼저 고르게 합니다.
  function pick(menu: Menu, quantity = 1) {
    if (menu.soldOut) { setMessage(`${menu.name}는 오늘 품절이에요.`); setDialog(null); return false; }
    if (menu.options?.length) { setDialog({ kind: 'option', menu, quantity }); return false; }
    add([{ id: menu.id, quantity }]); setMessage(`${menu.name} ${quantity}개를 담았어요`); setDialog(null); return true;
  }
  // 주문하기: 곁들일 메뉴가 있으면 결제 전에 한 번 제안하고, 없으면 바로 결제로 갑니다.
  function checkout() {
    setMessage('');
    const items = suggestions(lines, menus);
    if (items.length) setDialog({ kind: 'upsell', items }); else go('payment');
  }
  function submit(text: string) {
    if (mode === 'recommend') { askRecommend(text); return; }
    orderBySpeech(text);
  }
  function askRecommend(text: string) {
    {
      const local = KioskAI.extract(text); setConditions(local); setAiUsed(false); go('review');
      // 서버 AI가 설정돼 있으면 더 정확한 해석으로 바꿔 끼웁니다. 4초 안에 답이 없으면 규칙 해석을 그대로 씁니다.
      const token = ++aiToken.current;
      void extractWithServer(text).then(ai => { if (token !== aiToken.current) return; usage.ai(ai ? 'llm' : 'rules'); if (ai) { setConditions(c => JSON.stringify(c) === JSON.stringify(local) ? mergeConditions(c, ai) : c); setAiUsed(true); } });
    }
  }
  function orderBySpeech(text: string) {
    const matches = matchMenus(text, menus);
    if (!matches.length) { setMessage(`‘${text}’에서 메뉴를 찾지 못했어요. 메뉴 이름으로 다시 말씀해 주세요.`); return; }
    if (matches.length > 1) { setMessage('한 번에 메뉴 하나씩 말씀해 주세요.'); return; }
    if (matches[0].soldOut) { setMessage(`${matches[0].name}는 오늘 품절이에요. 다른 메뉴를 말씀해 주세요.`); return; }
    const quantity = parseCount(text);
    if (quantity === null) { setMessage('개수를 알아듣지 못했어요. "두 개"처럼 다시 말씀해 주세요.'); return; }
    if (quantity < 1 || quantity > 20) { setMessage('1개부터 20개까지 주문할 수 있어요.'); return; }
    setDialog({kind:'spoken',menu:matches[0],quantity});
  }
  const patch = (update: Partial<Conditions>) => setConditions(c => ({ ...c, ...update }));
  const showDock = !['welcome','done','payment'].includes(screen) && (screen === 'menu' || lines.length > 0);
  return <>
    <main><section className={`kiosk screen-${screen} ${large ? 'large' : ''} ${contrast ? 'contrast' : ''} ${low ? 'low' : ''}`}>
      {low && <div className="low-spacer"><span>낮은 화면 모드예요. 버튼을 아래로 모았어요.</span></div>}
      <header className="kiosk-head">
        <a className="brand" href="#" onClick={e => { e.preventDefault(); if (lines.length) setDialog({kind:'home'}); else reset(); }}>menumate</a>
        <div className="tools"><button aria-pressed={large} onClick={() => { if (!large) usage.flag('large'); setLarge(!large); }}>{large ? '기본 글씨' : '글자 크게'}</button><button aria-pressed={voice} onClick={() => { if (!voice) usage.flag('voiceGuide'); setVoice(!voice); }}>음성 안내 {voice ? '켜짐' : '꺼짐'}</button><button onClick={() => setDialog({kind:'settings'})}>화면 설정</button></div>
      </header>
      {screen !== 'welcome' && (() => { const st = steps(mode, screen); return <div className="progress" aria-label="주문 진행 단계">{st.labels.map((text,i) => <span key={text} className={i === st.current ? 'current' : i < st.current ? 'passed' : ''} aria-current={i === st.current ? 'step' : undefined}><b>{`0${i+1}`}</b>{text}</span>)}</div>; })()}
      {screen === 'menu' && <div className="menu-heading">
        <div className="menu-heading-title"><h1>메뉴를 골라주세요</h1><div className="heading-actions"><button className="voice-shortcut search-shortcut" aria-pressed={search !== null} onClick={() => setSearch(search === null ? '' : null)}>{search === null ? '메뉴 찾기' : '찾기 닫기'}</button><button className="voice-shortcut" onClick={() => { setMode('order'); go('input'); }}>말로 주문</button></div></div>
        {search !== null ? <div className="chosung-search" role="group" aria-label="초성으로 메뉴 찾기"><div className="chosung-query" aria-live="polite">{search ? <><strong>{search}</strong><span>초성으로 찾는 중</span></> : <span>메뉴 이름의 첫 자음을 눌러 주세요. 예: 짬뽕 → ㅉ ㅃ</span>}</div><div className="chosung-keys">{KEYPAD.map(k => <button key={k} onClick={() => setSearch(search + k)}>{k}</button>)}<button className="chosung-del" aria-label="한 글자 지우기" onClick={() => setSearch(search.slice(0, -1))}>⌫</button><button className="chosung-del" onClick={() => setSearch('')}>전체 지우기</button></div></div> :
        <nav ref={categories} className="menu-categories" aria-label="메뉴 종류">{CATEGORIES.map(([id,title]) => <button key={id} className={`category-tab ${category === id ? 'selected' : ''}`} aria-pressed={category === id} onClick={e => { setCategory(id); content.current?.scrollTo?.({ top: 0 }); e.currentTarget.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }); }}>{title}</button>)}</nav>}
      </div>}
      <div className="screen" ref={content}>
        {screen === 'welcome' && <div className="welcome"><div className="eyebrow">우루루 본점</div><h1>무엇을<br/>도와드릴까요?</h1><p className="muted">주문 방법을 선택해 주세요.</p><div className="choice-grid">
          <button className="choice" onClick={() => { setMode('order'); go('menu'); }}><span className="number">직접 고르기</span><div><span className="choice-title">메뉴 보고 주문</span><small>메뉴와 가격을 한눈에 확인해요</small></div><span className="choice-icon" aria-hidden="true">▦</span></button>
          <button className="choice" onClick={() => { setMode('recommend'); go('notice'); }}><span className="number">고민될 때</span><div><span className="choice-title">말로 추천받기</span><small>원하는 맛을 말하면 함께 골라드려요</small></div><span className="choice-icon" aria-hidden="true">✦</span></button>
        </div></div>}
        {screen === 'menu' && (() => { const shown = search !== null ? (search ? menus.filter(m => matchesChosung(m.name, search)) : []) : menus.filter(m => m.category === category); return search !== null && search && !shown.length ? <p className="search-empty">‘{search}’로 시작하는 메뉴가 없어요.</p> : <div className="menu-grid">{shown.map(m => <MenuCard key={m.id} menu={m} quantity={lines.filter(l => l.id === m.id).reduce((n, l) => n + l.quantity, 0)} onSelect={() => pick(m)} onInfo={() => setDialog({kind:'info',menu:m})}/>)}</div>; })()}
        {screen === 'notice' && <><div className="eyebrow">메뉴 추천 · 이용 안내</div><h1>취향을 알려주시면<br/>메뉴를 찾아드려요</h1><p className="muted">인원, 원하는 맛, 빼고 싶은 재료를 말씀해 주세요.</p><div className="device-notice"><div className="device-row"><strong>마이크</strong><span>말하기 버튼을 누르고 있는 동안만 사용해요. 목소리는 저장하지 않아요.</span></div><div className="device-row"><strong>말하기 어려우면</strong><span>버튼으로도 똑같이 추천받을 수 있어요.</span></div></div><div className="actions vertical"><button className="primary" onClick={() => go('input')}>말로 추천받기 시작</button><button className="secondary" onClick={() => { setConditions(KioskAI.extract('')); go('review'); }}>버튼으로 취향 고르기</button></div></>}
        {screen === 'input' && <InputPanel mode={mode} onSubmit={submit} onTouch={() => { if (mode === 'order') go('menu'); else { setConditions(KioskAI.extract('')); go('review'); } }}/>} 
        {screen === 'review' && <><div className="eyebrow">취향 확인</div><h1>이렇게 이해했어요</h1>{conditions.raw && <Transcript text={conditions.raw} ai={aiUsed}/>}<form onSubmit={e => { e.preventDefault(); setResults(KioskAI.recommend(conditions,menus)); go('results'); }}><div className="field-group" role="group" aria-labelledby="party-label"><span className="field" id="party-label">몇 분이 드시나요?</span><div className="stepper"><button type="button" aria-label="인원 줄이기" disabled={conditions.party<=1} onClick={() => patch({party:conditions.party-1})}>−</button><output aria-live="polite" aria-label="인원">{conditions.party}명</output><button type="button" aria-label="인원 늘리기" disabled={conditions.party>=6} onClick={() => patch({party:conditions.party+1})}>+</button></div></div>
          <div className="field-group" role="group" aria-labelledby="spicy-label"><span className="field" id="spicy-label">어느 정도 맵게 드시나요?</span><div className="pills">{[[null,'상관없어요'],[0,'안 매운맛'],[1,'약간 매운맛'],[2,'매운맛'],[3,'아주 매운맛']].map(([value,label]) => <button type="button" key={String(label)} className={`pill ${conditions.spicy === value ? 'selected' : ''}`} aria-pressed={conditions.spicy === value} onClick={() => patch({spicy:value as number | null})}>{label}</button>)}</div></div>
          <div className="field-group" role="group" aria-labelledby="kind-label"><span className="field" id="kind-label">어떤 종류가 좋으세요?</span><div ref={kindChips} className="menu-categories choice-chips">{['상관없음',...KIND_OPTIONS].map(s => <button type="button" key={s} className={`category-tab ${conditions.kind === s ? 'selected' : ''}`} aria-pressed={conditions.kind === s} onClick={() => patch({kind:s})}>{s}</button>)}</div></div>
          <div className="field-group" role="group" aria-labelledby="budget-label"><span className="field" id="budget-label">1인당 예산</span><div className="pills">{conditions.totalBudget ? <button type="button" className="pill selected" aria-pressed="true">총 {money(conditions.totalBudget)} 이하</button> : null}{[...new Set([null,10000,20000,30000,50000,...(conditions.budget && !conditions.totalBudget ? [conditions.budget] : [])])].sort((x,y) => (x ?? 0) - (y ?? 0)).map(value => { const on = !conditions.totalBudget && conditions.budget === value; return <button type="button" key={String(value)} className={`pill ${on ? 'selected' : ''}`} aria-pressed={on} onClick={() => patch({budget:value,totalBudget:null})}>{value ? `${value/10000}만원 이하` : '상관없음'}</button>; })}</div>{conditions.totalBudget ? <p className="muted">말씀하신 총예산 {money(conditions.totalBudget)}을 {conditions.party}명이 나눠요. 1인당 약 {money(Math.round(conditions.totalBudget/conditions.party))}이에요.</p> : null}</div>
        <span className="field">빼고 싶은 재료</span><div className="pills">{[...new Set([...EXCLUDE_OPTIONS,...conditions.exclude])].map(s => <button className={`pill ${conditions.exclude.includes(s)?'selected':''}`} type="button" key={s} aria-pressed={conditions.exclude.includes(s)} onClick={() => patch({exclude:conditions.exclude.includes(s)?conditions.exclude.filter(x => x!==s):[...conditions.exclude,s]})}>{s}</button>)}</div><div className="notice warn">재료 정보가 완전하지 않을 수 있어요. 알레르기가 있다면 직원에게 확인해 주세요.</div><div className="actions"><button className="primary">맞아요, 추천해주세요</button><button className="secondary" type="button" onClick={() => { go('input'); }}>다시 말할게요</button></div></form></>}
        {screen === 'results' && <><div className="eyebrow">메뉴 추천</div><h1>이 메뉴는 어떠세요?</h1><p className="muted">{conditions.party}명 · {conditions.exclude.length ? `${conditions.exclude.join(', ')} 제외` : '선택한 취향 기준'}</p>{results.length ? results.map((r,i) => <article className={`result ${r.set ? 'result-set' : ''}`} key={`${i}-${r.main.id}`}><div className="rank">추천 0{i+1}{r.set && <span className="set-badge">{r.light ? '식사 + 곁들임' : '중식 한상'}</span>}</div>{r.set ? <><div className="result-top"><h2>{r.light ? (conditions.party === 1 ? '혼자 드시는 구성' : `${conditions.party}명 가벼운 구성`) : `${conditions.party}명 한상 구성`}</h2><strong className="price">{money(r.total)}</strong></div><ul className="set-lines">{r.lines.map(l => { const m = menus.find(x => x.id === l.id)!; return <li key={l.id}><span>{m.name}</span><b>{l.quantity}개</b><small>{money(m.price * l.quantity)}</small></li>; })}</ul></> : <div className="result-top"><div><h2>{r.lines.map(l=>menus.find(m=>m.id===l.id)!.name).join(' + ')}</h2><p className="muted">{r.lines.map(l=>`${l.quantity}개`).join(' + ')}</p></div><strong className="price">{money(r.total)}</strong></div>}<ul className="reasons">{r.reasons.map(s=><li key={s}>{s}</li>)}</ul><button className="primary" onClick={() => { add(r.lines.map(l => withDefaultOption(l, menus))); go('menu'); setMessage('추천 조합을 담았어요. 아래 목록을 확인해주세요.'); }}>이 조합 담기</button></article>) : <div className="notice warn">현재 조건에 맞는 조합이 없어요. 조건을 수정해 주세요.</div>}<div className="notice warn">알레르기·교차접촉 여부는 매장에 직접 확인해 주세요.</div><div className="actions"><button className="secondary" onClick={()=>go('review')}>조건 수정하기</button><button className="secondary" onClick={()=>go('menu')}>직접 메뉴 고르기</button></div></>}
        {screen === 'done' && <div className="done"><div className="done-mark">✓</div><h1>주문이 완료되었어요</h1>{order && <div className="order-number"><span>주문 번호</span><strong>{order.number}</strong><p>{order.payment?.dine === '포장' ? '포장 주문이에요. 번호가 불리면 카운터에서 받아 가세요.' : '매장 식사 주문이에요. 번호가 불리면 카운터에서 받아 가세요.'}</p></div>}<p className="muted">영수증은 아래 QR 코드로 휴대폰에서 받을 수 있어요.</p>{order && <Receipt order={order}/>}{order && qr && <div className="receipt-qr"><img src={qr} alt="휴대폰으로 영수증 받기 QR 코드"/><div><strong>휴대폰으로 영수증 받기</strong><p>카메라로 QR 코드를 찍으면 영수증이 열려요.</p>{import.meta.env.DEV && isLocalBase() && <p className="receipt-qr-warn">운영자 안내: 지금 주소는 이 컴퓨터 안에서만 열려요. 휴대폰에서 열리게 하려면 배포 주소를 VITE_RECEIPT_BASE_URL에 넣어 주세요.</p>}</div></div>}<button className="primary" onClick={()=>reset('welcome', true)}>처음 화면으로 돌아가기</button><p className="demo-note">전시 체험용 주문이라 실제 결제는 되지 않았어요.</p></div>}
        {screen === 'payment' && <Payment lines={lines} menus={menus} onBack={() => go('menu')} onComplete={complete}/>}
      </div>
      {showDock && <OrderList message={screen === 'menu' ? message : ''} lines={lines} menus={menus} onQuantity={(key,delta)=>setLines(ls=>ls.map(l=>lineKey(l)===key?{...l,quantity:Math.max(1,l.quantity+delta)}:l))} onRemove={key=>setLines(ls=>ls.filter(l=>lineKey(l)!==key))} onOrder={checkout}/>} 
      <footer className="kiosk-foot"><button onClick={()=>{ if(screen==='done') reset(); else if(screen!=='welcome') setDialog({kind:'home'}); }}>처음으로</button><button disabled={screen==='welcome'||screen==='done'} onClick={back}>이전 화면</button><button onClick={()=>{ setStaffCalled(false); setDialog({kind:'help'}); }}>직원 호출 · 도움</button></footer>
    {message && !(showDock && screen === 'menu') && <div id="toast" className="show" role="status">{message}</div>}
    {dialog && <Modal title={dialog.kind==='info'?dialog.menu.name:dialog.kind==='home'?'처음으로 돌아갈까요?':dialog.kind==='spoken'?'이 메뉴를 담을까요?':dialog.kind==='idle'?'계속 주문하시겠어요?':dialog.kind==='option'?`${dialog.menu.name} 옵션을 골라 주세요`:dialog.kind==='upsell'?'함께 드시면 좋아요':dialog.kind==='settings'?'화면 설정':'도움이 필요하세요?'} aside={dialog.kind==='info' && <span className="info-price">{money(dialog.menu.price)}</span>} large={large} onClose={()=>setDialog(null)}>
      {dialog.kind==='info' && <>{(() => { const src = menuImage(dialog.menu.id); return src ? <img className="info-photo" src={src} alt=""/> : null; })()}<p className="info-description">{dialog.menu.description || [...dialog.menu.flavor,...dialog.menu.texture].join(' · ') || '메뉴 설명이 아직 없습니다.'}</p>{!!dialog.menu.reviews?.length && <section className="info-reviews" aria-labelledby="info-reviews-title"><h3 id="info-reviews-title">리뷰</h3><ul>{dialog.menu.reviews.slice(0,3).map(review => <li key={review}>{review}</li>)}</ul></section>}<p className="info-note">알레르기 재료는 직원에게 확인해 주세요.</p>{screen === 'menu' && (dialog.menu.soldOut ? <p className="sold-out-note">오늘 품절된 메뉴예요.</p> : <button className="primary" onClick={()=>pick(dialog.menu)}>이 메뉴 담기</button>)}</>}
      {dialog.kind==='home' && <><p>담은 메뉴와 입력한 요청이 모두 지워집니다.</p><button className="primary" onClick={()=>reset()}>초기화하기</button></>}
      {dialog.kind==='spoken' && <><p>{dialog.menu.name} {dialog.quantity}개 · {money(dialog.menu.price*dialog.quantity)}</p><button className="primary" onClick={()=>{ const done = pick(dialog.menu, dialog.quantity); if (done) go('menu'); }}>확인하고 담기</button><button className="secondary" onClick={()=>setDialog(null)}>다시 말할게요</button></>}
      {dialog.kind==='idle' && <><p>{IDLE_GRACE_MS/1000}초 뒤 처음 화면으로 돌아가요. 담은 메뉴는 지워져요.</p><button className="primary" onClick={()=>setDialog(null)}>계속 주문하기</button></>}
      {dialog.kind==='option' && <><p>{dialog.quantity}개 · {money(dialog.menu.price*dialog.quantity)}</p><div className="option-choices">{dialog.menu.options!.map(op => <button key={op} className="primary" onClick={()=>{ add([{id:dialog.menu.id,quantity:dialog.quantity,option:op}]); setMessage(`${dialog.menu.name}(${op}) ${dialog.quantity}개를 담았어요`); setDialog(null); if (screen === 'input') go('menu'); }}>{op}</button>)}</div></>}
      {dialog.kind==='upsell' && <><p>담으신 메뉴와 잘 어울리는 메뉴예요.</p><ul className="upsell-list">{dialog.items.map(m => <li key={m.id}><span><strong>{m.name}</strong><small>{money(m.price)}</small></span><button className="secondary" disabled={lines.some(l => l.id === m.id)} onClick={()=>{ add([withDefaultOption({id:m.id,quantity:1}, menus)]); setMessage(`${m.name} 1개를 담았어요`); }}>{lines.some(l => l.id === m.id) ? '담았어요' : '추가'}</button></li>)}</ul><button className="primary" onClick={()=>{ setDialog(null); go('payment'); }}>결제하러 가기</button></>}
      {dialog.kind==='settings' && <div className="settings-list">{([['글자 크게', large, () => { if (!large) usage.flag('large'); setLarge(!large); }], ['음성 안내', voice, () => { if (!voice) usage.flag('voiceGuide'); setVoice(!voice); }], ['고대비 화면', contrast, () => setContrast(!contrast)], ['낮은 화면 (휠체어·어린이)', low, () => setLow(!low)]] as [string, boolean, () => void][]).map(([label, on, toggle]) => <button key={label} className={`setting ${on ? 'on' : ''}`} aria-pressed={on} onClick={toggle}><span>{label}</span><b>{on ? '켜짐' : '꺼짐'}</b></button>)}<button className="primary" onClick={()=>setDialog(null)}>확인</button></div>}
      {dialog.kind==='help' && (staffCalled ? <><p className="staff-called">키오스크에서 호출 알림음을 울렸어요. 가까운 직원이 오지 않으면 손을 들어 알려 주세요.</p><button className="primary" onClick={()=>setDialog(null)}>확인</button></> : <><p>메뉴 카드를 누르면 주문에 담겨요. 설명 아이콘(ⓘ)은 메뉴 설명을 열고, 아래 목록에서 개수를 바꾸거나 지울 수 있어요.</p><button className="primary" onClick={()=>{ chime(); setStaffCalled(true); }}>직원 호출하기</button></>)}
    </Modal>}
    </section></main>
  </>;
}
