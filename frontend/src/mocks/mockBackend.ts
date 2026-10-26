// 개발용 가짜 Backend. docs/contracts/api.md 와 questions.md 를 그대로 따른다.
// VITE_MOCK_API=true 이면 Vite 개발 서버가 /api/* 를 여기로 보낸다 (viteMockApi.ts). 빌드 결과물에는 들어가지 않는다.
// 질문 문구와 점수는 Backend 코드가 원본이다. 이 파일은 통합(10/26) 전까지만 쓰는 복사본이다.
import type { MenuItem, Order, OrderLine, Question, Reason, Tag } from '../api/contracts.ts';
import { dummyMenu } from './menu.dummy.ts';

type Score = Partial<Record<Tag, number>>;
const QUESTIONS: (Question & { yes: Score; no: Score })[] = [
  { id: 'q_spicy', order: 1, text: '매운 음식도 괜찮으세요?', yes: { spicy: 2, mild: -1 }, no: { spicy: -3, mild: 1 } },
  { id: 'q_soup', order: 2, text: '따뜻한 국물이 있는 음식이 좋으세요?', yes: { soup: 2 }, no: { soup: -1 } },
  { id: 'q_soft', order: 3, text: '부드럽게 드실 수 있는 음식이 좋으세요?', yes: { soft: 2 }, no: {} },
  { id: 'q_hearty', order: 4, text: '든든하게 드시고 싶으세요?', yes: { hearty: 2 }, no: { hearty: -1 } },
];

export interface MockResponse { status: number; body: unknown }
export interface MockBackend { handle(method: string, path: string, body: unknown): Promise<MockResponse> }

const ok = (body: unknown, status = 200): MockResponse => ({ status, body });
const fail = (status: number, code: string, message: string): MockResponse => ({ status, body: { error: { code, message } } });
const invalid = () => fail(400, 'VALIDATION_FAILED', '요청 형식이 올바르지 않아요.');

const menuItems = (): MenuItem[] => dummyMenu.items.filter(i => i.isAvailable).map(i => ({
  id: i.id, name: i.name, price: i.price, categoryId: i.categoryId, description: i.description,
  imageUrl: i.image ? `/static/${i.image}` : null, tags: i.tags, priority: i.priority, sortOrder: i.sortOrder,
}));

function recommend(answers: { questionId: string; answer: string }[]) {
  const prefs: Score = {};
  for (const a of answers) {
    const q = QUESTIONS.find(x => x.id === a.questionId);
    if (!q || (a.answer !== 'yes' && a.answer !== 'no')) continue;
    for (const [t, v] of Object.entries(q[a.answer])) prefs[t as Tag] = (prefs[t as Tag] ?? 0) + v;
  }
  return menuItems()
    .map(menu => {
      const score = menu.tags.reduce((s, t) => s + (prefs[t] ?? 0), 0) + menu.priority * 1.5;
      const reasons: Reason[] = menu.tags.filter(t => (prefs[t] ?? 0) > 0).sort((a, b) => (prefs[b] ?? 0) - (prefs[a] ?? 0));
      if (menu.priority > 0) reasons.push('store_pick');
      return { menu, score, reasons };
    })
    .sort((a, b) => b.score - a.score || b.menu.priority - a.menu.priority
      || a.menu.sortOrder - b.menu.sortOrder || a.menu.id.localeCompare(b.menu.id))
    .slice(0, 3);
}

export function createMockBackend({ payDelayMs = 1500 }: { payDelayMs?: number } = {}): MockBackend {
  const orders = new Map<string, Order>();
  let orderSeq = 0;
  let numberDay = '';
  let numberSeq = 0;

  const nextOrderNumber = () => {
    const today = new Date().toLocaleDateString('sv-SE');
    if (today !== numberDay) { numberDay = today; numberSeq = 0; }
    numberSeq = (numberSeq % 999) + 1;
    return String(numberSeq).padStart(3, '0');
  };

  return {
    async handle(method, path, body) {
      const b = (body ?? {}) as Record<string, any>;
      if (method === 'GET' && path === '/api/health') return ok({ ok: true });
      if (method === 'GET' && path === '/api/menu') {
        return ok({ storeName: dummyMenu.storeName, categories: dummyMenu.categories, items: menuItems() });
      }
      if (method === 'GET' && path === '/api/questions') {
        return ok({ questions: QUESTIONS.map(({ id, order, text }) => ({ id, order, text })) });
      }
      if (method === 'POST' && path === '/api/recommendations') {
        const answers = b.answers;
        if (!Array.isArray(answers) || new Set(answers.map(a => a?.questionId)).size !== answers.length) return invalid();
        return ok({ items: recommend(answers) });
      }
      if (method === 'POST' && path === '/api/orders') {
        if (!['dine_in', 'takeout'].includes(b.orderType) || !Array.isArray(b.items)
          || b.items.length < 1 || b.items.length > 20) return invalid();
        const merged = new Map<string, number>();
        for (const it of b.items) {
          if (!Number.isInteger(it?.quantity) || it.quantity < 1 || it.quantity > 9) return invalid();
          merged.set(it.menuId, (merged.get(it.menuId) ?? 0) + it.quantity);
        }
        const all = menuItems();
        const lines: OrderLine[] = [];
        for (const [menuId, quantity] of merged) {
          const menu = all.find(i => i.id === menuId);
          if (!menu) return fail(400, 'MENU_NOT_FOUND', '없는 메뉴가 들어 있어요. 처음부터 다시 해 주세요.');
          lines.push({ menuId, name: menu.name, unitPrice: menu.price, quantity: Math.min(quantity, 9), lineTotal: menu.price * Math.min(quantity, 9) });
        }
        const order: Order = {
          orderId: `mock-${++orderSeq}`, orderType: b.orderType, status: 'pending_payment', lines,
          totalAmount: lines.reduce((s, l) => s + l.lineTotal, 0), orderNumber: null, paidAt: null,
        };
        orders.set(order.orderId, order);
        return ok(order, 201);
      }
      const pay = method === 'POST' ? path.match(/^\/api\/orders\/([^/]+)\/payment$/) : null;
      if (pay) {
        const order = orders.get(decodeURIComponent(pay[1]));
        if (!order) return fail(404, 'ORDER_NOT_FOUND', '주문을 찾을 수 없어요. 처음부터 다시 해 주세요.');
        if (order.status === 'paid') return fail(409, 'ORDER_ALREADY_PAID', '이미 결제된 주문이에요.');
        if (payDelayMs > 0) await new Promise(r => setTimeout(r, payDelayMs));
        if (b.simulate === 'fail') {
          return ok({ result: 'fail', reason: '카드 승인이 되지 않았어요. 다시 시도해 주세요.', order: { ...order } });
        }
        Object.assign(order, { status: 'paid', orderNumber: nextOrderNumber(), paidAt: new Date().toISOString() });
        return ok({ result: 'success', order: { ...order } });
      }
      return fail(404, 'NOT_FOUND', '요청한 주소가 없어요.');
    },
  };
}
