import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KioskNext from './KioskNext';
import { createCatalog } from './catalog';
import { defaultRecommender, type Recommender } from './recommender';
import type { ChatReply, Menu } from './types';

const menu = (id: string, name: string, price: number, extra: Partial<Menu> = {}): Menu => ({
  id, name, price, category: 'dimsum', kind: '', spicy: 0, texture: [], flavor: [], ingredients: [],
  quantityUnit: '4개입', servingPeople: 2, pairings: [], ...extra,
});
const catalog = createCatalog([
  menu('d1', '하가우', 9800, { pairings: ['d2'] }),
  menu('d2', '쇼마이', 9800),
  menu('d3', '품절 딤섬', 9000, { soldOut: true }),
  menu('n1', '볶음면', 12000, { category: 'noodle', options: ['굴소스', '마늘소스'] }),
]);
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openMenu() {
  const user = userEvent.setup();
  render(<KioskNext catalog={catalog} />);
  await user.click(screen.getByRole('button', { name: /메뉴 보고 주문/ }));
  await user.click(screen.getByRole('button', { name: '딤섬' }));
  return user;
}

describe('KioskNext', () => {
  it('시작 화면에서 두 갈래 길을 보여 준다', () => {
    render(<KioskNext catalog={catalog} />);
    expect(screen.getByRole('button', { name: /메뉴 보고 주문/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /말로 추천 받아 주문/ })).toBeInTheDocument();
  });

  it('카드로 담고, 수량을 바꾸고, 지우면 합계가 따라간다', async () => {
    const user = await openMenu();
    const dock = screen.getByRole('region', { name: '담은 메뉴' });
    expect(within(dock).getByRole('button', { name: '주문하기' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: `하가우 담기, ${won(9800)}` }));
    await user.click(screen.getByRole('button', { name: '하가우 하나 더' }));
    expect(screen.getByLabelText('하가우 수량')).toHaveTextContent('2개');
    expect(dock).toHaveTextContent(won(19600));

    await user.click(screen.getByRole('button', { name: '하가우 하나 빼기' }));
    await user.click(screen.getByRole('button', { name: '하가우 하나 빼기' }));
    expect(within(dock).getByRole('button', { name: '주문하기' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: `하가우 담기, ${won(9800)}` }));
    await user.click(within(dock).getByRole('button', { name: /목록 보기/ }));
    await user.click(within(dock).getByRole('button', { name: '하가우 삭제' }));
    expect(within(dock).getByRole('button', { name: '주문하기' })).toBeDisabled();
  });

  it('품절 메뉴는 담을 수 없다', async () => {
    await openMenu();
    expect(screen.getByRole('button', { name: /품절 딤섬 품절/ })).toBeDisabled();
  });

  it('옵션이 있는 메뉴는 옵션을 먼저 고르게 한다', async () => {
    const user = userEvent.setup();
    render(<KioskNext catalog={catalog} />);
    await user.click(screen.getByRole('button', { name: /메뉴 보고 주문/ }));
    await user.click(screen.getByRole('button', { name: '면' }));
    await user.click(screen.getByRole('button', { name: `볶음면 담기, ${won(12000)}` }));
    expect(screen.getByRole('dialog')).toHaveTextContent('볶음면 옵션을 골라 주세요');
    await user.click(screen.getByRole('button', { name: '마늘소스' }));
    expect(screen.getByLabelText('볶음면 수량')).toHaveTextContent('1개');
    await user.click(within(screen.getByRole('region', { name: '담은 메뉴' })).getByRole('button', { name: /목록 보기/ }));
    expect(screen.getByText('볶음면 (마늘소스)')).toBeInTheDocument();
  });

  it('초성으로 메뉴를 찾는다', async () => {
    const user = await openMenu();
    await user.click(screen.getByRole('button', { name: '메뉴 찾기' }));
    await user.click(screen.getByRole('button', { name: 'ㅅ' }));
    await user.click(screen.getByRole('button', { name: 'ㅁ' }));
    expect(screen.getByRole('heading', { name: '쇼마이' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '하가우' })).not.toBeInTheDocument();
  });

  it('주문부터 결제, 완료까지 가고 처음으로 돌아오면 비워진다', async () => {
    const user = await openMenu();
    await user.click(screen.getByRole('button', { name: `하가우 담기, ${won(9800)}` }));
    await user.click(screen.getByRole('button', { name: '주문하기' }));

    // 담은 메뉴를 한 번 더 확인하고 결제로 간다
    const confirm = screen.getByRole('dialog');
    expect(confirm).toHaveTextContent('담은 메뉴를 확인해 주세요');
    expect(within(confirm).getByRole('list', { name: '담은 메뉴' })).toHaveTextContent(`하가우1개${won(9800)}`);
    await user.click(within(confirm).getByRole('button', { name: '이대로 결제하기' }));
    expect(screen.getByRole('heading', { name: '결제 방법을 선택해 주세요' })).toBeInTheDocument();
    const pay = screen.getByRole('button', { name: `${won(9800)} 결제하기` });
    // 먹는 곳·결제 수단을 고르기 전에 누르면 결제로 가지 않고, 안 고른 칸을 반짝이며 안내한다
    const dinePanel = screen.getByRole('heading', { name: '어디에서 드시나요?' }).closest('section');
    const methodPanel = screen.getByRole('heading', { name: '결제 수단' }).closest('section');
    expect(pay).toHaveAttribute('aria-disabled', 'true');
    await user.click(pay);
    expect(screen.getByRole('alert')).toHaveTextContent('매장에서 드실지 포장하실지, 결제 수단을 먼저 골라 주세요.');
    expect(dinePanel).toHaveClass('is-nudged');
    expect(methodPanel).toHaveClass('is-nudged');
    await user.click(screen.getByRole('button', { name: '포장하기' }));
    expect(dinePanel).not.toHaveClass('is-nudged');
    expect(pay).toHaveAttribute('aria-disabled', 'true'); // 결제 수단이 아직 비어 있다
    // 간편결제는 세 가지 페이 중 하나까지 골라야 한다
    await user.click(screen.getByRole('button', { name: /간편결제/ }));
    expect(pay).toHaveAttribute('aria-disabled', 'true');
    await user.click(pay);
    expect(screen.getByRole('alert')).toHaveTextContent('간편결제 종류를 먼저 골라 주세요.');
    expect(methodPanel).toHaveClass('is-nudged-pills'); // 페이 버튼들만 반짝인다
    expect(methodPanel).not.toHaveClass('is-nudged');
    await user.click(screen.getByRole('button', { name: '카카오페이' }));
    expect(pay).toHaveAttribute('aria-disabled', 'false');
    await user.click(pay);
    await user.click(screen.getByRole('button', { name: '결제 진행하기' }));

    expect(screen.getByRole('heading', { name: '주문이 완료되었어요' })).toBeInTheDocument();
    expect(screen.getByText('001')).toBeInTheDocument();
    expect(screen.getByText(/포장 주문이에요/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '처음 화면으로 돌아가기' }));
    expect(screen.getByRole('button', { name: /메뉴 보고 주문/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /메뉴 보고 주문/ }));
    expect(within(screen.getByRole('region', { name: '담은 메뉴' })).getByRole('button', { name: '주문하기' })).toBeDisabled();
  });

  it('글자 크게를 누르면 큰 글씨 화면이 된다', async () => {
    const user = userEvent.setup();
    const { container } = render(<KioskNext catalog={catalog} />);
    expect(container.querySelector('.kx')).not.toHaveClass('large');
    await user.click(screen.getByRole('button', { name: '글자 크게' }));
    expect(container.querySelector('.kx')).toHaveClass('large');
    expect(screen.getByRole('button', { name: '기본 글씨' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('말로 추천: 예시 요청 → 이해한 내용 확인 → 추천 결과', async () => {
    const user = userEvent.setup();
    render(<KioskNext />);
    await user.click(screen.getByRole('button', { name: /말로 추천 받아 주문/ }));
    await user.click(screen.getByRole('button', { name: '말로 추천받기 시작' }));
    await user.click(screen.getByRole('button', { name: '두 명이고 베이징덕 먹고 싶어요' }));
    expect(screen.getByRole('heading', { name: '이렇게 이해했어요' })).toBeInTheDocument();
    expect(screen.getByLabelText('인원')).toHaveTextContent('2명');
    await user.click(screen.getByRole('button', { name: '맞아요, 추천해주세요' }));
    expect(screen.getByRole('heading', { name: '이 메뉴는 어떠세요?' })).toBeInTheDocument();
  });

  describe('직원 AI 질문에 맞는 터치 답 버튼', () => {
    const BLANK = { party: 1, spicy: null, kind: '상관없음', texture: '상관없음', exclude: [], budget: null, totalBudget: null };
    /** 서버(/api/context, /api/chat)만 가짜로. 손님이 보낸 문장을 기록합니다. */
    function fakeServer(replies: ChatReply[]) {
      const sent: string[] = [];
      const recommender: Recommender = {
        ...defaultRecommender,
        context: async () => null,
        converse: async turns => {
          const last = turns.at(-1);
          if (last?.role === 'user') sent.push(last.text);
          return replies.shift() ?? null;
        },
      };
      return { recommender, sent };
    }
    async function startChat(recommender: Recommender) {
      const user = userEvent.setup();
      render(<KioskNext recommender={recommender} />);
      await user.click(screen.getByRole('button', { name: /말로 추천 받아 주문/ }));
      await user.click(screen.getByRole('button', { name: '말로 추천받기 시작' }));
      return user;
    }

    it('질문 문장에 단서가 없어도 서버가 알려 준 asking대로 버튼을 띄운다', async () => {
      // "어떻게 드릴까요?"만으로는 화면이 무엇을 묻는지 알 수 없다. 서버가 spicy라고 알려 준다.
      const { recommender } = fakeServer([{ reply: '어떻게 드릴까요?', conditions: BLANK, mood: null, picks: [], done: false, asking: 'spicy' }]);
      await startChat(recommender);
      expect(await screen.findByRole('button', { name: /매운 건 못 먹어요/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /혼자 왔어요/ })).not.toBeInTheDocument();
    });

    it('인원·맵기·종류·재료가 아닌 질문에는 예/아니요로 답하고, 누른 말이 그대로 서버로 간다', async () => {
      const { recommender, sent } = fakeServer([
        { reply: '오늘 기분은 어떠세요?', conditions: { ...BLANK, party: 2 }, mood: null, picks: [], done: false, asking: 'other' },
        { reply: '매운 음식도 괜찮으세요?', conditions: { ...BLANK, party: 2 }, mood: null, picks: [], done: false, asking: 'spicy' },
      ]);
      const user = await startChat(recommender);
      const yes = await screen.findByRole('button', { name: /^네,? ?좋아요$/ });
      expect(screen.getByRole('button', { name: /^아니요,? ?다른 걸로요$/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /혼자 왔어요/ })).not.toBeInTheDocument();
      await user.click(yes);
      expect(sent).toEqual(['네, 좋아요']);
    });
  });
});
