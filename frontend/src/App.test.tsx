import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgeGate, AgeGateUpdate } from './ai/types';
import { silentSpeaker } from './ai/fallback';
import { createMockBackend } from './mocks/mockBackend';

// 테스트용 판정기: 이벤트를 직접 보낼 수 있다
const listeners = new Set<(u: AgeGateUpdate) => void>();
const emit = (u: AgeGateUpdate) => act(() => listeners.forEach(cb => cb(u)));
const gate: AgeGate = {
  backend: 'wasm',
  start: vi.fn(), stop: vi.fn(), reset: vi.fn(),
  force: group => listeners.forEach(cb => cb({ type: 'decided', group, confidence: 1, source: 'forced' })),
  onUpdate: cb => { listeners.add(cb); return () => listeners.delete(cb); },
};
vi.mock('./ai/loadAi', () => ({
  loadAi: async () => ({ ageGate: gate, speaker: silentSpeaker, modelReady: false }),
}));

const { App } = await import('./App');

let requests: { path: string; body: string }[] = [];
let serverUp = true;

beforeEach(() => {
  listeners.clear();
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
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

async function start() {
  render(<App />);
  await screen.findByText('어서 오세요');
  await waitFor(() => expect(listeners.size).toBe(1));
  await waitFor(() => expect(requests.some(r => r.path === '/api/menu')).toBe(true));
}

async function payToDone(orderType: '매장에서 먹기' | '포장하기') {
  click('주문하기');
  click(orderType);
  click(/결제하기$/);
  await screen.findByText('주문이 끝났어요');
}

describe('키오스크 전체 흐름', () => {
  it('55 미만(Shift+N): 메뉴판 → 담기 → 매장 → 결제 → 주문번호', async () => {
    await start();
    shift('KeyN');
    await screen.findByRole('button', { name: 'AI와 대화하기' });
    expect(screen.getByRole('button', { name: '쉬운 화면으로 보기' })).toBeInTheDocument();
    click('된장찌개 9,000원 담기');
    click('된장찌개 9,000원 담기');
    expect(screen.getByText('담은 메뉴 2개')).toBeInTheDocument();
    await payToDone('매장에서 먹기');
    expect(screen.getByLabelText('주문번호 001')).toBeInTheDocument();
  });

  it('55+(Shift+S): 쉬운 화면 질문 4개 → 추천 3개 → 포장 → 주문번호', async () => {
    await start();
    shift('KeyS');
    await screen.findByText('매운 음식도 괜찮으세요?');
    expect(screen.getByRole('button', { name: '일반 화면으로 보기' })).toBeInTheDocument();
    expect(document.querySelector('[data-mode="easy"]')).not.toBeNull();
    click('아니요');
    await screen.findByText('따뜻한 국물이 있는 음식이 좋으세요?');
    click('네');
    click('네');
    click('아니요');
    await screen.findByText('이런 메뉴는 어떠세요?');
    expect(screen.getAllByText(/^추천 \d$/)).toHaveLength(3);
    click(/^추천 1 /);
    await payToDone('포장하기');
  });

  it('연령대와 나이는 어떤 API 요청에도 들어가지 않는다 (D2, D47)', async () => {
    await start();
    shift('KeyS');
    await screen.findByText('매운 음식도 괜찮으세요?');
    for (let i = 0; i < 4; i++) click('네');
    await screen.findByText('이런 메뉴는 어떠세요?');
    click(/^추천 1 /);
    await payToDone('매장에서 먹기');
    for (const r of requests) expect(r.body).not.toMatch(/senior|age|easy/i);
  });

  it('질문 중 "그냥 메뉴 볼래요"는 메뉴판으로, 쉬운 화면 유지 (D17)', async () => {
    await start();
    shift('KeyS');
    await screen.findByText('매운 음식도 괜찮으세요?');
    click('그냥 메뉴 볼래요');
    await screen.findByRole('button', { name: 'AI와 대화하기' });
    expect(document.querySelector('[data-mode="easy"]')).not.toBeNull();
  });

  it('8초 타임아웃이면 일반 메뉴판 (D16)', async () => {
    await start();
    emit({ type: 'detecting', frameGroup: 'senior', run: 2, required: 5, elapsedMs: 1000 });
    expect(screen.getByText('반가워요')).toBeInTheDocument();
    emit({ type: 'timeout' });
    await screen.findByRole('button', { name: '쉬운 화면으로 보기' });
  });

  it('대기 화면을 누르면 판정 없이 일반 메뉴판 (D46)', async () => {
    await start();
    fireEvent.click(screen.getByText('어서 오세요'));
    await screen.findByRole('button', { name: 'AI와 대화하기' });
  });

  it('결제 실패(Shift+F) 뒤 장바구니가 남아 있고 다시 결제하면 성공', async () => {
    await start();
    shift('KeyN');
    await screen.findByRole('button', { name: 'AI와 대화하기' });
    click('김치찌개 9,000원 담기');
    click('주문하기');
    click('매장에서 먹기');
    shift('KeyF');
    click(/결제하기$/);
    await screen.findByText('결제가 되지 않았어요');
    click('장바구니로');
    expect(screen.getByText('김치찌개')).toBeInTheDocument();
    click(/결제하기$/);
    await screen.findByText('주문이 끝났어요');
    const payments = requests.filter(r => r.path.endsWith('/payment'));
    expect(payments).toHaveLength(2);
    expect(new Set(payments.map(p => p.path)).size).toBe(1); // 같은 orderId로 재시도
  });

  it('"처음으로"를 누르면 장바구니와 판정이 모두 지워진다 (D30)', async () => {
    await start();
    shift('KeyN');
    await screen.findByRole('button', { name: 'AI와 대화하기' });
    click('갈비탕 13,000원 담기');
    await payToDone('매장에서 먹기');
    click('처음으로');
    await screen.findByText('어서 오세요');
    expect(gate.reset).toHaveBeenCalled();
    shift('KeyN');
    await screen.findByText('메뉴를 누르면 담겨요');
  });

  it('서버가 꺼져 있으면 대기 화면에 "잠시 후 이용해 주세요"', async () => {
    serverUp = false;
    render(<App />);
    await screen.findByText('잠시 후 이용해 주세요');
  });
});
