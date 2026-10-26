// 화면에 보이는 문구와 음성 안내(TTS) 문장을 모두 여기에 둔다. 문구는 디자이너가 정한다 (D60, design/copy.md).
// 화면 컴포넌트에는 한국어 문장을 직접 쓰지 않는다. 질문 문구만 서버(GET /api/questions)에서 받는다.
// 줄바꿈이 필요한 문구는 배열로 둔다 (한 원소 = 한 줄).
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

export const TEXT = {
  common: {
    back: '이전',
    toEasy: '쉬운 화면으로 보기',
    toNormal: '일반 화면으로 보기',
    retry: '다시 시도',
    close: '닫기',
    appName: 'MenuMate',
  },
  idle: {
    greeting: ['어서', '오세요'],
    serverDown: ['잠시 후', '이용해 주세요'],
    serverDownDetail: '주문 준비를 하고 있어요',
    guide: '화면 앞에 서 계시면 보기 편한 화면으로 바꿔 드려요',
    start: '눌러서 주문 시작',
  },
  detecting: {
    title: '반가워요',
    detail: '보기 편한 화면을 준비하고 있어요',
    skip: '기다리지 않으려면 화면을 눌러 주세요',
  },
  survey: {
    progress: (n: number, total: number) => `질문 ${n} / ${total}`,
    replay: '다시 듣기',
    yes: '네',
    no: '아니요',
    exit: '그냥 메뉴 볼래요',
    waiting: ['추천 메뉴를', '고르고 있어요'],
  },
  recommend: {
    title: '이런 메뉴는 어떠세요?',
    guide: '마음에 드는 메뉴를 누르면 담겨요',
    rank: (n: number) => `추천 ${n}`,
    add: (n: number, name: string, price: number) => `추천 ${n} ${name} ${won(price)} 담기`,
    moreMenu: '다른 메뉴 보기',
  },
  menu: {
    chat: 'AI와 대화하기',
    prevPage: '앞 메뉴',
    nextPage: '다음 메뉴',
    page: (n: number, total: number) => `${n} / ${total}`,
  },
  tile: {
    add: (name: string, price: number) => `${name} ${won(price)} 담기`,
    inCart: (qty: number) => `${qty}개 담음`,
  },
  cartBar: {
    empty: '메뉴를 누르면 담겨요',
    count: (n: number) => `담은 메뉴 ${n}개`,
    checkout: '주문하기',
  },
  orderType: {
    title: ['드시고 가세요?', '포장하세요?'],
  },
  cart: {
    title: '주문 내용을 확인해 주세요',
    minus: (name: string) => `${name} 하나 빼기`,
    plus: (name: string) => `${name} 하나 더하기`,
    total: '합계',
    pay: (amount: number) => `${won(amount)} 결제하기`,
    more: '메뉴 더 담기',
  },
  paying: {
    title: '결제하고 있어요',
    detail: '잠시만 기다려 주세요',
  },
  payFailed: {
    title: '결제가 되지 않았어요',
    fallbackReason: '다시 시도해 주세요.',
    cartKept: '담은 메뉴는 그대로 있어요',
    retry: '다시 결제하기',
    toCart: '장바구니로',
  },
  done: {
    title: '주문이 끝났어요',
    numberLabel: '주문번호',
    numberAria: (num: string) => `주문번호 ${num}`,
    pickup: '번호를 부르면 받아 가세요',
    countdown: (s: number) => `${s}초 뒤 처음 화면으로 돌아가요`,
    home: '처음으로',
  },
};

export function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}
