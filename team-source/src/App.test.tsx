import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { WebSpeechSttProvider } from './services/stt/webSpeechSttProvider';
import menuData from './prototype/menu/menus.json';
import { KioskAI } from './prototype/recommendation';
import { encodeOrder } from './prototype/receiptLink';
import type { Menu } from './prototype/types';
const menus: Menu[] = menuData;
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const hargow = menus.find(m => m.name === '하가우')!;
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open',''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('React prototype', () => {
  it('card selection, independent info, quantity, deletion and totals', async () => {
    const user = userEvent.setup(); render(<App/>);
    await user.click(screen.getByRole('button',{name:/메뉴 보고 주문/}));
    await user.click(screen.getByRole('button',{name:'딤섬'}));
    const order = screen.getByRole('region',{name:'담은 메뉴'});
    await user.click(screen.getByRole('button',{name:'하가우 설명 보기'}));
    expect(screen.getByRole('dialog')).toHaveTextContent(hargow.description!);
    expect(within(order).getByRole('button',{name:'주문하기'})).toBeDisabled();
    await user.click(screen.getByRole('button',{name:'팝업 닫기'}));
    await user.click(screen.getByRole('button',{name:`하가우 선택, ${won(hargow.price)}`}));
    await user.click(screen.getByRole('button',{name:'하가우 수량 늘리기'}));
    expect(screen.getByLabelText('하가우 수량')).toHaveTextContent('2');
    expect(order.querySelector('.order-list-total')).toHaveTextContent(won(hargow.price*2));
    await user.click(screen.getByRole('button',{name:'하가우 수량 줄이기'}));
    expect(screen.getByRole('button',{name:'하가우 수량 줄이기'})).toBeDisabled();
    await user.click(screen.getByRole('button',{name:'하가우 삭제'}));
    expect(within(order).getByRole('button',{name:'주문하기'})).toBeDisabled();
  });
  it('order confirmation completes and clears the session', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/메뉴 보고 주문/}));
    await user.click(screen.getByRole('button',{name:'딤섬'}));
    await user.click(screen.getByRole('button',{name:`하가우 선택, ${won(hargow.price)}`}));
    await user.click(screen.getByRole('button',{name:'주문하기'}));
    expect(screen.getByRole('heading',{name:'결제 방법을 선택해 주세요'})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'매장에서 먹기'}));
    await user.click(screen.getByRole('button',{name:`${won(hargow.price)} 결제하기`}));
    expect(screen.getByRole('dialog')).toHaveTextContent('카드결제로 결제할까요?');
    await user.click(screen.getByRole('button',{name:'결제 진행하기'}));
    expect(screen.getByRole('heading',{name:'주문이 완료되었어요'})).toBeInTheDocument();
    const receipt=screen.getByRole('region',{name:'영수증'});
    expect(receipt).toHaveTextContent('주문 번호001');
    expect(receipt).toHaveTextContent(`하가우1개${won(hargow.price)}`);
    expect(within(receipt).getByText('합계').parentElement).toHaveTextContent(won(hargow.price));
    await user.click(screen.getByRole('button',{name:'처음 화면으로 돌아가기'}));
    await user.click(screen.getByRole('button',{name:/메뉴 보고 주문/}));
    expect(screen.getByRole('button',{name:'주문하기'})).toBeDisabled();
  });
  it('touch recommendation preserves quantities and budget', async () => {
    const budget=50000;
    const top=KioskAI.recommend({...KioskAI.extract(''),party:2,spicy:0,budget},menus)[0];
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/말로 추천받기/}));
    await user.click(screen.getByRole('button',{name:'버튼으로 취향 고르기'}));
    await user.click(screen.getByRole('button',{name:'인원 늘리기'}));
    expect(screen.getByLabelText('인원')).toHaveTextContent('2명');
    await user.click(screen.getByRole('button',{name:'순한맛'}));
    await user.click(screen.getByRole('button',{name:'5만원 이하'}));
    expect(screen.getByRole('button',{name:'5만원 이하'})).toHaveAttribute('aria-pressed','true');
    await user.click(screen.getByRole('button',{name:'맞아요, 추천해주세요'}));
    await user.click(screen.getAllByRole('button',{name:'이 조합 담기'})[0]);
    for (const l of top.lines) expect(screen.getByLabelText(`${menus.find(m=>m.id===l.id)!.name} 수량`)).toHaveTextContent(String(l.quantity));
    expect(screen.getByRole('region',{name:'담은 메뉴'}).querySelector('.order-list-total')).toHaveTextContent(won(top.total));
  });
  it('blocked microphone explains how to allow it', async () => {
    vi.spyOn(WebSpeechSttProvider.prototype,'isSupported').mockReturnValue(true);
    const start=vi.spyOn(WebSpeechSttProvider.prototype,'start');
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{ throw new DOMException('denied','NotAllowedError'); }}});
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/말로 추천받기/}));
    await user.click(screen.getByRole('button',{name:'말로 추천받기 시작'}));
    fireEvent.keyDown(screen.getByRole('button',{name:/누르고 있는 동안 말하기/}),{key:'Enter'});
    expect(await screen.findByRole('alert')).toHaveTextContent('주소창 왼쪽 아이콘에서 마이크를');
    expect(start).not.toHaveBeenCalled();
  });
  it('releasing before the permission is granted asks to press again', async () => {
    vi.spyOn(WebSpeechSttProvider.prototype,'isSupported').mockReturnValue(true);
    const start=vi.spyOn(WebSpeechSttProvider.prototype,'start').mockImplementation(()=>{});
    let grant!: () => void;
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise(r=>{grant=()=>r({getTracks:()=>[]});})}});
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/말로 추천받기/}));
    await user.click(screen.getByRole('button',{name:'말로 추천받기 시작'}));
    const talk=screen.getByRole('button',{name:/누르고 있는 동안 말하기/});
    fireEvent.keyDown(talk,{key:'Enter'});fireEvent.keyUp(talk,{key:'Enter'});
    await act(async()=>grant());
    expect(screen.getByRole('status')).toHaveTextContent('다시 누르고 말해 주세요');
    expect(start).not.toHaveBeenCalled();
    fireEvent.keyDown(talk,{key:'Enter'});
    expect(start).toHaveBeenCalledOnce();
  });
  it('previous-screen returns along the path actually taken', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/말로 추천받기/}));
    await user.click(screen.getByRole('button',{name:'버튼으로 취향 고르기'}));
    await user.click(screen.getByRole('button',{name:'이전 화면'}));
    expect(screen.getByRole('heading',{name:/취향을 알려주시면/})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'말로 추천받기 시작'}));
    await user.click(screen.getByRole('button',{name:'버튼으로 고르기'}));
    await user.click(screen.getByRole('button',{name:'이전 화면'}));
    expect(screen.getByRole('button',{name:/누르고 있는 동안 말하기/})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'이전 화면'}));
    await user.click(screen.getByRole('button',{name:'이전 화면'}));
    expect(screen.getByRole('heading',{name:/무엇을/})).toBeInTheDocument();
  });
  it('puts the newest item at the top of the order list', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/메뉴 보고 주문/}));
    await user.click(screen.getByRole('button',{name:'딤섬'}));
    await user.click(screen.getByRole('button',{name:/^하가우 선택/}));
    await user.click(screen.getByRole('button',{name:/^쇼마이 선택/}));
    const names=[...screen.getByRole('region',{name:'담은 메뉴'}).querySelectorAll('.order-item-title strong')].map(n=>n.textContent);
    expect(names).toEqual(['쇼마이','하가우']);
  });
  it('asks after a minute of inactivity and then clears the order', async () => {
    vi.useFakeTimers({shouldAdvanceTime:true});
    try {
      const user=userEvent.setup({advanceTimers:vi.advanceTimersByTime});render(<App/>);
      await user.click(screen.getByRole('button',{name:/메뉴 보고 주문/}));
      await user.click(screen.getByRole('button',{name:'딤섬'}));
      await user.click(screen.getByRole('button',{name:/^하가우 선택/}));
      await act(async()=>{ vi.advanceTimersByTime(59_000); });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await act(async()=>{ vi.advanceTimersByTime(2_000); });
      expect(screen.getByRole('dialog')).toHaveTextContent('계속 주문하시겠어요?');
      await act(async()=>{ vi.advanceTimersByTime(20_000); });
      expect(screen.getByRole('heading',{name:/무엇을/})).toBeInTheDocument();
      await user.click(screen.getByRole('button',{name:/메뉴 보고 주문/}));
      expect(screen.getByRole('button',{name:'주문하기'})).toBeDisabled();
    } finally { vi.useRealTimers(); }
  });
  it('auto reset also turns off large text for the next visitor', async () => {
    vi.useFakeTimers({shouldAdvanceTime:true});
    try {
      const user=userEvent.setup({advanceTimers:vi.advanceTimersByTime});render(<App/>);
      await user.click(screen.getByRole('button',{name:'글자 크게'}));
      await user.click(screen.getByRole('button',{name:/메뉴 보고 주문/}));
      await act(async()=>{ vi.advanceTimersByTime(61_000); });
      await act(async()=>{ vi.advanceTimersByTime(20_000); });
      expect(screen.getByRole('button',{name:'글자 크게'})).toHaveAttribute('aria-pressed','false');
    } finally { vi.useRealTimers(); }
  });
  it('shows a QR code for the receipt after payment', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/메뉴 보고 주문/}));
    await user.click(screen.getByRole('button',{name:'딤섬'}));
    await user.click(screen.getByRole('button',{name:`하가우 선택, ${won(hargow.price)}`}));
    await user.click(screen.getByRole('button',{name:'주문하기'}));
    await user.click(screen.getByRole('button',{name:'포장하기'}));
    await user.click(screen.getByRole('button',{name:/결제하기$/}));
    await user.click(screen.getByRole('button',{name:'결제 진행하기'}));
    expect(await screen.findByAltText('휴대폰으로 영수증 받기 QR 코드')).toHaveAttribute('src',expect.stringMatching(/^data:image\/svg\+xml/));
  });
  it('opens the phone receipt page from the QR address', async () => {
    const order={number:'012',paidAt:new Date(),total:hargow.price*2,items:[{id:hargow.id,name:hargow.name,quantity:2,price:hargow.price}]};
    location.hash=`#/receipt/${encodeOrder(order)}`;
    try {
      render(<App/>);
      expect(screen.getByRole('heading',{name:'주문해 주셔서 감사합니다'})).toBeInTheDocument();
      expect(screen.getByRole('region',{name:'영수증'})).toHaveTextContent(`하가우2개${won(hargow.price*2)}`);
    } finally { location.hash=''; }
  });
  it('demo hotkey runs a prepared request without the microphone', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.keyboard('{Control>}{Shift>}1{/Shift}{/Control}');
    expect(screen.getByRole('heading',{name:'이렇게 이해했어요'})).toBeInTheDocument();
    expect(screen.getByText('새우 제외')).toBeInTheDocument();
  });
  it('voice guide reads the recommendations aloud', async () => {
    const said: string[] = [];
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel:()=>{},speak:(u:{text:string})=>said.push(u.text)}});
    (globalThis as unknown as {SpeechSynthesisUtterance:unknown}).SpeechSynthesisUtterance=class { text:string; lang=''; rate=1; constructor(t:string){this.text=t;} };
    try {
      const user=userEvent.setup();render(<App/>);
      await user.click(screen.getByRole('button',{name:/음성 안내/}));
      await user.click(screen.getByRole('button',{name:/말로 추천받기/}));
      await user.click(screen.getByRole('button',{name:'버튼으로 취향 고르기'}));
      await user.click(screen.getByRole('button',{name:'맞아요, 추천해주세요'}));
      expect(said.at(-1)).toMatch(/^추천 메뉴 3가지예요\. 1번, .+원\./);
    } finally { Reflect.deleteProperty(window,'speechSynthesis'); }
  });
  it('highlights how the request was understood', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.click(screen.getByRole('button',{name:/말로 추천받기/}));
    await user.click(screen.getByRole('button',{name:'말로 추천받기 시작'}));
    await user.click(screen.getByRole('button',{name:'두 명이고 베이징덕 먹고 싶어요'}));
    expect(screen.getByText('인원 2명')).toBeInTheDocument();
    expect(screen.getByText('종류 베이징덕/생선')).toBeInTheDocument();
  });
});
