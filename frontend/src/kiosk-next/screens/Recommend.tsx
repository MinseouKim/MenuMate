// 말로 추천(간편주문) 길의 네 화면: 이용 안내 → 말하기(직원 AI와 대화) → 이해한 내용 확인 → 추천 결과.
// 직원 AI 서버가 있으면 말하기 화면이 대화로 바뀌고, 조건이 충분해지면 확인 화면 없이 바로 추천 결과로 갑니다.
// 대화·결과 화면은 3안(layout.ts: a 직원과 마주 앉기 / b 눌러서 답하기 / c 한눈에 정리) 중 하나로 그립니다. 상태·로직은 같고 그리는 방식만 다릅니다.
// 직원 AI의 말과 질문은 서버(Gemini)가 손님 말에 맞춰 만듭니다. 화면의 버튼은 "말 대신 누르는" 입력 지름길일 뿐 정해진 답이 아닙니다.
import { useEffect, useRef } from 'react';
import { explain } from '../../prototype/parse';
import { EXCLUDE_OPTIONS, EXCLUDE_WORDS, KIND_OPTIONS, KIND_WORDS } from '../../prototype/recommendation';
import { askingOf, recommendLayout, type Asking } from '../layout';
import { lastAssistant, type Kiosk } from '../useKiosk';
import { useSpeechInput } from '../useSpeechInput';
import { whenSilent } from '../speech';
import { Photo } from '../ui/Photo';
import { money, type Conditions, type KioskContext, type Recommendation } from '../types';

const TIME_KO: Record<KioskContext['timeOfDay'], string> = { morning: '아침', lunch: '점심', afternoon: '오후', evening: '저녁', night: '밤' };
/** "비 오는 저녁 · 12도" 같은 한 줄. 상황을 모르면 null */
export function contextLine(ctx: KioskContext | null): string | null {
  if (!ctx) return null;
  const parts = [TIME_KO[ctx.timeOfDay]];
  if (ctx.weather) parts.push(`${ctx.weather.label} ${Math.round(ctx.weather.tempC)}도`);
  if (ctx.crowd === 'high') parts.push('매장이 붐벼요');
  return parts.join(' · ');
}

export function Notice({ kiosk }: { kiosk: Kiosk }) {
  return (
    <div className="kx-page">
      <div className="kx-eyebrow">메뉴 추천 · 이용 안내</div>
      <h1>취향을 알려주시면<br />메뉴를 찾아드려요</h1>
      <p className="kx-muted">인원, 원하는 맛, 빼고 싶은 재료를 말씀해 주세요.</p>
      <dl className="kx-notice">
        <div><dt>마이크</dt><dd>말하기 버튼을 누른 뒤 다시 누를 때까지만 들어요. 목소리는 저장하지 않아요.</dd></div>
        <div><dt>카메라</dt><dd>글자 크기·음성 안내 같은 화면 설정을 맞추려고 얼굴 나이대와 불편 신호(가까이 옴·찌푸림)만 봐요. 영상은 화면에 보이지 않고 저장하지 않아요.</dd></div>
        <div><dt>대화</dt><dd>말씀하신 내용은 메뉴를 고르는 데만 쓰고 저장하지 않아요. 날씨와 시간대를 참고해 추천해요.</dd></div>
      </dl>
      <div className="kx-actions"><button className="kx-btn kx-btn-primary" onClick={() => kiosk.act.go('input')}>말로 추천받기 시작</button></div>
    </div>
  );
}

const EXAMPLES = ['두 명이고 베이징덕 먹고 싶어요', '딤섬 먹고 싶어요. 새우는 빼주세요', '2명이요. 안 매운 면 요리로 1인당 15000원 이내로 부탁해요'];
/** 대화 중 터치로 답할 수 있는 짧은 말들 (말하기가 어려운 손님용). 직원 AI가 무엇을 묻는지에 따라 바뀝니다. */
const REPLIES: Record<Asking, string[]> = {
  party: ['혼자 왔어요', '두 명이에요', '세 명이에요', '네 명 이상이에요'],
  spicy: ['매운 건 못 먹어요', '조금 매운 건 괜찮아요', '매운 거 좋아해요', '아무거나 괜찮아요'],
  kind: ['면 요리요', '밥 요리요', '딤섬이요', '고기 요리요'],
  exclude: ['빼는 재료 없어요', '해산물은 빼 주세요', '돼지고기는 빼 주세요', '견과류는 빼 주세요'],
  // 인원·맵기·종류·재료가 아닌 질문("따뜻한 국물 어떠세요?")은 예/아니요로 답합니다.
  other: ['네, 좋아요', '아니요, 다른 걸로요', '잘 모르겠어요', '아무거나 추천해 주세요'],
};
/** 안 2의 큰 선택 카드. 큰 글자(숫자·한 단어)와 그 아래 설명, 누르면 보낼 문장 */
const CARDS: Record<Asking, { big: string; label: string; say: string }[]> = {
  party: [
    { big: '1', label: '혼자 왔어요', say: '혼자 왔어요' },
    { big: '2', label: '두 명이에요', say: '두 명이에요' },
    { big: '3', label: '세 명이에요', say: '세 명이에요' },
    { big: '4+', label: '네 명 이상', say: '네 명 이상이에요' },
  ],
  spicy: [
    { big: '안 매움', label: '매운 건 못 먹어요', say: '매운 건 못 먹어요' },
    { big: '조금', label: '약간 매콤한 정도', say: '조금 매운 건 괜찮아요' },
    { big: '매움', label: '매운 거 좋아해요', say: '매운 거 좋아해요' },
    { big: '상관없음', label: '아무거나 괜찮아요', say: '맵기는 상관없어요' },
  ],
  kind: [
    { big: '면', label: '짬뽕·탕면·볶음면', say: '면 요리요' },
    { big: '밥', label: '볶음밥·덮밥', say: '밥 요리요' },
    { big: '딤섬', label: '소룡포·하가우', say: '딤섬이요' },
    { big: '요리', label: '고기·해산물 요리', say: '고기나 해산물 요리요' },
  ],
  exclude: [
    { big: '없음', label: '다 잘 먹어요', say: '빼는 재료 없어요' },
    { big: '해산물', label: '새우·게 포함', say: '해산물은 빼 주세요' },
    { big: '돼지고기', label: '', say: '돼지고기는 빼 주세요' },
    { big: '견과류', label: '땅콩 등', say: '견과류는 빼 주세요' },
  ],
  other: [
    { big: '네', label: '좋아요', say: '네, 좋아요' },
    { big: '아니요', label: '다른 걸로요', say: '아니요, 다른 걸로요' },
    { big: '모름', label: '잘 모르겠어요', say: '잘 모르겠어요' },
    { big: '추천', label: '아무거나 추천해 주세요', say: '아무거나 추천해 주세요' },
  ],
};

/** 말하기(STT)와 "직원 AI가 말을 마치면 마이크 자동 시작"을 세 안이 같이 씁니다. */
function useTalk(kiosk: Kiosk) {
  const { act, state } = kiosk;
  const speech = useSpeechInput(act.submit);
  const { chat } = state;
  const talking = state.mode === 'recommend' && !chat.failed;
  const assistant = lastAssistant(state);
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!talking || !assistant || chat.pending || chat.done || spokenFor.current === assistant) return;
    spokenFor.current = assistant;
    let alive = true;
    void whenSilent().then(() => { if (alive && !speech.listening) speech.start(); });
    return () => { alive = false; };
  }, [assistant, talking, chat.pending, chat.done]); // eslint-disable-line react-hooks/exhaustive-deps
  // 서버가 질문 종류를 알려 주면 그대로, 옛 서버면 문장으로 추정합니다.
  return { speech, talking, assistant, asking: chat.asking ?? askingOf(assistant), chat, ctxLine: contextLine(chat.context) };
}

export function Input({ kiosk }: { kiosk: Kiosk }) {
  const talk = useTalk(kiosk);
  if (!talk.talking) return <LegacyInput kiosk={kiosk} talk={talk} />;
  if (recommendLayout === 'b') return <ChatB kiosk={kiosk} talk={talk} />;
  if (recommendLayout === 'c') return <ChatC kiosk={kiosk} talk={talk} />;
  return <ChatA kiosk={kiosk} talk={talk} />;
}

type Talk = ReturnType<typeof useTalk>;

/** 말하기 버튼. 세 안에서 크기만 다르고 동작은 같습니다. */
function TalkButton({ talk, idle, className = '' }: { talk: Talk; idle: string; className?: string }) {
  const { speech, chat } = talk;
  return (
    <>
      <button className={`kx-talk ${className} ${speech.listening ? 'listening' : ''}`} aria-pressed={speech.listening} disabled={chat.pending} onClick={speech.toggle}>
        {speech.listening && <span className="kx-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>}
        <span>{speech.listening ? '듣고 있어요 · 눌러서 끝내기' : idle}</span>
        <small>{speech.listening ? (speech.heard ? `“${speech.heard}”` : '다 말씀하셨으면 한 번 더 눌러 주세요') : '말을 마치면 한 번 더 눌러 주세요'}</small>
      </button>
      {speech.error && <p role="alert" className="kx-alert">{speech.error}</p>}
      {!speech.error && speech.notice && <p role="status">{speech.notice}</p>}
    </>
  );
}

/** 직원 AI 아바타 */
const Avatar = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => <span className={`kx-avatar kx-avatar-${size}`} aria-hidden="true">우</span>;

// ── 안 1 · 직원과 마주 앉기: 큰 말풍선, 전폭 말하기 버튼 ─────────────────────────
function ChatA({ kiosk, talk }: { kiosk: Kiosk; talk: Talk }) {
  const { act } = kiosk;
  const { chat, assistant, asking, ctxLine } = talk;
  const lastUser = [...chat.turns].reverse().find(t => t.role === 'user')?.text ?? null;
  return (
    <div className="kx-page kx-rec kx-rec-a">
      <div className="kx-rec-head"><span className="kx-eyebrow">직원 AI와 대화</span>{ctxLine && <span className="kx-context">{ctxLine}</span>}</div>
      <section className="kx-staff">
        <Avatar size="lg" />
        <div className="kx-staff-body">
          <span className="kx-staff-name">우루루 직원 AI</span>
          <div className="kx-bubble kx-bubble-ai kx-bubble-big" aria-live="polite">{assistant ?? (chat.pending ? '잠시만요, 직원 AI를 부르고 있어요…' : '안녕하세요!')}</div>
        </div>
      </section>
      {lastUser && <div className="kx-bubble kx-bubble-me">{lastUser}</div>}
      {chat.pending && assistant && <div className="kx-bubble kx-bubble-ai kx-bubble-wait">생각하고 있어요…</div>}
      <div className="kx-grow" />
      <TalkButton talk={talk} idle="눌러서 대답하기" className="kx-talk-wide" />
      <div className="kx-examples">
        <span className="kx-muted">말 대신 눌러서 답하기</span>
        <div className="kx-replies">{REPLIES[asking].map(t => <button key={t} className="kx-btn kx-btn-ghost" disabled={chat.pending} onClick={() => act.submit(t)}>{t}</button>)}</div>
      </div>
      <div className="kx-actions"><button className="kx-btn kx-btn-quiet" onClick={() => act.go('menu')}>메뉴판에서 직접 고르기</button></div>
    </div>
  );
}

// ── 안 2 · 눌러서 답하기: 질문에 맞는 큰 선택 카드가 주 경로, 말하기는 보조 ───────────
function ChatB({ kiosk, talk }: { kiosk: Kiosk; talk: Talk }) {
  const { act } = kiosk;
  const { chat, assistant, asking, ctxLine } = talk;
  const answered = chat.turns.filter(t => t.role === 'user').length;
  // 첫 문장(상황 인사)과 질문을 나눠, 질문만 크게 보여 줍니다.
  const [lead, question] = splitQuestion(assistant);
  return (
    <div className="kx-page kx-rec kx-rec-b">
      <div className="kx-dots" aria-label="질문 진행">
        {[0, 1, 2].map(i => <i key={i} className={i < answered ? 'on' : ''} />)}
        <span>{chat.done ? '질문 끝' : `질문 ${Math.min(answered + 1, 3)} / 3`}{ctxLine ? ` · ${ctxLine}` : ''}</span>
      </div>
      <section className="kx-staff">
        <Avatar size="lg" />
        <div className="kx-staff-body" aria-live="polite">
          {lead && <span className="kx-staff-lead">{lead}</span>}
          <h1>{question ?? (chat.pending ? '잠시만요…' : '무엇을 도와드릴까요?')}</h1>
        </div>
      </section>
      <div className="kx-cards">
        {CARDS[asking].map(c => (
          <button key={c.say} className="kx-card" disabled={chat.pending} onClick={() => act.submit(c.say)}>
            <strong>{c.big}</strong>{c.label && <span>{c.label}</span>}
          </button>
        ))}
      </div>
      <p className="kx-muted kx-center">누르면 직원 AI가 다음 질문을 이어 가요</p>
      <div className="kx-grow" />
      <TalkButton talk={talk} idle="말로 대답할게요" className="kx-talk-soft" />
      <div className="kx-replies kx-replies-2">
        <button className="kx-btn kx-btn-quiet" disabled={chat.pending} onClick={() => act.submit('아무거나 추천해 주세요')}>아무거나 추천해 주세요</button>
        <button className="kx-btn kx-btn-quiet" onClick={() => act.go('menu')}>그냥 메뉴 볼래요</button>
      </div>
    </div>
  );
}

/** "인사. 질문?" 꼴이면 [인사, 질문]으로 나눕니다. 물음표가 하나뿐이면 전체가 질문입니다. */
export function splitQuestion(text: string | null): [string | null, string | null] {
  if (!text) return [null, null];
  const sentences = text.match(/[^.!?。]+[.!?。]?/g)?.map(s => s.trim()).filter(Boolean) ?? [text];
  if (sentences.length < 2) return [null, text];
  const q = sentences.findIndex(s => s.endsWith('?'));
  if (q <= 0) return [null, text];
  return [sentences.slice(0, q).join(' '), sentences.slice(q).join(' ')];
}

// ── 안 3 · 한눈에 정리: 이해한 것 패널 + 짧은 대화 + 종류 그림 버튼 ─────────────────
const KIND_ICON: Record<string, string> = { 면: 'M3 11h18a9 9 0 0 1-18 0zM7 7c0-2 2-2 2-4M12 7c0-2 2-2 2-4M17 7c0-2 2-2 2-4', 밥: 'M4 13h16l-1 5H5zM7 13c0-3 2-5 5-5s5 2 5 5', '딤섬·요리': 'M5 12a7 7 0 0 1 14 0v5H5zM3 17h18M9 9l3-4 3 4' };

export function Summary({ c, asking, hasUser, editable, onEdit }: { c: Conditions; asking: Asking; hasUser: boolean; editable?: boolean; onEdit?: () => void }) {
  const tiles: { key: Asking; label: string; value: string | null }[] = [
    { key: 'party', label: '인원', value: hasUser ? `${c.party}명` : null },
    { key: 'spicy', label: '매운맛', value: c.spicy === null ? null : ['안 매움', '조금', '매움', '아주 매움'][c.spicy] ?? null },
    { key: 'kind', label: '종류', value: c.kind !== '상관없음' ? c.kind : null },
    { key: 'exclude', label: '빼는 재료', value: c.exclude.length ? c.exclude.join('·') : hasUser ? '없음' : null },
  ];
  const Tile = editable ? 'button' : 'div';
  return (
    <div className="kx-summary-grid">
      {tiles.map(t => {
        const state = t.value ? 'filled' : asking === t.key ? 'asking' : 'empty';
        return (
          <Tile key={t.key} className={`kx-tile kx-tile-${state}`} onClick={editable ? onEdit : undefined} type={editable ? 'button' : undefined}>
            <span>{t.label}</span>
            <strong>{t.value ?? (state === 'asking' ? '지금 묻는 중' : '아직')}</strong>
          </Tile>
        );
      })}
    </div>
  );
}

function ChatC({ kiosk, talk }: { kiosk: Kiosk; talk: Talk }) {
  const { act, state } = kiosk;
  const { chat, asking, ctxLine } = talk;
  const recent = chat.turns.slice(-2);
  const hasUser = chat.turns.some(t => t.role === 'user');
  return (
    <div className="kx-page kx-rec kx-rec-c">
      <section className="kx-summary">
        <div className="kx-summary-head"><span>지금까지 이해한 것</span>{ctxLine && <span className="kx-summary-ctx">{ctxLine}</span>}</div>
        <Summary c={state.conditions} asking={asking} hasUser={hasUser} />
      </section>
      <div className="kx-chat" aria-live="polite">
        {recent.length === 0 && <div className="kx-bubble kx-bubble-ai kx-bubble-wait">잠시만요…</div>}
        {recent.map((t, i) => t.role === 'assistant'
          ? <div key={`${i}-${t.text}`} className="kx-staff kx-staff-sm"><Avatar size="sm" /><div className="kx-bubble kx-bubble-red">{t.text}</div></div>
          : <div key={`${i}-${t.text}`} className="kx-bubble kx-bubble-me-light">{t.text}</div>)}
        {chat.pending && recent.length > 0 && <div className="kx-bubble kx-bubble-ai kx-bubble-wait">생각하고 있어요…</div>}
      </div>
      <div className="kx-grow" />
      {asking === 'kind' && (
        <div className="kx-kinds">
          {Object.entries(KIND_ICON).map(([k, d]) => (
            <button key={k} className="kx-kind" disabled={chat.pending} onClick={() => act.submit(k === '딤섬·요리' ? '딤섬이나 요리요' : `${k} 요리요`)}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d={d} /></svg><span>{k}</span>
            </button>
          ))}
        </div>
      )}
      {asking !== 'kind' && <div className="kx-replies">{REPLIES[asking].map(t => <button key={t} className="kx-btn kx-btn-ghost" disabled={chat.pending} onClick={() => act.submit(t)}>{t}</button>)}</div>}
      <TalkButton talk={talk} idle="눌러서 대답하기" className="kx-talk-row" />
      <div className="kx-replies kx-replies-2">
        <button className="kx-btn kx-btn-quiet" disabled={chat.pending} onClick={() => act.submit('아무거나 추천해 주세요')}>아무거나 추천해 주세요</button>
        <button className="kx-btn kx-btn-quiet" onClick={() => act.go('menu')}>메뉴판에서 직접 고르기</button>
      </div>
    </div>
  );
}

// ── 서버 없이(규칙 해석) 또는 말로 주문할 때의 예전 말하기 화면 ─────────────────────
function LegacyInput({ kiosk, talk }: { kiosk: Kiosk; talk: Talk }) {
  const { act, state } = kiosk;
  const order = state.mode === 'order';
  const { speech } = talk;
  return (
    <div className="kx-page">
      <div className="kx-eyebrow">{order ? '음성 주문' : '메뉴 추천'}</div>
      <h1>{order ? '주문할 메뉴를 말씀해 주세요' : '어떤 메뉴를 찾으세요?'}</h1>
      <p className="kx-muted">{order ? '메뉴 이름과 개수를 말해 주세요. 담기 전에 확인할 수 있어요.' : '예: 두 명이고, 새우 없는 딤섬을 먹고 싶어요.'}</p>
      <button className={`kx-talk ${speech.listening ? 'listening' : ''}`} aria-pressed={speech.listening} onClick={speech.toggle}>
        {speech.listening ? '듣고 있어요 · 눌러서 끝내기' : '눌러서 말하기'}
        <small>{speech.listening ? '다 말씀하셨으면 한 번 더 눌러 주세요' : '말을 마치면 한 번 더 눌러 주세요'}</small>
      </button>
      {speech.listening && <p className="kx-heard" aria-live="polite">{speech.heard ? `“${speech.heard}”` : '말씀해 주세요…'}</p>}
      {speech.error && <p role="alert" className="kx-alert">{speech.error}</p>}
      {!speech.error && speech.notice && <p role="status">{speech.notice}</p>}
      {!order && (
        <div className="kx-examples">
          <span className="kx-muted">예시 요청으로 체험하기</span>
          {EXAMPLES.map(t => <button key={t} className="kx-btn kx-btn-ghost" onClick={() => act.submit(t)}>{t}</button>)}
        </div>
      )}
      <div className="kx-actions"><button className="kx-btn kx-btn-ghost" onClick={() => act.go('menu')}>{order ? '메뉴판으로 돌아가기' : '메뉴판에서 직접 고르기'}</button></div>
    </div>
  );
}

// 말한 문장에서 찾은 핵심 키워드는 굵은 글씨로만 표시합니다. 관람객이 '어떻게 알아들었는지' 바로 볼 수 있게 합니다.
function Transcript({ text, ai }: { text: string; ai: boolean }) {
  const parts: (string | { text: string; type: string })[] = [];
  let at = 0;
  for (const m of explain(text, KIND_WORDS, EXCLUDE_WORDS)) {
    if (m.start > at) parts.push(text.slice(at, m.start));
    parts.push({ text: text.slice(m.start, m.end), type: m.type });
    at = m.end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return (
    <div className="kx-transcript">
      <p>“{parts.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : <strong key={i}>{p.text}</strong>))}”</p>
      {ai && <span className="kx-ai-badge">AI가 함께 해석했어요</span>}
    </div>
  );
}

const SPICY_CHOICES: [number, string][] = [[0, '순한맛'], [1, '중간맛'], [3, '매운맛']];
const BUDGETS = [null, 10000, 20000, 30000, 50000];

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return <button type="button" className="kx-pill" aria-pressed={on} onClick={onClick}>{children}</button>;
}

export function Review({ kiosk }: { kiosk: Kiosk }) {
  const { state, act } = kiosk;
  const c: Conditions = state.conditions;
  const patch = act.patchConditions;
  const budgets = [...new Set([...BUDGETS, ...(c.budget && !c.totalBudget ? [c.budget] : [])])].sort((x, y) => (x ?? 0) - (y ?? 0));
  const toggleExclude = (s: string) => patch({ exclude: c.exclude.includes(s) ? c.exclude.filter(x => x !== s) : [...c.exclude, s] });
  return (
    <div className="kx-page">
      <div className="kx-eyebrow">취향 확인</div>
      <h1>이렇게 이해했어요</h1>
      {c.raw && <Transcript text={c.raw} ai={state.aiUsed} />}
      <form onSubmit={e => { e.preventDefault(); act.showResults(); }}>
        <div className="kx-field" role="group" aria-labelledby="kx-party">
          <span className="kx-label" id="kx-party">몇 분이 드시나요?</span>
          <div className="kx-counter">
            <button type="button" className="kx-step" aria-label="인원 줄이기" disabled={c.party <= 1} onClick={() => patch({ party: c.party - 1 })}>−</button>
            <output aria-live="polite" aria-label="인원">{c.party}명</output>
            <button type="button" className="kx-step" aria-label="인원 늘리기" disabled={c.party >= 6} onClick={() => patch({ party: c.party + 1 })}>+</button>
          </div>
        </div>
        <div className="kx-field" role="group" aria-labelledby="kx-spicy">
          <span className="kx-label" id="kx-spicy">어느 정도 맵기를 원하시나요?</span>
          <div className="kx-pills">{SPICY_CHOICES.map(([value, label]) => <Pill key={label} on={c.spicy === value} onClick={() => patch({ spicy: value })}>{label}</Pill>)}</div>
        </div>
        <div className="kx-field" role="group" aria-labelledby="kx-kind">
          <span className="kx-label" id="kx-kind">어떤 종류가 좋으세요?</span>
          <div className="kx-pills">{KIND_OPTIONS.map(s => <Pill key={s} on={c.kind === s} onClick={() => patch({ kind: c.kind === s ? '상관없음' : s })}>{s}</Pill>)}</div>
        </div>
        <div className="kx-field" role="group" aria-labelledby="kx-budget">
          <span className="kx-label" id="kx-budget">1인당 예산</span>
          <div className="kx-pills">
            {c.totalBudget ? <Pill on onClick={() => undefined}>{`총 ${money(c.totalBudget)} 이하`}</Pill> : null}
            {budgets.map(v => <Pill key={String(v)} on={!c.totalBudget && c.budget === v} onClick={() => patch({ budget: v, totalBudget: null })}>{v ? `${v / 10000}만원 이하` : '상관없음'}</Pill>)}
          </div>
          {c.totalBudget ? <p className="kx-muted">말씀하신 총예산 {money(c.totalBudget)}을 {c.party}명이 나눠요. 1인당 약 {money(Math.round(c.totalBudget / c.party))}이에요.</p> : null}
        </div>
        <div className="kx-field" role="group" aria-labelledby="kx-exclude">
          <span className="kx-label" id="kx-exclude">빼고 싶은 재료</span>
          <div className="kx-pills">{[...new Set([...EXCLUDE_OPTIONS, ...c.exclude])].map(s => <Pill key={s} on={c.exclude.includes(s)} onClick={() => toggleExclude(s)}>{s}</Pill>)}</div>
        </div>
        <div className="kx-notice-warn">재료 정보가 완전하지 않을 수 있어요. 알레르기가 있다면 직원에게 확인해 주세요.</div>
        <div className="kx-actions">
          <button className="kx-btn kx-btn-primary">맞아요, 추천해주세요</button>
          <button type="button" className="kx-btn kx-btn-ghost" onClick={() => act.go('input')}>다시 말할게요</button>
        </div>
      </form>
    </div>
  );
}

// ── 추천 결과 (3안) ────────────────────────────────────────────────────────────
/** 결과 한 줄 제목: 단품이면 "메뉴 N개", 조합이면 이름을 +로 */
function titleOf(r: Recommendation, kiosk: Kiosk): string {
  return r.lines.map(l => { const m = kiosk.catalog.get(l.id); return r.lines.length === 1 ? `${m.name} ${l.quantity}${l.quantity > 1 ? '개' : '개'}` : `${m.name} ${l.quantity}`; }).join(' + ');
}
const setLabel = (r: Recommendation) => (r.set ? (r.light ? '식사 + 곁들임' : '중식 한상') : null);

function ResultPhoto({ kiosk, id, className }: { kiosk: Kiosk; id: string; className: string }) {
  const src = kiosk.catalog.photo(id);
  return src ? <Photo src={src} focus={kiosk.catalog.focus(id)} className={className} /> : <div className={`${className} kx-photo-empty`} aria-hidden="true" />;
}

/** 결과 아래 공통 버튼: 대화가 살아 있으면 "더 이야기하기", 아니면 "조건 수정하기" */
function ResultActions({ kiosk, big = false }: { kiosk: Kiosk; big?: boolean }) {
  const { state, act } = kiosk;
  const canTalk = !state.chat.failed && state.chat.turns.length > 0;
  return (
    <>
      {big && <button className="kx-btn kx-btn-ghost kx-btn-tall" onClick={() => (canTalk ? act.go('input') : act.go('review'))}>마음에 드는 게 없어요 · 다시 고르기</button>}
      <div className="kx-result-actions">
        {!big && <button className="kx-btn kx-btn-ghost" onClick={() => (canTalk ? act.go('input') : act.go('review'))}>{canTalk ? '더 이야기하기' : '조건 수정하기'}</button>}
        {!big && canTalk && <button className="kx-btn kx-btn-ghost" onClick={() => act.go('review')}>조건 수정하기</button>}
        <button className="kx-btn kx-btn-ghost" onClick={() => act.go('menu')}>직접 메뉴 고르기</button>
      </div>
      <div className="kx-notice-warn">알레르기·교차접촉 여부는 매장에 직접 확인해 주세요.</div>
    </>
  );
}

export function Results({ kiosk }: { kiosk: Kiosk }) {
  const { state } = kiosk;
  const c = state.conditions;
  const sub = [`${c.party}명`, c.spicy === 0 ? '안 매운 메뉴' : c.exclude.length ? `${c.exclude.join(', ')} 제외` : '선택한 취향 기준', contextLine(state.chat.context)].filter(Boolean).join(' · ');
  if (recommendLayout === 'b') return <ResultsB kiosk={kiosk} sub={sub} />;
  if (recommendLayout === 'c') return <ResultsC kiosk={kiosk} />;
  return <ResultsA kiosk={kiosk} sub={sub} />;
}

const EMPTY = <div className="kx-notice-warn">현재 조건에 맞는 조합이 없어요. 조건을 수정해 주세요.</div>;

function ResultsA({ kiosk, sub }: { kiosk: Kiosk; sub: string }) {
  const { state, act } = kiosk;
  const { results } = state;
  const line = lastAssistant(state);
  return (
    <div className="kx-page kx-rec kx-rec-a">
      <div className="kx-eyebrow">메뉴 추천</div>
      {line
        ? <section className="kx-staff kx-staff-sm"><Avatar /><div className="kx-bubble kx-bubble-ai">{line}</div></section>
        : <h1>이 메뉴는 어떠세요?</h1>}
      <p className="kx-muted kx-sub">{sub}</p>
      {results.length ? results.map((r, i) => (
        <article className="kx-photo-card" key={`${i}-${r.main.id}`}>
          <ResultPhoto kiosk={kiosk} id={r.main.id} className="kx-photo-card-img" />
          <div className="kx-photo-card-body">
            <div className="kx-rank">추천 0{i + 1}{setLabel(r) && <span className="kx-badge">{setLabel(r)}</span>}</div>
            <h2>{titleOf(r, kiosk)}</h2>
            <strong className="kx-price">{money(r.total)}</strong>
            <ul className="kx-reasons">{r.reasons.slice(0, 2).map(s => <li key={s}>{s}</li>)}</ul>
            <button className="kx-btn kx-btn-primary" onClick={() => act.takeResult(r)}>{r.lines.length > 1 ? '이 조합 담기' : '이 메뉴 담기'}</button>
          </div>
        </article>
      )) : EMPTY}
      <ResultActions kiosk={kiosk} />
    </div>
  );
}

function ResultsB({ kiosk, sub }: { kiosk: Kiosk; sub: string }) {
  const { state, act } = kiosk;
  const { results, conditions: c } = state;
  return (
    <div className="kx-page kx-rec kx-rec-b">
      <div className="kx-dots" aria-label="질문 진행"><i className="on" /><i className="on" /><i className="on" /><span>질문 끝 · 추천 {results.length}가지</span></div>
      <section className="kx-staff"><Avatar size="lg" /><h1>{c.party === 1 ? '이 메뉴' : `${c.party}분께 이 메뉴`}<br />어떠세요?</h1></section>
      <p className="kx-muted kx-sub">{sub}</p>
      {results.length ? results.map((r, i) => (
        <article className={`kx-photo-card kx-photo-card-b ${i === 0 ? 'kx-first' : ''}`} key={`${i}-${r.main.id}`}>
          <ResultPhoto kiosk={kiosk} id={r.main.id} className="kx-photo-card-img" />
          <div className="kx-photo-card-body">
            <span className="kx-rank">{i === 0 ? '직원 AI 첫 번째 추천' : i === 1 ? '두 번째' : '세 번째'}</span>
            <h2>{titleOf(r, kiosk)}</h2>
            <strong className="kx-price">{money(r.total)}</strong>
            {r.reasons[0] && <p className="kx-muted">{r.reasons[0]}</p>}
            <button className={`kx-btn ${i === 0 ? 'kx-btn-primary' : 'kx-btn-outline'}`} onClick={() => act.takeResult(r)}>이걸로 할게요</button>
          </div>
        </article>
      )) : EMPTY}
      <div className="kx-grow" />
      <ResultActions kiosk={kiosk} big />
    </div>
  );
}

function ResultsC({ kiosk }: { kiosk: Kiosk }) {
  const { state, act } = kiosk;
  const { results, conditions: c } = state;
  const ctxLine = contextLine(state.chat.context);
  const kindWord = c.kind !== '상관없음' ? `${c.kind} 요리` : '메뉴';
  const quote = results.map(r => kiosk.catalog.reviews(r.main.id)?.reviews[0]).find(Boolean);
  const quoteName = quote ? kiosk.catalog.get(results.find(r => kiosk.catalog.reviews(r.main.id)?.reviews[0] === quote)!.main.id).name : null;
  return (
    <div className="kx-page kx-rec kx-rec-c">
      <section className="kx-summary">
        <div className="kx-summary-head"><span>이렇게 이해했어요 · 눌러서 고치기</span>{ctxLine && <span className="kx-summary-ctx">{ctxLine}</span>}</div>
        <Summary c={c} asking="other" hasUser editable onEdit={() => act.go('review')} />
      </section>
      <section className="kx-staff kx-staff-sm"><Avatar size="sm" /><p className="kx-staff-line">{c.party === 1 ? '혼자 드시기 좋은' : `${c.party}분께 어울리는`} {kindWord}로 {results.length}가지 골라 봤어요.</p></section>
      {results.length ? results.map((r, i) => (
        <article className={`kx-row-card ${i === 0 ? 'kx-first' : ''}`} key={`${i}-${r.main.id}`}>
          <span className="kx-row-num">{i + 1}</span>
          <ResultPhoto kiosk={kiosk} id={r.main.id} className="kx-row-img" />
          <div className="kx-row-body">
            <h2>{titleOf(r, kiosk)}</h2>
            {r.reasons[0] && <span className="kx-muted">{r.reasons.slice(0, 2).join(' · ')}</span>}
            <strong className="kx-price">{money(r.total)}</strong>
          </div>
          <button className={`kx-btn ${i === 0 ? 'kx-btn-primary' : 'kx-btn-outline'}`} onClick={() => act.takeResult(r)}>담기</button>
        </article>
      )) : EMPTY}
      <div className="kx-grow" />
      {quote && (
        <div className="kx-quote"><span className="kx-quote-tag">실제 리뷰</span><span>“{quote.summary ?? quote.quote}” · {quoteName} · {quote.platform} {quote.date}</span></div>
      )}
      <ResultActions kiosk={kiosk} />
    </div>
  );
}
