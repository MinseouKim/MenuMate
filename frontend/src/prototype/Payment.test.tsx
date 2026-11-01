import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Payment } from './Payment';
import type { Menu } from './types';

const menu: Menu = { id:'test', name:'청경채 야채볶음', price:15000, category:'vegetable', kind:'야채', spicy:0, texture:[], flavor:[], ingredients:[], quantityUnit:'', servingPeople:2, pairings:[], options:['굴소스','마늘소스'] };
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open',''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);
describe('payment flow', () => {
  it('asks dine-in or takeout before paying', async () => {
    const user = userEvent.setup(); const done = vi.fn();
    render(<Payment lines={[{id:'test',quantity:2,option:'마늘소스'}]} menus={[menu]} onBack={vi.fn()} onComplete={done}/>);
    expect(screen.getByText('청경채 야채볶음 (마늘소스)')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'30,000원 결제하기'})).toBeDisabled();
    await user.click(screen.getByRole('button',{name:'포장하기'}));
    await user.click(screen.getByRole('button',{name:'30,000원 결제하기'}));
    expect(screen.getByRole('dialog')).toHaveTextContent('카드결제로 결제할까요?');
    await user.dblClick(screen.getByRole('button',{name:'결제 진행하기'}));
    expect(done).toHaveBeenCalledExactlyOnceWith({method:'카드결제',amount:30000,dine:'포장'});
  });
  it('pays with a simple-pay provider and allows changing the method', async () => {
    const user = userEvent.setup(); const done = vi.fn();
    render(<Payment lines={[{id:'test',quantity:1,option:'굴소스'}]} menus={[menu]} onBack={vi.fn()} onComplete={done}/>);
    await user.click(screen.getByRole('button',{name:'매장에서 먹기'}));
    await user.click(screen.getByRole('button',{name:/간편결제/}));
    await user.click(screen.getByRole('button',{name:'네이버페이'}));
    await user.click(screen.getByRole('button',{name:'15,000원 결제하기'}));
    expect(screen.getByRole('dialog')).toHaveTextContent('네이버페이로 결제할까요?');
    await user.click(screen.getByRole('button',{name:'결제 수단 변경'}));
    expect(done).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'15,000원 결제하기'}));
    await user.click(screen.getByRole('button',{name:'결제 진행하기'}));
    expect(done).toHaveBeenCalledWith({method:'네이버페이',amount:15000,dine:'매장'});
  });
  it('no longer offers exhibition points', () => {
    render(<Payment lines={[{id:'test',quantity:1}]} menus={[menu]} onBack={vi.fn()} onComplete={vi.fn()}/>);
    expect(screen.queryByText(/포인트/)).not.toBeInTheDocument();
  });
});
