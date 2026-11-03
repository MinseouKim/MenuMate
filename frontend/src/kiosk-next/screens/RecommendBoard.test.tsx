// 간편주문 1안 "주문 확인 보드" (2026-11-03 팀장 선택). 대화 화면과 추천 결과 화면을 손님이 보는 대로(역할·이름) 확인합니다.
// 음성은 가짜로 둡니다: 직원 음성(speech)은 테스트가 시작·멈춤을 정하고, 마이크(useSpeechInput)는 상태만 흉내 냅니다.
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const voice = vi.hoisted(() => ({ speaking: '', listeners: new Set<() => void>(), stopSpeaking: vi.fn(), spoken: [] as string[], chime: vi.fn() }));
const staffSays = (text: string) => { voice.speaking = text; voice.listeners.forEach(f => f()); };
vi.mock('../speech', () => ({
  speak: async (text: string) => { voice.spoken.push(text); },
  speakingText: () => voice.speaking,
  stopSpeaking: () => { voice.stopSpeaking(); if (voice.speaking) staffSays(''); },
  onSilence: () => () => {},
  onSpeakingChange: (f: () => void) => { voice.listeners.add(f); return () => { voice.listeners.delete(f); }; },
  whenSilent: async () => {},
  chime: () => voice.chime(),
  prefetchSpeech: () => {},
}));

const mic = vi.hoisted(() => ({
  listening: true, heard: '', error: '', notice: '', off: false,
  start: vi.fn(), stop: vi.fn(), resume: vi.fn(), toggle: vi.fn(), finish: vi.fn(),
}));
const useSpeechInputMock = vi.hoisted(() => vi.fn((_onResult: (text: string) => void, _opts?: unknown) => ({ ...mic })));
vi.mock('../useSpeechInput', () => ({ useSpeechInput: useSpeechInputMock }));
vi.mock('../layout', async importOriginal => ({ ...(await importOriginal<typeof import('../layout')>()), recommendLayout: 'board' }));

import KioskNext from '../KioskNext';
import { answerChoices } from './Recommend';
import { createCatalog } from '../catalog';
import { defaultRecommender, type Recommender } from '../recommender';
import type { ChatReply, Menu, Recommendation } from '../types';

const menu = (id: string, name: string, price: number): Menu => ({
  id, name, price, category: 'noodle', kind: '', spicy: 0, texture: [], flavor: [], ingredients: [], quantityUnit: '1인분', servingPeople: 1, pairings: [],
});
const MENUS = [menu('n1', '유니짜장', 12000), menu('n2', '해물짬뽕', 13000), menu('r1', '새우볶음밥', 11000)];
const catalog = createCatalog(MENUS);
const rec = (m: Menu, quantity: number, extra: Partial<Recommendation> = {}): Recommendation =>
  ({ main: m, lines: [{ id: m.id, quantity }], total: m.price * quantity, score: 1, reasons: ['현재 조건으로 선택할 수 있는 메뉴예요'], ...extra });
const RESULTS: Recommendation[] = [
  rec(MENUS[0], 2, { reasons: ['‘둘이서 안 맵게’라고 하셔서 순한 짜장이에요'], talk: { heard: '둘이서 안 맵게', why: '순한 짜장이에요', review: '짜장이 달지 않고 깔끔해요' } }),
  rec(MENUS[1], 2, { reasons: ['국물이 시원해요'] }),
  rec(MENUS[2], 1, { reasons: ['밥도 좋다면'] }),
];
const BLANK = { party: 1, spicy: null, kind: '상관없음', texture: '상관없음', exclude: [], budget: null, totalBudget: null };
const reply = (r: Partial<ChatReply>): ChatReply => ({ reply: '네!', conditions: BLANK, mood: null, picks: [], done: false, asking: null, ...r });

/** 서버(/api/chat)만 가짜로. 손님이 보낸 문장을 기록하고, 추천은 정해 둔 세 가지를 돌려줍니다. */
function fakeServer(replies: (ChatReply | Promise<ChatReply>)[], results: Recommendation[] = RESULTS) {
  const sent: string[] = [];
  const recommender: Recommender = {
    ...defaultRecommender,
    context: async () => null,
    converse: async turns => {
      const last = turns.at(-1);
      if (last?.role === 'user') sent.push(last.text);
      return (await replies.shift()) ?? null;
    },
    recommend: () => results,
  };
  return { recommender, sent };
}

async function startChat(recommender: Recommender, opts: { large?: boolean; voice?: boolean; advanceTimers?: (ms: number) => void } = {}) {
  const user = userEvent.setup(opts.advanceTimers ? { advanceTimers: opts.advanceTimers } : {});
  const view = render(<KioskNext catalog={catalog} recommender={recommender} />);
  if (opts.large) await user.click(screen.getByRole('button', { name: '글자 크게' }));
  await user.click(screen.getByRole('button', { name: /말로 추천 받아 주문/ }));
  if (opts.voice) await user.click(screen.getByRole('button', { name: /음성 안내/ }));
  await user.click(screen.getByRole('button', { name: '말로 추천받기 시작' }));
  return { user, rerender: (el: ReactElement = <KioskNext catalog={catalog} recommender={recommender} />) => view.rerender(el) };
}
const board = () => screen.getByRole('region', { name: '지금까지 들은 주문' });
const row = (label: string) => within(board()).getByText(label).closest('li') as HTMLElement;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => {
  voice.speaking = ''; voice.listeners.clear(); voice.stopSpeaking.mockClear(); voice.spoken = []; voice.chime.mockClear();
  Object.assign(mic, { listening: true, heard: '', error: '', notice: '', off: false });
  mic.stop.mockClear(); mic.resume.mockClear(); mic.start.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('주문 확인 보드 · 대화 화면', () => {
  it('가게 이름, 지금까지 들은 주문 4칸(인원 칸은 지금 묻는 중), 직원 말, 터치 답 4개가 있고 "눌러서 대답하기" 큰 버튼은 없다', async () => {
    await startChat(fakeServer([]).recommender);
    expect(screen.getByText('우루루 평촌본점', { selector: '.kx-board-store' })).toBeInTheDocument();
    expect(within(board()).getByRole('heading', { name: '지금까지 들은 주문' })).toBeInTheDocument();
    for (const label of ['인원', '맵기', '종류', '빼기']) expect(row(label)).toBeInTheDocument();
    expect(row('인원')).toHaveTextContent('지금 묻는 중…');
    expect(row('인원')).toHaveClass('is-asking');
    expect(screen.getByText(/우루루 평촌본점에 어서 오세요/, { selector: '.kx-board-staff' })).toBeInTheDocument();
    for (const t of ['혼자 왔어요', '두 명이에요', '세 명이에요', '네 명 이상이에요']) expect(screen.getByRole('button', { name: t })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /눌러서 대답하기|듣고 있어요 · 눌러서 끝내기/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '메뉴판에서 직접 고르기' })).toBeInTheDocument();
  });

  it('답한 칸은 값과 ✓(확인됨)으로 채우고, 다음에 묻는 칸으로 금색 테두리가 옮겨 간다', async () => {
    const { recommender } = fakeServer([reply({ reply: '매운 음식도 괜찮으세요?', conditions: { ...BLANK, party: 2 }, asking: 'spicy' })]);
    const { user } = await startChat(recommender);
    await user.click(screen.getByRole('button', { name: '두 명이에요' }));
    expect(await within(row('인원')).findByText('2명')).toBeInTheDocument();
    expect(within(row('인원')).getByLabelText('확인됨')).toHaveTextContent('✓');
    expect(row('인원')).not.toHaveClass('is-asking');
    expect(row('맵기')).toHaveClass('is-asking');
    expect(row('맵기')).toHaveTextContent('지금 묻는 중…');
    expect(row('종류')).toHaveTextContent('아직');
  });

  it('상태 배지: 직원이 말하는 중 → 듣고 있어요 → 생각 중(1초 뒤) → 메뉴 찾고 있어요(4초 넘으면) → 마이크 꺼짐', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { recommender } = fakeServer([new Promise<ChatReply>(() => {})]);
    const { user, rerender } = await startChat(recommender, { advanceTimers: vi.advanceTimersByTime });
    const status = () => screen.getByRole('status', { name: '대화 상태' });
    act(() => staffSays('몇 분이서 오셨어요?'));
    expect(status()).toHaveTextContent('직원이 말하는 중 · 말씀하시면 멈춰요');
    act(() => staffSays(''));
    expect(status()).toHaveTextContent('듣고 있어요');
    await user.click(screen.getByRole('button', { name: '두 명이에요' }));
    expect(status()).toHaveTextContent('듣고 있어요'); // 1초 안에는 바꾸지 않음(깜빡임 방지)
    act(() => { vi.advanceTimersByTime(1000); });
    expect(status()).toHaveTextContent('생각 중이에요');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(status()).toHaveTextContent('메뉴 찾고 있어요');
    mic.off = true;
    rerender();
    expect(status()).toHaveTextContent('마이크 꺼짐');
  });

  it('손님 말을 실시간 자막으로 보여 주고, 확정 전 말은 흐리게 표시한다', async () => {
    mic.heard = '면으로 할게';
    await startChat(fakeServer([]).recommender);
    const caption = screen.getByText('면으로 할게', { exact: false, selector: '.kx-board-me *' });
    expect(caption).toHaveClass('is-interim');
  });

  it('화면 아무 곳이나 누르면 직원 말을 멈춘다', async () => {
    await startChat(fakeServer([]).recommender);
    act(() => staffSays('몇 분이서 오셨어요?'));
    await userEvent.setup().pointer({ keys: '[MouseLeft]', target: board() });
    expect(voice.stopSpeaking).toHaveBeenCalled();
    expect(screen.getByRole('status', { name: '대화 상태' })).toHaveTextContent('듣고 있어요');
  });

  it('마이크 끄기를 누르면 듣기를 멈추고, 마이크 켜기로 다시 듣는다', async () => {
    const { user, rerender } = await startChat(fakeServer([]).recommender);
    await user.click(screen.getByRole('button', { name: '마이크 끄기' }));
    expect(mic.stop).toHaveBeenCalledTimes(1);
    mic.off = true; mic.listening = false;
    rerender();
    await user.click(screen.getByRole('button', { name: '마이크 켜기' }));
    expect(mic.resume).toHaveBeenCalledTimes(1);
  });
});

// ── 2026-11-03 오후 팀장 요청 ──
describe('정확한 인원 다시 묻기 ("네 명 이상" 뒤)', () => {
  it('인원을 묻는데 직전 손님 말에 "이상/넘어요/넘게"가 있으면 네·다섯·여섯·일곱 명 이상 버튼(안2 카드는 4/5/6/7+)', () => {
    const exact = ['네 명이에요', '다섯 명이에요', '여섯 명이에요', '일곱 명 이상이에요'];
    expect(answerChoices('party', '네 명 이상이에요').replies).toEqual(exact);
    expect(answerChoices('party', '열 명 넘게 왔어요').replies).toEqual(exact);
    expect(answerChoices('party', '다섯 명 넘어요').cards.map(c => c.big)).toEqual(['4', '5', '6', '7+']);
    expect(answerChoices('party', '다섯 명 넘어요').cards.map(c => c.say)).toEqual(exact);
    expect(answerChoices('party', '두 명이에요').replies).toEqual(['혼자 왔어요', '두 명이에요', '세 명이에요', '네 명 이상이에요']);
    expect(answerChoices('party', null).replies[0]).toBe('혼자 왔어요');
    expect(answerChoices('spicy', '네 명 이상이에요').replies[0]).toBe('매운 건 못 먹어요');
  });

  it('보드: "네 명 이상이에요" 뒤 다시 인원을 물으면 정확한 인원 버튼을 보이고, 인원 칸은 확정(✓) 대신 지금 묻는 중', async () => {
    const { recommender, sent } = fakeServer([reply({ reply: '정확히 몇 분이세요?', conditions: { ...BLANK, party: 4 }, asking: 'party' })]);
    const { user } = await startChat(recommender);
    await user.click(screen.getByRole('button', { name: '네 명 이상이에요' }));
    const five = await screen.findByRole('button', { name: '다섯 명이에요' });
    for (const t of ['네 명이에요', '여섯 명이에요', '일곱 명 이상이에요']) expect(screen.getByRole('button', { name: t })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '혼자 왔어요' })).not.toBeInTheDocument();
    expect(row('인원')).toHaveClass('is-asking');
    expect(row('인원')).toHaveTextContent('지금 묻는 중…');
    expect(within(row('인원')).queryByLabelText('확인됨')).not.toBeInTheDocument();
    await user.click(five);
    expect(sent).toEqual(['네 명 이상이에요', '다섯 명이에요']);
  });
});

describe('직접 말할게요 (버튼 답이 안 맞을 때 자기 말로)', () => {
  it('누르면 읽던 직원 말을 멈추고, 꺼진 마이크를 켜고, 크게 "듣고 있어요" 안내와 실시간 자막을 보인다', async () => {
    mic.off = true; mic.listening = false;
    const { user, rerender } = await startChat(fakeServer([]).recommender);
    act(() => staffSays('몇 분이서 오셨어요?'));
    await user.click(screen.getByRole('button', { name: '직접 말할게요' }));
    expect(voice.stopSpeaking).toHaveBeenCalled();
    expect(mic.resume).toHaveBeenCalledTimes(1);
    const panel = screen.getByRole('status', { name: '직접 말하기' });
    expect(panel).toHaveTextContent('듣고 있어요. 편하게 말씀해 주세요');
    expect(screen.queryByRole('button', { name: '직접 말할게요' })).not.toBeInTheDocument();
    Object.assign(mic, { off: false, listening: true, heard: '짜장 두 개' });
    rerender();
    expect(within(screen.getByRole('status', { name: '직접 말하기' })).getByText('짜장 두 개')).toBeInTheDocument();
  });

  it('마이크가 켜져 있는데 듣고 있지 않으면 듣기를 시작한다', async () => {
    mic.listening = false;
    const { user } = await startChat(fakeServer([]).recommender);
    mic.start.mockClear();
    await user.click(screen.getByRole('button', { name: '직접 말할게요' }));
    expect(mic.start).toHaveBeenCalled();
    expect(mic.resume).not.toHaveBeenCalled();
  });

  it('8초 동안 말이 없으면 원래 화면(답 버튼)으로 돌아간다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = await startChat(fakeServer([]).recommender, { advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: '직접 말할게요' }));
    act(() => { vi.advanceTimersByTime(7900); });
    expect(screen.getByRole('status', { name: '직접 말하기' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('status', { name: '직접 말하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '직접 말할게요' })).toBeInTheDocument();
  });

  it('손님 말이 넘어가면(대화에 손님 말이 더해지면) 안내를 닫고 그 말을 손님 말풍선으로 보인다', async () => {
    const { user } = await startChat(fakeServer([new Promise<ChatReply>(() => {})]).recommender);
    await user.click(screen.getByRole('button', { name: '직접 말할게요' }));
    await user.click(screen.getByRole('button', { name: '버튼으로 답할게요' }));
    expect(screen.queryByRole('status', { name: '직접 말하기' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '직접 말할게요' }));
    // 핸즈프리가 손님 말을 넘기는 것을 흉내 냅니다: useSpeechInput 에 넘긴 onResult(= act.submit)를 직접 부름
    const submit = vi.mocked(useSpeechInputMock).mock.calls.at(-1)![0];
    act(() => submit('짜장 두 개요'));
    expect(screen.queryByRole('status', { name: '직접 말하기' })).not.toBeInTheDocument();
    expect(screen.getByText('짜장 두 개요', { selector: '.kx-board-me q' })).toBeInTheDocument();
  });
});

describe('주문 확인 보드 · 추천 결과', () => {
  const DONE = reply({
    reply: '말씀 듣고 골라 봤어요.', conditions: { ...BLANK, party: 2, spicy: 0, kind: '면' }, done: true,
    pickReasons: [{ id: 'n1', why: '순한 짜장이에요', heard: '둘이서 안 맵게', review: '짜장이 달지 않고 깔끔해요' }], heardSummary: '2명 · 안 맵게 · 면', partyAssumed: false,
  });

  it('들은 조건 칩, 1순위 큰 카드(손님 말 인용 이유·리뷰 한 줄·가격·이걸로 담기), 2·3순위 한 줄, 아래 링크와 알레르기 안내', async () => {
    const { user } = await startChat(fakeServer([DONE]).recommender);
    await user.click(screen.getByRole('button', { name: '두 명이에요' }));
    const chips = await screen.findByRole('group', { name: '들은 조건 (누르면 고치기)' });
    expect(within(chips).getAllByRole('button').map(b => b.textContent)).toEqual(['2명', '안 맵게', '면']);
    const first = screen.getByRole('article', { name: '1순위' });
    expect(within(first).getByText('1순위')).toBeInTheDocument();
    expect(within(first).getByRole('heading', { name: '유니짜장 2개' })).toBeInTheDocument();
    expect(within(first).getByText('‘둘이서 안 맵게’라고 하셔서 순한 짜장이에요')).toBeInTheDocument();
    expect(within(first).getByText(/짜장이 달지 않고 깔끔해요/)).toBeInTheDocument();
    expect(within(first).getByText('24,000원')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '해물짬뽕 2개 담기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '새우볶음밥 1개 담기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '더 이야기하기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '메뉴판에서 고르기' })).toBeInTheDocument();
    expect(screen.getByText(/알레르기가 있으면/)).toBeInTheDocument();

    await user.click(within(first).getByRole('button', { name: '이걸로 담기' }));
    const dock = screen.getByRole('region', { name: '담은 메뉴' });
    expect(dock).toHaveTextContent('24,000원');
  });

  it('조건 칩을 누르면 조건 고치기 화면으로 간다', async () => {
    const { user } = await startChat(fakeServer([DONE]).recommender);
    await user.click(screen.getByRole('button', { name: '두 명이에요' }));
    const chips = await screen.findByRole('group', { name: '들은 조건 (누르면 고치기)' });
    await user.click(within(chips).getByRole('button', { name: '안 맵게' }));
    expect(screen.getByRole('heading', { name: '이렇게 이해했어요' })).toBeInTheDocument();
  });

  it('인원을 몰라 1명으로 가정했으면 "1인 기준 · 눌러서 고치기" 칩을 보인다', async () => {
    const { user } = await startChat(fakeServer([{ ...DONE, conditions: { ...BLANK, spicy: 0 }, heardSummary: '1명 · 안 맵게', partyAssumed: true }]).recommender);
    await user.click(screen.getByRole('button', { name: '혼자 왔어요' }));
    const chips = await screen.findByRole('group', { name: '들은 조건 (누르면 고치기)' });
    expect(within(chips).getAllByRole('button').map(b => b.textContent)).toEqual(['1인 기준 · 눌러서 고치기', '안 맵게']);
  });

  it('큰 글씨 모드에서는 1순위만 보이고 "다른 추천 보기"로 펼친다', async () => {
    const { user } = await startChat(fakeServer([DONE]).recommender, { large: true });
    await user.click(screen.getByRole('button', { name: '두 명이에요' }));
    expect(await screen.findByRole('article', { name: '1순위' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '해물짬뽕 2개 담기' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다른 추천 보기' }));
    expect(screen.getByRole('button', { name: '해물짬뽕 2개 담기' })).toBeInTheDocument();
  });

  // 2026-11-03 백엔드 안전 규칙: 빼는 재료가 있으면 재료가 확인 안 된 메뉴는 추천하지 않음 → 채식·알레르기 손님은 추천이 빌 수 있음
  it('빼는 재료를 말했는데 추천이 없으면, 재료 확인 중이라 안내하고 직원 호출·조건 고치기·메뉴판을 보인다 (음성 안내도 같은 뜻)', async () => {
    const vegan = reply({ reply: '골라 볼게요.', conditions: { ...BLANK, party: 2, exclude: ['고기', '해산물'] }, done: true, heardSummary: '2명 · 고기·해산물 빼고' });
    const { user } = await startChat(fakeServer([vegan], []).recommender, { voice: true });
    await user.click(screen.getByRole('button', { name: '두 명이에요' }));
    expect(await screen.findByText('재료를 확인 중인 메뉴가 많아 바로 추천하기 어려워요. 직원에게 물어봐 주세요.')).toBeInTheDocument();
    expect(screen.queryByText(/현재 조건에 맞는 조합이 없어요/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '조건 고치기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '메뉴판에서 고르기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '더 이야기하기' })).not.toBeInTheDocument();
    expect(voice.spoken.at(-1)).toContain('재료를 확인 중인 메뉴가 많아 바로 추천하기 어려워요');
    // 2026-11-03 PM: 메뉴판 사용법 팝업을 여는 대신 바로 직원을 부르고(알림음), 버튼 자리에 호출했다는 안내를 보인다(중복 호출 방지)
    await user.click(screen.getByRole('button', { name: '직원에게 물어보기' }));
    expect(voice.chime).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('직원을 불렀어요. 잠시만 기다려 주세요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '직원에게 물어보기' })).not.toBeInTheDocument();
  });

  it('빼는 재료 없이 추천이 없으면 예전처럼 조건을 고치라고만 안내한다', async () => {
    const { user } = await startChat(fakeServer([{ ...DONE, conditions: { ...BLANK, party: 2 } }], []).recommender, { voice: true });
    await user.click(screen.getByRole('button', { name: '두 명이에요' }));
    expect(await screen.findByText('현재 조건에 맞는 조합이 없어요. 조건을 수정해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '직원에게 물어보기' })).not.toBeInTheDocument();
    expect(voice.spoken.at(-1)).toBe('조건에 맞는 메뉴가 없어요. 조건을 바꿔 주세요.');
  });
});
