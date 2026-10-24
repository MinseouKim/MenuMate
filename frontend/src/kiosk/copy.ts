// 화면과 음성 안내 문구 중 Frontend가 정하는 것 (questions.md "TTS 규칙"). 질문 문구는 서버에서 받는다.
import type { OrderType, Reason } from '../api/contracts';

export const REASON_LABEL: Record<Reason, string> = {
  spicy: '매콤한 맛',
  mild: '순한 맛',
  soup: '따뜻한 국물',
  soft: '부드러운 식감',
  hearty: '든든한 한 끼',
  store_pick: '사장님 추천',
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  dine_in: '매장에서 먹기',
  takeout: '포장하기',
};

export const CAMERA_NOTICE = '연령대 추정을 위해 카메라를 사용하며 영상은 저장되지 않습니다';

export const SPEECH = {
  greeting: '안녕하세요. 몇 가지 여쭤보고 메뉴를 추천해 드릴게요. 네 또는 아니요를 눌러 주세요.',
  recommend: '추천 메뉴 세 가지를 골랐어요. 마음에 드는 메뉴를 눌러 담아 주세요.',
  orderType: '드시고 가세요, 포장하세요?',
  cart: '주문 내용을 확인하시고 결제하기를 눌러 주세요.',
  paying: '결제하고 있어요. 잠시만 기다려 주세요.',
  done: (orderNumber: string) => `주문이 끝났어요. 주문번호는 ${Number(orderNumber)}번입니다. 감사합니다.`,
};

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
