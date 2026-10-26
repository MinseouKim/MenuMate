import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgeGate, AgeGateUpdate } from './ai/types';
import { silentSpeaker } from './ai/fallback';
import { ORDER_TYPE_LABEL, TEXT } from './kiosk/copy';
import { dummyMenu } from './mocks/menu.dummy';
import { createMockBackend } from './mocks/mockBackend';

// 화면 문구는 copy.ts 에서 가져온다. 디자이너가 문구를 바꿔도 흐름 테스트는 그대로 동작한다.
// (메뉴명·질문 문구는 가짜 Backend 데이터라 그대로 쓴다)
const lines = (l: readonly string[]) => l.join(' ');
const GREETING = lines(TEXT.idle.greeting);
const amountIn = (name: string) => Number(name.replace(/\D/g, ''));
const PAY = (name: string) => name === TEXT.cart.pay(amountIn(name));
const REC_ADD = (name: string) => dummyMenu.items.some(i => name === TEXT.add.aria(i.name) || name === TEXT.add.ariaDone(i.name));
const DINE_IN = ORDER_TYPE_LABEL.dine_in;
const TAKEOUT = ORDER_TYPE_LABEL.takeout;

// 테스트용 판정기: 이벤트를 직접 보낼 수 있다
const listeners = new Set<(u: AgeGateUpdate) => void>();
const emit = (u: AgeGateUpdate) => act(() => listeners.forEach(cb => cb(u)));
const gate: AgeGate = {
  backend: 'wasm',
  start: vi.fn(), stop: vi.fn(), reset: vi.fn(),
  force: group => listeners.forEach(cb => cb({ type: 'decided', group, confidence: 1, source: 'forced' })),
  onUpdate: cb => { listeners.add(cb); return () => listeners.delete(cb); },
};
// 모델 로딩을 테스트마다 조절한다. 기본은 바로 준비됨
let gateReady: Promise<AgeGate | null> = Promise.resolve(gate);
vi.mock('./ai/loadAi', () => ({
  loadAi: () => ({ speaker: Promise.resolve(silentSpeaker), ageGate: gateReady }),
}));

const { App } = await import('./App');

let requests: { path: string; body: string }[] = [];
let serverUp = true;

beforeEach(() => {
  listeners.clear();
  gateReady = Promise.resolve(gate);
  requests = [];
  serverUp = true;
  const backend = createMockBackend({ payDelayMs: 0 });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (!serverUp) throw new TypeError('Failed to fetch');
    const body = typeof init?.body === 'string' ? init.body : '';
    requests.push({ path: url, body });
    const res = await backend.handle(init?.method ?? 'GET', url, body ? JSON.parse(body) : null);
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  });
});

const shift = (code: string) => fireEvent.keyDown(window, { code, shiftKey: true });
const click = (name: string | RegExp | ((n: string) => boolean)) => fireEvent.click(screen.getByRole('button', { name }));

async function start() {
  render(<App />);
  await screen.findByText(GREETING);
  await waitFor(() => expect(listeners.size).toBe(1));
  await waitFor(() => expect(requests.some(r => r.path === '/api/menu')).toBe(true));
}

async function payToDone(orderType: string) {
  click(TEXT.orderbar.checkout);
  click(orderType);
  click(PAY);
  await screen.findByText(TEXT.done.title);
}

const clickFirstRec = () => fireEvent.click(screen.getAllByRole('button', { name: REC_ADD })[0]);
const toMenu = async () => { shift('KeyN'); await screen.findByRole('button', { name: TEXT.menu.ai }); };
const answerAll = async (answers: ('yes' | 'no')[]) => {
  for (const a of answers) click(a === 'yes' ? TEXT.survey.yes : TEXT.survey.no);
  await screen.findByText(lines(TEXT.recommend.title));
};

describe('키오스크 전체 흐름', () => {
  it('55 미만(Shift+N): 메뉴판 타일 → 담기 → 매장 → 결제 → 주문번호', async () => {
    await start();
    await toMenu();
    expect(screen.getByRole('button', { name: TEXT.common.toEasy })).toBeInTheDocument();
    click(TEXT.tile.aria('된장찌개', 9000));
    click(TEXT.tile.aria('된장찌개', 9000));
    expect(screen.getByText(TEXT.orderbar.count(2))).toBeInTheDocument();
    expect(screen.getByText(TEXT.tile.added(2))).toBeInTheDocument();
    await payToDone(DINE_IN);
    expect(screen.getByLabelText(TEXT.done.numberAria('001'))).toBeInTheDocument();
  });

  it('55+(Shift+S): 쉬운 화면 질문 4개 → 추천 3개 → 포장 → 주문번호', async () => {
    await start();
    shift('KeyS');
    await screen.findByText('매운 음식도 괜찮으세요?');
    expect(screen.getByText(lines(TEXT.survey.intro))).toBeInTheDocument(); // 1번 질문 인사 = 음성 인사
    expect(screen.getByText(TEXT.survey.progress(1, 4))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TEXT.common.toNormal })).toBeInTheDocument();
    expect(document.querySelector('[data-mode="easy"]')).not.toBeNull();
    click(TEXT.survey.no);
    await screen.findByText('따뜻한 국물이 있는 음식이 좋으세요?');
    expect(screen.queryByText(lines(TEXT.survey.intro))).toBeNull();
    await answerAll(['yes', 'yes', 'no']);
    expect(screen.getAllByRole('button', { name: REC_ADD })).toHaveLength(3);
    clickFirstRec();
    expect(screen.getByText(TEXT.recommend.guideAfter)).toBeInTheDocument();
    await payToDone(TAKEOUT);
  });

  it('쉬운 화면은 이미 담은 메뉴를 다시 눌러도 수량이 늘지 않는다 (디자인 명세 2-5)', async () => {
    await start();
    shift('KeyS');
    await screen.findByText('매운 음식도 괜찮으세요?');
    click(TEXT.survey.exit);
    await screen.findByRole('button', { name: TEXT.menu.ai });
    click(TEXT.add.aria('된장찌개'));
    expect(screen.getByText(TEXT.orderbar.count(1))).toBeInTheDocument();
    click(TEXT.add.ariaDone('된장찌개'));
    expect(screen.getByText(TEXT.orderbar.count(1))).toBeInTheDocument();
  });

  it('쉬운 메뉴판은 한 쪽에 메뉴 4개, 앞/다음 메뉴로 넘긴다', async () => {
    await start();
    shift('KeyS');
    await screen.findByText('매운 음식도 괜찮으세요?');
    click(TEXT.survey.exit);
    await screen.findByRole('button', { name: TEXT.menu.ai });
    expect(screen.getAllByRole('button', { name: REC_ADD })).toHaveLength(4);
    expect(screen.getByText(TEXT.menu.page(1, 2))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TEXT.menu.prev })).toBeDisabled();
    click(TEXT.menu.next);
    expect(screen.getByRole('button', { name: TEXT.add.aria('육개장') })).toBeInTheDocument();
  });

  it('기본 화면 추천은 누를 때마다 1개씩 더 담긴다', async () => {
    await start();
    await toMenu();
    click(TEXT.menu.ai);
    await screen.findByText('매운 음식도 괜찮으세요?');
    await answerAll(['yes', 'yes', 'yes', 'yes']);
    clickFirstRec();
    clickFirstRec();
    expect(screen.getByText(TEXT.orderbar.count(2))).toBeInTheDocument();
    expect(screen.getByText(TEXT.add.doneQty(2))).toBeInTheDocument();
  });

  it('연령대와 나이는 어떤 API 요청에도 들어가지 않는다 (D2, D47)', async () => {
    await start();
    shift('KeyS');
    await screen.findByText('매운 음식도 괜찮으세요?');
    await answerAll(['yes', 'yes', 'yes', 'yes']);
    clickFirstRec();
    await payToDone(DINE_IN);
    for (const r of requests) expect(r.body).not.toMatch(/senior|age|easy/i);
  });

  it('질문 중 "그냥 메뉴 볼래요"는 메뉴판으로, 쉬운 화면 유지 (D17)', async () => {
    await start();
    shift('KeyS');
    await screen.findByText('매운 음식도 괜찮으세요?');
    click(TEXT.survey.exit);
    await screen.findByRole('button', { name: TEXT.menu.ai });
    expect(document.querySelector('[data-mode="easy"]')).not.toBeNull();
  });

  it('8초 타임아웃이면 일반 메뉴판 (D16)', async () => {
    await start();
    emit({ type: 'detecting', frameGroup: 'senior', run: 2, required: 5, elapsedMs: 1000 });
    expect(screen.getByText(lines(TEXT.detecting.guide))).toBeInTheDocument();
    emit({ type: 'timeout' });
    await screen.findByRole('button', { name: TEXT.common.toEasy });
  });

  it('대기·인식 중 화면은 판정 전이라 항상 큰 글씨 크기로 그린다', async () => {
    await start();
    expect(document.querySelector('[data-mode="easy"]')).not.toBeNull();
  });

  it('대기 화면 "바로 주문"은 판정 없이 일반 메뉴판 (D46, v1.2)', async () => {
    await start();
    click(TEXT.idle.startNormal);
    await screen.findByRole('button', { name: TEXT.menu.ai });
    expect(document.querySelector('[data-mode="normal"]')).not.toBeNull();
  });

  it('대기 화면 "큰 글씨로 주문"은 쉬운 화면 질문으로 (v1.2, D68)', async () => {
    await start();
    click(TEXT.idle.startEasy);
    await screen.findByText('매운 음식도 괜찮으세요?');
    expect(document.querySelector('[data-mode="easy"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: TEXT.common.back })).toBeNull(); // 1번 질문에는 "이전" 없음
  });

  it('대기 화면에서 두 버튼 밖을 누르면 아무 일도 없다 (v1.2)', async () => {
    await start();
    fireEvent.click(screen.getByText(GREETING));
    expect(screen.getByText(GREETING)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: TEXT.menu.ai })).toBeNull();
  });

  it('인식 중 화면에서도 두 버튼으로 시작할 수 있다', async () => {
    await start();
    emit({ type: 'detecting', frameGroup: 'senior', run: 1, required: 5, elapsedMs: 100 });
    click(TEXT.idle.startNormal);
    await screen.findByRole('button', { name: TEXT.menu.ai });
  });

  it('수량 1에서 [빼기]는 확인을 거친다: "그대로 두기"면 남고, "빼기"면 빠진다', async () => {
    await start();
    await toMenu();
    click(TEXT.tile.aria('된장찌개', 9000));
    click(TEXT.orderbar.checkout);
    click(DINE_IN);
    click(TEXT.cart.removeAria('된장찌개'));
    expect(screen.getByText(TEXT.cart.confirm)).toBeInTheDocument();
    click(TEXT.cart.confirmNo);
    expect(screen.queryByText(TEXT.cart.confirm)).toBeNull();
    expect(screen.getByRole('button', { name: PAY })).toBeInTheDocument();
    click(TEXT.cart.removeAria('된장찌개'));
    click(TEXT.cart.confirmYes);
    await screen.findByText(TEXT.cart.empty);
  });

  it('장바구니를 다 비워도 장바구니에 머물고 "메뉴 담으러 가기"로 메뉴판 (v1.2)', async () => {
    await start();
    await toMenu();
    click(TEXT.tile.aria('된장찌개', 9000));
    click(TEXT.orderbar.checkout);
    click(DINE_IN);
    click(TEXT.cart.removeAria('된장찌개'));
    click(TEXT.cart.confirmYes);
    await screen.findByText(TEXT.cart.empty);
    expect(screen.queryByRole('button', { name: PAY })).toBeNull();
    click(TEXT.cart.emptyGo);
    await screen.findByRole('button', { name: TEXT.menu.ai });
  });

  it('수량이 2 이상이면 [−]로 하나씩 뺀다', async () => {
    await start();
    await toMenu();
    click(TEXT.tile.aria('된장찌개', 9000));
    click(TEXT.tile.aria('된장찌개', 9000));
    click(TEXT.orderbar.checkout);
    click(DINE_IN);
    expect(screen.getByText(TEXT.cart.qty(2))).toBeInTheDocument();
    click(TEXT.cart.minus('된장찌개'));
    expect(screen.getByText(TEXT.cart.qty(1))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TEXT.cart.removeAria('된장찌개') })).toBeInTheDocument();
  });

  it('결제 중·주문번호 화면에는 모드 전환 버튼이 없고, 결제 실패 화면에는 있다 (v1.2)', async () => {
    await start();
    await toMenu();
    click(TEXT.tile.aria('된장찌개', 9000));
    click(TEXT.orderbar.checkout);
    click(DINE_IN);
    shift('KeyF');
    click(PAY);
    expect(screen.getByText(TEXT.paying.title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: TEXT.common.toEasy })).toBeNull();
    await screen.findByText(lines(TEXT.payFailed.title));
    expect(screen.getByRole('button', { name: TEXT.common.toEasy })).toBeInTheDocument();
    click(TEXT.payFailed.retry);
    await screen.findByText(TEXT.done.title);
    expect(screen.queryByRole('button', { name: TEXT.common.toEasy })).toBeNull();
  });

  it('결제 실패(Shift+F) 뒤 담은 메뉴 요약이 보이고, 고치러 갔다가 다시 결제하면 성공', async () => {
    await start();
    await toMenu();
    click(TEXT.tile.aria('김치찌개', 9000));
    click(TEXT.orderbar.checkout);
    click(DINE_IN);
    shift('KeyF');
    click(PAY);
    await screen.findByText(lines(TEXT.payFailed.title));
    expect(screen.getByText(TEXT.payFailed.summaryLine('김치찌개', 1))).toBeInTheDocument();
    click(TEXT.payFailed.toCart);
    expect(screen.getByText('김치찌개')).toBeInTheDocument();
    click(PAY);
    await screen.findByText(TEXT.done.title);
    const payments = requests.filter(r => r.path.endsWith('/payment'));
    expect(payments).toHaveLength(2);
    expect(new Set(payments.map(p => p.path)).size).toBe(1); // 같은 orderId로 재시도
  });

  it('"처음으로"를 누르면 장바구니와 판정이 모두 지워진다 (D30)', async () => {
    await start();
    await toMenu();
    click(TEXT.tile.aria('갈비탕', 13000));
    await payToDone(DINE_IN);
    expect(screen.getByText(TEXT.done.countdown(15))).toBeInTheDocument();
    click(TEXT.done.home);
    await screen.findByText(GREETING);
    expect(gate.reset).toHaveBeenCalled();
    shift('KeyN');
    await screen.findByText(TEXT.orderbar.empty);
  });

  it('서버가 꺼져 있으면 대기 화면에 "잠시 후 이용해 주세요", 시작 버튼 없음', async () => {
    serverUp = false;
    render(<App />);
    await screen.findByText(lines(TEXT.idle.downTitle));
    expect(screen.queryByRole('button', { name: TEXT.idle.startNormal })).toBeNull();
  });

  it('모델이 아직 로딩 중이어도 대기 화면이 바로 보이고 버튼·단축키로 시작한다 (D46)', async () => {
    gateReady = new Promise(() => {}); // 345MB 모델이 끝나지 않는 상황
    render(<App />);
    await screen.findByText(GREETING);
    await waitFor(() => expect(requests.some(r => r.path === '/api/menu')).toBe(true));
    click(TEXT.idle.startNormal);
    await screen.findByRole('button', { name: TEXT.menu.ai });
  });

  it('모델 로딩 중에도 시연 단축키(Shift+S)는 동작한다', async () => {
    gateReady = new Promise(() => {});
    render(<App />);
    await screen.findByText(GREETING);
    await waitFor(() => expect(requests.some(r => r.path === '/api/questions')).toBe(true));
    shift('KeyS');
    await screen.findByText('매운 음식도 괜찮으세요?');
  });

  it('추론 오류가 오면 일반 메뉴판으로 (kiosk-flow v1.1)', async () => {
    await start();
    emit({ type: 'error', code: 'inference_failed', message: 'x' });
    await screen.findByRole('button', { name: TEXT.common.toEasy });
  });
});
