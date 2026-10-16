import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import menuData from './menu/menus.json';
import type { Menu } from './types';
import { MenuCard } from './MenuCard';
import { addLines, lineKey, suggestions, withDefaultOption } from './cart';
import { chosung, matchesChosung } from './hangul';

const menus: Menu[] = menuData;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open',''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('cart and search helpers', () => {
  it('keeps different options of the same menu on separate lines', () => {
    const lines = addLines(addLines([], [{ id: 'vegetable-6', quantity: 1, option: '굴소스' }]), [{ id: 'vegetable-6', quantity: 2, option: '마늘소스' }, { id: 'vegetable-6', quantity: 1, option: '굴소스' }]);
    expect(lines.map(l => [lineKey(l), l.quantity])).toEqual([['vegetable-6|마늘소스', 2], ['vegetable-6|굴소스', 2]]);
    expect(withDefaultOption({ id: 'vegetable-6', quantity: 1 }, menus).option).toBe('굴소스');
    expect(addLines([], [{ id: 'pork-4', quantity: 1 }, { id: 'noodle-1', quantity: 1 }, { id: 'noodle-4', quantity: 1 }]).map(l => l.id)).toEqual(['pork-4', 'noodle-1', 'noodle-4']);
  });
  it('suggests pairings that are not in the cart yet', () => {
    const names = suggestions([{ id: 'noodle-5', quantity: 1 }], menus).map(m => m.name);
    expect(names).toEqual(['수제 군만두', '생등심 탕수육']);
    expect(suggestions([{ id: 'noodle-5', quantity: 1 }, { id: 'dimsum-13', quantity: 1 }], menus).map(m => m.name)).toEqual(['생등심 탕수육']);
  });
  it('finds menus by initial consonants', () => {
    expect(chosung('해물 짬뽕')).toBe('ㅎㅁㅉㅃ');
    expect(menus.filter(m => matchesChosung(m.name, 'ㅉㅃ')).map(m => m.name)).toEqual(['깻잎 차돌 짬뽕', '해물 짬뽕']);
  });
});

describe('kiosk parity features', () => {
  it('blocks sold-out menus on the card', () => {
    const onSelect = vi.fn();
    render(<MenuCard menu={{ ...menus[0], soldOut: true }} quantity={0} onSelect={onSelect} onInfo={vi.fn()}/>);
    expect(screen.getByRole('button',{name:/품절/})).toBeDisabled();
  });
  it('asks for an option before adding a menu that has one', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/메뉴 보고 주문/}));
    await user.click(screen.getByRole('button',{name:'야채'}));
    await user.click(screen.getByRole('button',{name:/^청경채 야채볶음 선택/}));
    expect(screen.getByRole('dialog')).toHaveTextContent('청경채 야채볶음 옵션을 골라 주세요');
    await user.click(screen.getByRole('button',{name:'마늘소스'}));
    expect(screen.getByLabelText('청경채 야채볶음 (마늘소스) 수량')).toHaveTextContent('1');
  });
  it('suggests side dishes before payment and lets the guest add one', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/메뉴 보고 주문/}));
    await user.click(screen.getByRole('button',{name:'면'}));
    await user.click(screen.getByRole('button',{name:/^해물 짬뽕 선택/}));
    await user.click(screen.getByRole('button',{name:'주문하기'}));
    const dialog=screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('함께 드시면 좋아요');
    await user.click(within(dialog).getAllByRole('button',{name:'추가'})[0]);
    await user.click(screen.getByRole('button',{name:'결제하러 가기'}));
    expect(screen.getByText('수제 군만두')).toBeInTheDocument();
  });
  it('shows the right progress steps for each path', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/말로 추천 받아 주문/}));
    expect(screen.getByLabelText('주문 진행 단계').querySelector('[aria-current="step"]')).toHaveTextContent('말로 요청');
    await user.click(screen.getByRole('button',{name:'말로 추천받기 시작'}));
    expect(screen.getByLabelText('주문 진행 단계').querySelector('[aria-current="step"]')).toHaveTextContent('말로 요청');
    await user.click(screen.getByRole('button',{name:'딤섬 먹고 싶어요. 새우는 빼주세요'}));
    expect(screen.getByLabelText('주문 진행 단계').querySelector('[aria-current="step"]')).toHaveTextContent('추천 확인');
  });
  it('searches menus with the on-screen consonant keypad', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/메뉴 보고 주문/}));
    await user.click(screen.getByRole('button',{name:'메뉴 찾기'}));
    await user.click(screen.getByRole('button',{name:'ㅎ'}));
    await user.click(screen.getByRole('button',{name:'ㄱ'}));
    expect(screen.getByRole('button',{name:/^하가우 선택/})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/^베이징덕 한 마리 선택/})).not.toBeInTheDocument();
  });
  it('turns on high contrast and low screen from screen settings', async () => {
    const user=userEvent.setup();const {container}=render(<App/>);
    await user.click(screen.getByRole('button',{name:'화면 설정'}));
    await user.click(screen.getByRole('button',{name:/고대비 화면/}));
    await user.click(screen.getByRole('button',{name:/낮은 화면/}));
    expect(container.querySelector('.kiosk')).toHaveClass('contrast','low');
    expect(screen.getByText(/낮은 화면 모드예요/)).toBeInTheDocument();
  });
  it('calls staff from the help button', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:'직원 호출 · 도움'}));
    await user.click(screen.getByRole('button',{name:'직원 호출하기'}));
    expect(screen.getByRole('dialog')).toHaveTextContent('호출 알림음을 울렸어요');
  });
  it('shows a large order number with dine-in or takeout', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/메뉴 보고 주문/}));
    await user.click(screen.getByRole('button',{name:'딤섬'}));
    await user.click(screen.getByRole('button',{name:/^하가우 선택/}));
    await user.click(screen.getByRole('button',{name:'주문하기'}));
    await user.click(screen.getByRole('button',{name:'포장하기'}));
    await user.click(screen.getByRole('button',{name:/결제하기$/}));
    await user.click(screen.getByRole('button',{name:'결제 진행하기'}));
    expect(document.querySelector('.order-number')).toHaveTextContent('주문 번호001포장 주문이에요');
    expect(screen.getByLabelText('주문 진행 단계').querySelector('[aria-current="step"]')).toHaveTextContent('03완료');
    expect(screen.getByLabelText('주문 진행 단계')).not.toHaveTextContent('말로 요청');
  });
});
