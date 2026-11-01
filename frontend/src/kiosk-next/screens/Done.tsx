// 주문 완료: 주문 번호와 영수증 QR. QR을 찍을 시간만큼(DONE_MS) 띄웠다가 처음 화면으로 돌아갑니다.
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { isLocalBase, receiptUrl } from '../../prototype/receiptLink';
import { DONE_MS, type Kiosk } from '../useKiosk';

function Countdown({ ms }: { ms: number }) {
  const [left, setLeft] = useState(Math.round(ms / 1000));
  useEffect(() => { const t = setInterval(() => setLeft(n => Math.max(0, n - 1)), 1000); return () => clearInterval(t); }, []);
  return <p className="kx-countdown" aria-live="off"><strong>{left}초</strong> 뒤 처음 화면으로 돌아가요</p>;
}

export function Done({ kiosk }: { kiosk: Kiosk }) {
  const { state, catalog, act } = kiosk;
  const { order } = state;
  const [qr, setQr] = useState('');
  useEffect(() => {
    if (!order) return;
    let alive = true;
    QRCode.toString(receiptUrl(order, [...catalog.menus]), { type: 'svg', margin: 4, errorCorrectionLevel: 'M' })
      .then(svg => { if (alive) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); })
      .catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [order, catalog]);

  return (
    <div className="kx-page kx-done">
      <div className="kx-done-mark" aria-hidden="true">✓</div>
      <h1>주문이 완료되었어요</h1>
      {order && (
        <div className="kx-order-number">
          <span>주문 번호</span>
          <strong>{order.number}</strong>
          <p>{order.payment?.dine === '포장' ? '포장 주문이에요. 번호가 불리면 카운터에서 받아 가세요.' : '매장 식사 주문이에요. 번호가 불리면 카운터에서 받아 가세요.'}</p>
        </div>
      )}
      <p className="kx-muted">아래 QR 코드를 휴대폰 카메라로 찍으면 영수증을 받을 수 있어요.</p>
      {order && qr && (
        <div className="kx-qr">
          <img src={qr} alt="휴대폰으로 영수증 받기 QR 코드" />
          <div>
            <strong>휴대폰으로 영수증 받기</strong>
            <p>카메라로 QR 코드를 찍으면 영수증이 열려요.</p>
            {import.meta.env.DEV && isLocalBase() && <p className="kx-alert">운영자 안내: 지금 주소는 이 컴퓨터 안에서만 열려요. 휴대폰에서 열리게 하려면 배포 주소를 VITE_RECEIPT_BASE_URL에 넣어 주세요.</p>}
          </div>
        </div>
      )}
      <Countdown ms={DONE_MS} />
      <button className="kx-btn kx-btn-primary" onClick={() => act.reset('welcome', true)}>처음 화면으로 돌아가기</button>
      <p className="kx-muted">전시 체험용 주문이라 실제 결제는 되지 않았어요.</p>
    </div>
  );
}
