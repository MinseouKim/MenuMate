// 말로 추천 길의 네 화면: 이용 안내 → 말하기(직원 AI와 대화) → 이해한 내용 확인 → 추천 결과.
// 직원 AI 서버가 있으면 말하기 화면이 대화로 바뀌고, 조건이 충분해지면 확인 화면 없이 바로 추천 결과로 갑니다.
import { useEffect, useRef } from 'react';
import { explain } from '../../prototype/parse';
import { EXCLUDE_OPTIONS, EXCLUDE_WORDS, KIND_OPTIONS, KIND_WORDS } from '../../prototype/recommendation';
import { lastAssistant, type Kiosk } from '../useKiosk';
import { useSpeechInput } from '../useSpeechInput';
import { whenSilent } from '../speech';
import { money, type Conditions, type KioskContext } from '../types';

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
/** 대화 중 터치로 답할 수 있는 짧은 말들 (말하기가 어려운 손님용) */
const QUICK_REPLIES = ['혼자 왔어요', '두 명이에요', '매운 건 못 먹어요', '아무거나 추천해 주세요'];

export function Input({ kiosk }: { kiosk: Kiosk }) {
  const { act, state } = kiosk;
  const order = state.mode === 'order';
  const speech = useSpeechInput(act.submit);
  const { chat } = state;
  const talking = !order && !chat.failed;
  const assistant = lastAssistant(state);
  // 직원 AI가 말을 마치면 마이크를 자동으로 켭니다(손님이 버튼을 찾지 않아도 되게). 이미 듣는 중이거나 끝났으면 건너뜁니다.
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!talking || !assistant || chat.pending || chat.done || spokenFor.current === assistant) return;
    spokenFor.current = assistant;
    let alive = true;
    void whenSilent().then(() => { if (alive && !speech.listening) speech.start(); });
    return () => { alive = false; };
  }, [assistant, talking, chat.pending, chat.done]); // eslint-disable-line react-hooks/exhaustive-deps
  const recent = chat.turns.slice(-3);
  const ctxLine = contextLine(chat.context);
  return (
    <div className="kx-page">
      <div className="kx-eyebrow">{order ? '음성 주문' : talking ? '직원 AI와 대화' : '메뉴 추천'}</div>
      {talking ? (
        <>
          <h1>{assistant ? '말씀해 주세요' : '직원 AI를 부르고 있어요'}</h1>
          {ctxLine && <p className="kx-muted kx-context">{ctxLine}</p>}
          <div className="kx-chat" aria-live="polite">
            {recent.length === 0 && <div className="kx-bubble kx-bubble-ai kx-bubble-wait">잠시만요…</div>}
            {recent.map((t, i) => <div key={`${i}-${t.text}`} className={`kx-bubble ${t.role === 'assistant' ? 'kx-bubble-ai' : 'kx-bubble-me'}`}>{t.text}</div>)}
            {chat.pending && recent.length > 0 && <div className="kx-bubble kx-bubble-ai kx-bubble-wait">생각하고 있어요…</div>}
          </div>
        </>
      ) : (
        <>
          <h1>{order ? '주문할 메뉴를 말씀해 주세요' : '어떤 메뉴를 찾으세요?'}</h1>
          <p className="kx-muted">{order ? '메뉴 이름과 개수를 말해 주세요. 담기 전에 확인할 수 있어요.' : '예: 두 명이고, 새우 없는 딤섬을 먹고 싶어요.'}</p>
        </>
      )}
      <button className={`kx-talk ${speech.listening ? 'listening' : ''}`} aria-pressed={speech.listening} disabled={talking && chat.pending} onClick={speech.toggle}>
        {speech.listening ? '듣고 있어요 · 눌러서 끝내기' : talking ? '눌러서 대답하기' : '눌러서 말하기'}
        <small>{speech.listening ? '다 말씀하셨으면 한 번 더 눌러 주세요' : '말을 마치면 한 번 더 눌러 주세요'}</small>
      </button>
      {speech.listening && <p className="kx-heard" aria-live="polite">{speech.heard ? `“${speech.heard}”` : '말씀해 주세요…'}</p>}
      {speech.error && <p role="alert" className="kx-alert">{speech.error}</p>}
      {!speech.error && speech.notice && <p role="status">{speech.notice}</p>}
      {!order && (
        <div className="kx-examples">
          <span className="kx-muted">{talking ? '말 대신 눌러서 답하기' : '예시 요청으로 체험하기'}</span>
          {(talking ? QUICK_REPLIES : EXAMPLES).map(t => <button key={t} className="kx-btn kx-btn-ghost" disabled={talking && chat.pending} onClick={() => act.submit(t)}>{t}</button>)}
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

export function Results({ kiosk }: { kiosk: Kiosk }) {
  const { state, catalog, act } = kiosk;
  const { conditions: c, results } = state;
  return (
    <div className="kx-page">
      <div className="kx-eyebrow">메뉴 추천</div>
      <h1>이 메뉴는 어떠세요?</h1>
      <p className="kx-muted">{c.party}명 · {c.exclude.length ? `${c.exclude.join(', ')} 제외` : '선택한 취향 기준'}{contextLine(state.chat.context) ? ` · ${contextLine(state.chat.context)}` : ''}</p>
      {results.length ? results.map((r, i) => (
        <article className="kx-result" key={`${i}-${r.main.id}`}>
          <div className="kx-rank">추천 0{i + 1}{r.set && <span className="kx-badge">{r.light ? '식사 + 곁들임' : '중식 한상'}</span>}</div>
          {r.set ? (
            <>
              <div className="kx-result-top">
                <h2>{r.light ? (c.party === 1 ? '혼자 드시는 구성' : `${c.party}명 가벼운 구성`) : `${c.party}명 한상 구성`}</h2>
                <strong className="kx-price">{money(r.total)}</strong>
              </div>
              <ul className="kx-set-lines">
                {r.lines.map(l => { const m = catalog.get(l.id); return <li key={l.id}><span>{m.name}</span><b>{l.quantity}개</b><small>{money(m.price * l.quantity)}</small></li>; })}
              </ul>
            </>
          ) : (
            <div className="kx-result-top">
              <div><h2>{r.lines.map(l => catalog.get(l.id).name).join(' + ')}</h2><p className="kx-muted">{r.lines.map(l => `${l.quantity}개`).join(' + ')}</p></div>
              <strong className="kx-price">{money(r.total)}</strong>
            </div>
          )}
          <ul className="kx-reasons">{r.reasons.map(s => <li key={s}>{s}</li>)}</ul>
          <button className="kx-btn kx-btn-primary" onClick={() => act.takeResult(r)}>이 조합 담기</button>
        </article>
      )) : <div className="kx-notice-warn">현재 조건에 맞는 조합이 없어요. 조건을 수정해 주세요.</div>}
      <div className="kx-notice-warn">알레르기·교차접촉 여부는 매장에 직접 확인해 주세요.</div>
      <div className="kx-actions">
        <button className="kx-btn kx-btn-ghost" onClick={() => act.go('review')}>조건 수정하기</button>
        {!state.chat.failed && state.chat.turns.length > 0 && <button className="kx-btn kx-btn-ghost" onClick={() => act.go('input')}>더 이야기하기</button>}
        <button className="kx-btn kx-btn-ghost" onClick={() => act.go('menu')}>직접 메뉴 고르기</button>
      </div>
    </div>
  );
}
