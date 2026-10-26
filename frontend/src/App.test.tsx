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
const FIRST_REC = (name: string) => dummyMenu.items.some(i => name === TEXT.recommend.add(1, i.name, i.price));
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
  click(TEXT.cartBar.checkout);
  click(orderType);
  click(PAY);
  await screen.findByText(TEXT.done.title);
}

describe('키오스크 전체 흐름', () => {
  it('55 미만(Shift+N): 메뉴판 → 담기 → 매장 → 결제 → 주문번호', async () => {
    await start();
    shift('KeyN');
    await screen.findByRole('button', { name: TEXT.menu.chat });
    expect(screen.getByRole('button', { name: TEXT.common.toEasy })).toBeInTheDocument();
    click(TEXT.tile.add('된장찌개', 9000));
    click(TEXT.tile.add('된장찌개', 9000));
    expect(screen.getByText(TEXT.cartBar.count(2))).toBeInTheDocument();
    await payToDone(DINE_IN);
    expect(screen.getByLabelText(TEXT.done.numberAria('001'))).toBeInTheDocument();
  });

  it('55+(Shift+S): 쉬운 화면 질문 4개 → 추천 3개 → 포장 → 주문번호', async () => {
    await start();
    shift('KeyS');
    await screen.findByText('매운 음식도 괜찮으세요?');
    expect(screen.getByRole('button', { name: TEXT.common.toNormal })).toBeInTheDocument();
    expect(document.querySelector('[data-mode="easy"]')).not.toBeNull();
    click(TEXT.survey.no);
    await screen.findByText('따뜻한 국물이 있는 음식이 좋으세요?');
    click(TEXT.survey.yes);
    click(TEXT.survey.yes);
    click(TEXT.survey.no);
    await screen.findByText(TEXT.recommend.title);
    for (const n of [1, 2, 3]) expect(screen.getByText(TEXT.recommend.rank(n))).toBeInTheDocument();
    click(FIRST_REC);
    await payToDone(TAKEOUT);
  });

  it('연령대와 나이는 어떤 API 요청에도 들어가지 않는다 (D2, D47)', async () => {
    await start();
    shift('KeyS');
    await screen.findByText('매운 음식도 괜찮으세요?');
    for (let i = 0; i < 4; i++) click(TEXT.survey.yes);
    await screen.findByText(TEXT.recommend.title);
    click(FIRST_REC);
    await payToDone(DINE_IN);
    for (const r of requests) expect(r.body).not.toMatch(/senior|age|easy/i);
  });

  it('질문 중 "그냥 메뉴 볼래요"는 메뉴판으로, 쉬운 화면 유지 (D17)', async () => {
    await start();
    shift('KeyS');
    await screen.findByText('매운 음식도 괜찮으세요?');
    click(TEXT.survey.exit);
    await screen.findByRole('button', { name: TEXT.menu.chat });
    expect(document.querySelector('[data-mode="easy"]')).not.toBeNull();
  });

  it('8초 타임아웃이면 일반 메뉴판 (D16)', async () => {
    await start();
    emit({ type: 'detecting', frameGroup: 'senior', run: 2, required: 5, elapsedMs: 1000 });
    expect(screen.getByText(TEXT.detecting.title)).toBeInTheDocument();
    emit({ type: 'timeout' });
    await screen.findByRole('button', { name: TEXT.common.toEasy });
  });

  it('대기 화면 "바로 주문"은 판정 없이 일반 메뉴판 (D46, v1.2)', async () => {
    await start();
    click(TEXT.idle.startNormal);
    await screen.findByRole('button', { name: TEXT.menu.chat });
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
    expect(screen.queryByRole('button', { name: TEXT.menu.chat })).toBeNull();
  });

  it('인식 중 화면에서도 두 버튼으로 시작할 수 있다', async () => {
    await start();
    emit({ type: 'detecting', frameGroup: 'senior', run: 1, required: 5, elapsedMs: 100 });
    click(TEXT.idle.startNormal);
    await screen.findByRole('button', { name: TEXT.menu.chat });
  });

  it('장바구니를 다 비워도 장바구니에 머물고 "메뉴 담으러 가기"로 메뉴판 (v1.2)', async () => {
    await start();
    shift('KeyN');
    await screen.findByRole('button', { name: TEXT.menu.chat });
    click(TEXT.tile.add('된장찌개', 9000));
    click(TEXT.cartBar.checkout);
    click(DINE_IN);
    click(TEXT.cart.minus('된장찌개'));
    await screen.findByText(TEXT.cart.empty);
    expect(screen.queryByRole('button', { name: PAY })).toBeNull();
    click(TEXT.cart.goMenu);
    await screen.findByRole('button', { name: TEXT.menu.chat });
  });

  it('결제 중·주문번호 화면에는 모드 전환 버튼이 없고, 결제 실패 화면에는 있다 (v1.2)', async () => {
    await start();
    shift('KeyN');
    await screen.findByRole('button', { name: TEXT.menu.chat });
    click(TEXT.tile.add('된장찌개', 9000));
    click(TEXT.cartBar.checkout);
    click(DINE_IN);
    shift('KeyF');
    click(PAY);
    expect(screen.getByText(TEXT.paying.title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: TEXT.common.toEasy })).toBeNull();
    await screen.findByText(TEXT.payFailed.title);
    expect(screen.getByRole('button', { name: TEXT.common.toEasy })).toBeInTheDocument();
    click(TEXT.payFailed.retry);
    await screen.findByText(TEXT.done.title);
    expect(screen.queryByRole('button', { name: TEXT.common.toEasy })).toBeNull();
  });

  it('결제 실패(Shift+F) 뒤 장바구니가 남아 있고 다시 결제하면 성공', async () => {
    await start();
    shift('KeyN');
    await screen.findByRole('button', { name: TEXT.menu.chat });
    click(TEXT.tile.add('김치찌개', 9000));
    click(TEXT.cartBar.checkout);
    click(DINE_IN);
    shift('KeyF');
    click(PAY);
    await screen.findByText(TEXT.payFailed.title);
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
    shift('KeyN');
    await screen.findByRole('button', { name: TEXT.menu.chat });
    click(TEXT.tile.add('갈비탕', 13000));
    await payToDone(DINE_IN);
    click(TEXT.done.home);
    await screen.findByText(GREETING);
    expect(gate.reset).toHaveBeenCalled();
    shift('KeyN');
    await screen.findByText(TEXT.cartBar.empty);
  });

  it('서버가 꺼져 있으면 대기 화면에 "잠시 후 이용해 주세요"', async () => {
    serverUp = false;
    render(<App />);
    await screen.findByText(lines(TEXT.idle.serverDown));
  });

  it('모델이 아직 로딩 중이어도 대기 화면이 바로 보이고 터치·단축키로 시작한다 (D46)', async () => {
    gateReady = new Promise(() => {}); // 345MB 모델이 끝나지 않는 상황
    render(<App />);
    await screen.findByText(GREETING);
    await waitFor(() => expect(requests.some(r => r.path === '/api/menu')).toBe(true));
    click(TEXT.idle.startNormal);
    await screen.findByRole('button', { name: TEXT.menu.chat });
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
