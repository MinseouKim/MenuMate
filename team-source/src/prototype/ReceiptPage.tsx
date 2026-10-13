// 키오스크 영수증의 QR을 휴대폰으로 찍으면 열리는 화면입니다. 주소(#/receipt/...)에 담긴 주문 내용만 보여 줍니다.
import menuData from './menu/menus.json';
import type { Menu } from './types';
import { Receipt } from './Receipt';
import { decodeOrder } from './receiptLink';
import './styles/cart-list.css';
import './styles/receipt-page.css';

const menus: Menu[] = menuData;
// 영수증 아래에 띄울 설문 주소(구글 폼 등). .env의 VITE_SURVEY_URL로 정합니다.
const survey = import.meta.env.VITE_SURVEY_URL;

export function ReceiptPage({ code }: { code: string }) {
  const order = decodeOrder(code, menus);
  return <main className="receipt-page">
    <header><strong>menumate</strong><span>우루루 본점</span></header>
    {order ? <>
      <h1>주문해 주셔서 감사합니다</h1>
      <p className="receipt-page-note">전시 체험용 영수증이에요. 실제 결제 내역이 아니에요.</p>
      <div className="done"><Receipt order={order}/></div>
      {survey && <a className="primary survey-link" href={survey} target="_blank" rel="noreferrer">30초 설문 참여하기</a>}
      {survey && <p className="receipt-page-note">체험이 어떠셨는지 알려 주시면 작품을 다듬는 데 쓸게요.</p>}
    </> : <>
      <h1>영수증을 열 수 없어요</h1>
      <p className="receipt-page-note">QR 주소가 잘렸거나 바뀌었어요. 키오스크에서 다시 찍어 주세요.</p>
    </>}
    <footer>말로 고르고, 이유와 함께 추천받는 키오스크 · menumate</footer>
  </main>;
}
