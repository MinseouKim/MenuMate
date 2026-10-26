// 화면 문구와 음성 안내(TTS) 문장. 원본은 디자이너의 design/copy.md v1 이다 (D60). 항목 이름은 그 문서의 ID와 같게 둔다.
// 화면 컴포넌트에는 한국어 문장을 직접 쓰지 않는다. 질문 4개 문구만 서버(GET /api/questions)에서 받는다.
// 줄바꿈이 필요한 문구는 배열로 둔다 (한 원소 = 한 줄, copy.md 의 `/` 자리).
import type { OrderType, Reason } from '../api/contracts';

export function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 추천 이유 (questions.md 계약 문구 그대로) */
export const REASON_LABEL: Record<Reason, string> = {
  spicy: '매콤한 맛',
  mild: '순한 맛',
  soup: '따뜻한 국물',
  soft: '부드러운 식감',
  hearty: '든든한 한 끼',
  store_pick: '사장님 추천',
};

/** 추천 이유는 기여 순서대로 최대 2개, 쉼표로 */
export const reasonsText = (reasons: readonly Reason[]) => reasons.slice(0, 2).map(r => REASON_LABEL[r]).join(', ');

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  dine_in: '여기서 먹어요',
  takeout: '포장해 가요',
};

/**
 * 질문을 두 줄로 끊는 자리 (design/copy.md 3장 표의 `/`). 질문 문구는 서버에서 받으므로 문구 대신 "몇 번째 낱말 뒤"만 둔다.
 * 표에 없는 질문은 끊지 않고 화면 폭에 맡긴다 (word-break: keep-all).
 */
const QUESTION_BREAK_AFTER_WORDS: Record<string, number> = { q_spicy: 2, q_soup: 3, q_soft: 2, q_hearty: 1 };

export function questionLines(q: { id: string; text: string }): string[] {
  const at = QUESTION_BREAK_AFTER_WORDS[q.id];
  const words = q.text.split(' ');
  if (!at || at >= words.length) return [q.text];
  return [words.slice(0, at).join(' '), words.slice(at).join(' ')];
}

const ORDINAL = ['첫', '두', '세', '네', '다섯', '여섯'];

export const TEXT = {
  common: {
    back: '이전',
    toEasy: '큰 글씨로 보기',
    toNormal: '기본 화면으로',
    appName: 'MenuMate',
    cameraNotice: ['연령대를 알아보려고 카메라를 씁니다.', '영상은 저장하지 않습니다.'],
  },
  orderbar: {
    empty: '아직 담은 메뉴가 없어요',
    count: (n: number) => `담은 메뉴 ${n}개`,
    checkout: '주문하기',
  },
  idle: {
    greeting: ['어서', '오세요'],
    guide: ['화면 앞에 잠시 서 계시면', '글씨를 크게 바꿔 드려요.'],
    cameraHint: '카메라는 화면 위에 있어요.',
    choose: '기다리지 않으려면 아래에서 골라 주세요.',
    startEasy: '큰 글씨로 주문',
    startEasyGlyph: '가',
    startNormal: '바로 주문',
    downTitle: ['잠시 후', '이용해', '주세요'],
    downBody: '주문 준비를 하고 있어요.',
  },
  detecting: {
    guide: ['보기 편한 화면을', '준비하고 있어요…'],
  },
  survey: {
    progress: (n: number, total: number) => `질문 ${total}개 중 ${ORDINAL[n - 1] ?? n} 번째`,
    intro: ['몇 가지 여쭤보고 메뉴를 골라 드릴게요.', '네, 아니요로 답해 주세요.'],
    replay: '다시 듣기',
    speaking: '읽어 드리는 중…',
    yes: '네',
    no: '아니요',
    exit: '그냥 메뉴 볼래요',
    waitTitle: ['추천 메뉴를', '고르고 있어요…'],
    waitBody: '잠시만 기다려 주세요.',
  },
  recommend: {
    title: ['이런 메뉴는', '어떠세요?'],
    guide: '마음에 드는 메뉴의 담기를 눌러 주세요.',
    guideAfter: '다 고르셨으면 아래 주문하기를 눌러 주세요.',
    more: '다른 메뉴 보기',
  },
  menu: {
    ai: 'AI에게 메뉴 추천받기',
    prev: '앞 메뉴',
    next: '다음 메뉴',
    page: (i: number, n: number) => `${n}쪽 중 ${i}쪽`,
    loadErrorTitle: ['메뉴를', '불러오지 못했어요'],
    loadErrorBody: '다시 시도를 눌러 주세요. 계속 안 되면 직원을 불러 주세요.',
    retry: '다시 시도',
    recFailed: ['추천을 받지 못했어요.', '메뉴판에서 골라 주세요.'],
    close: '닫기',
  },
  add: {
    button: '담기',
    done: '담았어요',
    doneQty: (n: number) => `${n}개 담음`,
    aria: (name: string) => `${name} 담기`,
    ariaDone: (name: string) => `${name} 담았어요`,
  },
  tile: {
    add: '담기',
    added: (n: number) => `${n}개 담음`,
    aria: (name: string, price: number) => `${name} ${won(price)} 담기`,
  },
  orderType: {
    title: ['드시고 가세요?', '포장하세요?'],
  },
  cart: {
    title: ['주문을', '확인해 주세요'],
    qty: (n: number) => `${n}개`,
    minus: (name: string) => `${name} 하나 빼기`,
    plus: (name: string) => `${name} 하나 더하기`,
    remove: '빼기',
    removeAria: (name: string) => `${name} 빼기`,
    confirm: '이 메뉴를 뺄까요?',
    confirmYes: '빼기',
    confirmNo: '그대로 두기',
    total: '합계',
    pay: (amount: number) => `${won(amount)} 결제하기`,
    more: '메뉴 더 담기',
    empty: '담은 메뉴가 없어요',
    emptyBody: '메뉴를 담은 뒤에 결제할 수 있어요.',
    emptyGo: '메뉴 담으러 가기',
  },
  paying: {
    title: '결제하고 있어요…',
    body: '잠시만 기다려 주세요.',
  },
  payFailed: {
    title: ['결제가', '되지 않았어요'],
    fallbackReason: '결제가 끝나지 않았어요.',
    keep: '담은 메뉴는 그대로 있어요.',
    summaryLine: (name: string, qty: number) => `${name} ${qty}개`,
    summaryTotal: (amount: number) => `합계 ${won(amount)}`,
    retry: '다시 결제하기',
    toCart: '담은 메뉴 고치기',
  },
  done: {
    title: '주문이 끝났어요',
    label: '주문번호',
    numberAria: (num: string) => `주문번호 ${Number(num)}번`,
    stamp: '접수',
    pickup: ['번호를 부르면', '받아 가세요'],
    countdown: (s: number) => `${s}초 뒤에 처음 화면으로 돌아가요.`,
    home: '처음으로',
  },
};

/** 음성 안내 문장 (copy.md 3·4장). 어느 모드에서 읽는지는 useKiosk 가 정한다 */
export const SPEECH = {
  surveyIntro: `안녕하세요. ${TEXT.survey.intro.join(' ')}`,
  recommend: '추천 메뉴 세 가지를 골랐어요. 마음에 드는 메뉴의 담기를 눌러 주세요.',
  menu: '메뉴판이에요. 위에서 종류를 고르고, 드실 메뉴의 담기를 눌러 주세요.',
  recFailed: TEXT.menu.recFailed.join(' '),
  added: (name: string) => `${name}, 담았어요.`,
  addAgain: '이미 담았어요. 개수는 주문 확인에서 바꿀 수 있어요.',
  orderType: '드시고 가세요, 포장하세요?',
  cart: '주문을 확인해 주세요. 맞으면 결제하기를 눌러 주세요.',
  cartEmpty: '담은 메뉴가 없어요. 메뉴 담으러 가기를 눌러 주세요.',
  removeConfirm: (name: string) => `${name}, 이 메뉴를 뺄까요?`,
  removed: (name: string) => `${name}, 뺐어요.`,
  paying: '결제하고 있어요. 잠시만 기다려 주세요.',
  payFailed: (reason: string) => `${reason} ${TEXT.payFailed.keep} 다시 결제하기를 눌러 주세요.`,
  done: (orderNumber: string) =>
    `주문이 끝났어요. 주문번호는 ${Number(orderNumber)}번입니다. 번호를 부르면 받아 가세요.`,
};
