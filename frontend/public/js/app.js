// MenuMate 키오스크 화면
// - 메뉴판 전체를 보여 주다가, 말로 대화하면 대화에 맞는 메뉴만 남긴다 ('전체 메뉴 보기'로 되돌림)
// - 웹캠 추정 나이에 맞춰 글자 크기를 자동으로 바꾸고, 크게 볼 때는 주문 절차를 3단계로 줄인다
// - 아래 공통 버튼 4개는 모든 화면·글자 크기에서 같은 자리에 있다
import { loadModels, startFace, stopFace, ageToLevel } from '/ai/face.js';
import { createPushToTalk, speak, sttSupported } from '/ai/voice.js';

const $ = (id) => document.getElementById(id);
const won = (n) => `${n.toLocaleString('ko-KR')}원`;
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

/* ---------- 상태 ---------- */
const LEVEL_NAMES = ['보통', '크게', '아주 크게'];
const FLOWS = {
  normal: { screens: ['order', 'cart', 'place', 'pay'], labels: ['메뉴 고르기', '주문 확인', '먹고 가기·포장', '결제'] },
  simple: { screens: ['order', 'cart', 'pay'], labels: ['메뉴 고르기', '주문 확인', '결제'] }
};
const TABS = ['전체', '대표 메뉴', '식사', '요리', '딤섬', '코스·세트'];

const state = {
  menus: [],
  level: 0,
  levelSource: null,     // 'auto'(카메라) | 'manual'(손님이 버튼으로) | null
  ageGroup: 'unknown',   // 서버에는 이 단어만 보낸다
  screen: 'order',
  tab: '전체',
  filter: null,          // { ids:[], reasons:{id:text}, top:[id], understood }
  conversation: [],      // AI 응답 기록 ('이전' 버튼으로 한 단계씩 되돌림)
  context: null,
  cart: new Map(),
  place: null,
  present: false,
  cameraOn: false,
  lastTouch: Date.now(),
  hinted: false,
  orderNo: 100
};
const isSimple = () => state.level >= 1;           // 크게 볼 때 = 쉬운 절차
const flow = () => FLOWS[isSimple() ? 'simple' : 'normal'];

/* ---------- 공통 ---------- */
let toastTimer;
function toast(msg, ms = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
const say = (text) => speak(text, { rate: isSimple() ? 0.85 : 1 });
const cartItems = () => [...state.cart.values()];
const cartTotal = () => cartItems().reduce((s, it) => s + it.price * it.qty, 0);
const cartCount = () => cartItems().reduce((s, it) => s + it.qty, 0);

/* ---------- 글자 크기 · 절차 ---------- */
function setLevel(level, source) {
  state.level = level;
  state.levelSource = source;
  document.documentElement.dataset.level = String(level);
  // 크게 볼 때는 30개 전체 대신 대표 메뉴부터 (고를 것을 줄인다)
  if (level >= 1 && state.tab === '전체') state.tab = '대표 메뉴';
  if (level === 0 && state.tab === '대표 메뉴') state.tab = '전체';
  $('sizeLabel').textContent = LEVEL_NAMES[level];
  if (state.screen === 'place' && isSimple()) go('cart', { replace: true }); // 쉬운 절차에는 없는 화면
  renderSteps();
  renderBoard();
  renderCart();
  window.dispatchEvent(new CustomEvent('menumate:profile', { detail: { ageGroup: state.ageGroup, level } }));
}

// 카메라가 추정한 나이 → 자동 적용. 손님이 직접 바꿨으면 그 선택을 존중한다.
function applyAge(age, group) {
  state.ageGroup = group;
  $('devAge').textContent = `연령대: ${group} (추정 ${age}세)`;
  if (state.levelSource === 'manual') return;
  const level = ageToLevel(age);
  if (level === state.level) return;
  setLevel(level, 'auto');
  if (level > 0) {
    toast('글씨를 크게 바꿨어요. 아래 ‘글자 크기’로 언제든 바꿀 수 있어요.', 5000);
    say('글씨를 크게 바꿨어요. 빨간 버튼을 누르고 드시고 싶은 걸 말씀해 주세요.');
  }
}

/* ---------- 화면 이동 ---------- */
function go(screen, { replace = false } = {}) {
  if (screen !== 'order') ptt.cancel();
  if (!replace && screen !== state.screen) state.prevScreen = state.screen;
  state.screen = screen;
  for (const s of ['order', 'cart', 'place', 'pay', 'done']) $(`screen-${s}`).hidden = s !== screen;
  renderSteps();
  renderDock();
  if (screen === 'cart') renderCart();
  if (screen === 'pay') $('payTotal').textContent = won(cartTotal());
  window.scrollTo({ top: 0 });
}

function nextScreen() {
  const list = flow().screens;
  const i = list.indexOf(state.screen);
  return list[i + 1] || 'done';
}

function renderSteps() {
  const { screens, labels } = flow();
  const i = screens.indexOf(state.screen);
  $('steps').replaceChildren(...labels.map((l, k) =>
    el('li', { class: k === i ? 'now' : null, 'aria-current': k === i ? 'step' : null }, `${k + 1} ${l}`)));
}

function resetAll({ keepProfile = false } = {}) {
  ptt.cancel();
  state.filter = null;
  state.conversation = [];
  state.context = null;
  state.cart.clear();
  state.place = null;
  state.tab = '전체';
  state.hinted = false;
  $('heard').textContent = '';
  $('reply').hidden = true;
  $('moreModal').hidden = true;
  document.querySelectorAll('[data-place],[data-pay]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  if (!keepProfile) {
    state.ageGroup = 'unknown';
    setLevel(0, null);
  }
  state.tab = isSimple() ? '대표 메뉴' : '전체';
  go('order', { replace: true });
  renderBoard();
}

/* ---------- 메뉴판 ---------- */
function inTab(m) {
  switch (state.tab) {
    case '전체': return true;
    case '대표 메뉴': return m.popular;
    case '코스·세트': return m.category === '코스' || m.category === '세트';
    default: return m.category === state.tab;
  }
}

function renderTabs() {
  $('tabs').hidden = !!state.filter;
  $('tabs').replaceChildren(...TABS.map((t) => el('button', {
    'aria-pressed': String(t === state.tab),
    onclick: () => { state.tab = t; renderTabs(); renderBoard(); }
  }, t)));
}

function renderBoard() {
  renderTabs();
  const f = state.filter;
  let list;
  if (f) {
    list = f.ids.map((id) => state.menus.find((m) => m.id === id)).filter(Boolean);
    if (isSimple()) list = list.slice(0, 4); // 크게 볼 때는 고를 것을 줄인다
  } else {
    list = state.menus.filter(inTab);
  }

  $('filterBar').hidden = !f;
  if (f) {
    $('filterCount').textContent = f.fallback ? `대표 메뉴 ${list.length}개` : `대화에 맞는 메뉴 ${list.length}개`;
    $('understood').replaceChildren(...f.understood);
  }

  $('board').replaceChildren(...list.map((m, i) => {
    const rank = f ? f.top.indexOf(m.id) : -1;
    const add = el('button', {
      class: 'btn-primary btn-wide add',
      disabled: m.soldOut,
      onclick: () => addToCart(m, 1, f ? 'ai-recommend' : 'board')
    }, m.soldOut ? '품절' : '담기');
    if (isSimple() && i === 0 && !m.soldOut) { add.classList.add('pointer'); add.textContent = '여기를 눌러 담기'; } // 손가락 안내
    return el('article', { class: `menu${f ? ' match' : ''}${m.soldOut ? ' soldout' : ''}` },
      el('div', { class: 'pic', 'data-cat': m.category, 'aria-hidden': 'true' }, m.name.slice(0, 1)),
      rank >= 0 ? el('span', { class: 'rank' }, `추천 ${rank + 1}`) : null,
      el('div', { class: 'body' },
        el('h3', {}, m.name),
        el('div', { class: 'price' }, won(m.price), m.priceVerified ? null : el('small', {}, '예시 가격')),
        el('div', { class: 'badges' },
          m.spicy >= 2 ? el('span', { class: 'badge hot' }, '매움') : null,
          m.spicy === 1 ? el('span', { class: 'badge hot' }, '조금 매움') : null,
          m.serves ? el('span', { class: 'badge' }, `${m.serves}인분`) : null,
          m.popular ? el('span', { class: 'badge' }, '대표') : null),
        f && f.reasons[m.id] ? el('div', { class: 'reason' }, f.reasons[m.id]) : null,
        isSimple() ? null : el('p', { class: 'desc' }, m.description || ''),
        add));
  }));
}

/* ---------- 대화 → 메뉴 걸러 보기 ---------- */
const ptt = createPushToTalk({
  onStart() {
    state.lastTouch = Date.now();
    $('ptt').classList.add('on');
    $('pttLabel').textContent = '듣고 있어요';
    $('heard').className = 'heard interim';
    $('heard').textContent = '';
  },
  onLatched() { $('pttLabel').textContent = '다 말하면 다시 누르기'; },
  onInterim(t) { $('heard').textContent = t; },
  onFinal(t) { ask(t); },
  onError(_code, msg) { toast(msg); say(msg); },
  onEnd() {
    $('ptt').classList.remove('on');
    $('pttLabel').textContent = '누르고 말하기';
  }
});

const pttBtn = $('ptt');
pttBtn.addEventListener('pointerdown', (e) => { pttBtn.setPointerCapture(e.pointerId); ptt.press(e.timeStamp); });
pttBtn.addEventListener('pointerup', (e) => ptt.release(e.timeStamp));
pttBtn.addEventListener('pointercancel', (e) => ptt.release(e.timeStamp));
pttBtn.addEventListener('contextmenu', (e) => e.preventDefault()); // 길게 누를 때 메뉴 뜨지 않게
pttBtn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); ptt.press(e.timeStamp); } });
pttBtn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') ptt.release(e.timeStamp); });

async function ask(text) {
  $('heard').className = 'heard';
  $('heard').textContent = `“${text}”`;
  let data;
  try {
    const res = await fetch('/api/ai/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, context: state.context, ageGroup: state.ageGroup })
    });
    data = await res.json();
    if (!res.ok) throw new Error(data.error);
  } catch (e) {
    toast('지금은 추천을 쓸 수 없어요. 메뉴판에서 직접 골라 주세요.');
    return;
  }
  state.conversation.push({ text, data });
  applyConversation(state.conversation.at(-1));
  say(data.speech);
}

function understoodTags(u) {
  return [
    ...u.tags.map((t) => el('span', { class: 'tag' }, t)),
    u.spicy === true ? el('span', { class: 'tag' }, '매운맛') : null,
    u.spicy === false ? el('span', { class: 'tag' }, '안 매운 맛') : null,
    u.people ? el('span', { class: 'tag' }, `${u.people}명`) : null,
    u.budget ? el('span', { class: 'tag' }, `${u.budget.perPerson ? '1인 ' : ''}${won(u.budget.amount)} 이하`) : null,
    ...u.excludeIngredients.map((i) => el('span', { class: 'tag minus' }, i))
  ].filter(Boolean);
}

// entry: { text: 손님이 한 말, data: AI 응답 } — '이전'으로 되돌릴 때도 그때 화면 그대로
function applyConversation(entry) {
  const data = entry && entry.data;
  if (!data) {
    state.filter = null;
    state.context = null;
    $('reply').hidden = true;
    $('heard').textContent = '';
    renderBoard();
    return;
  }
  state.context = data.context;
  $('heard').className = 'heard';
  $('heard').textContent = `“${entry.text}”`;
  const matches = data.matches || [];
  state.filter = matches.length ? {
    ids: matches.map((m) => m.id),
    reasons: Object.fromEntries(matches.map((m) => [m.id, m.reason])),
    top: data.recommendations.map((r) => r.id),
    fallback: data.fallback,
    understood: understoodTags(data.understood)
  } : null;
  if (!matches.length) toast('조건에 맞는 메뉴가 없어요. 조건을 바꿔 다시 말씀해 주세요.');

  // AI 답: 한 줄 안내 + 다음 질문(버튼으로도 답할 수 있게) + 인원 조합
  const reply = $('reply');
  const lines = [el('p', {}, data.fallback ? '이 가게 대표 메뉴를 먼저 보여 드려요.' : `말씀하신 조건에 맞는 메뉴만 보여 드려요.`)];
  if (data.question) {
    lines.push(el('p', {}, data.question.text));
    lines.push(el('div', { class: 'choices' }, data.question.choices.map((c) => el('button', { class: 'chip', onclick: () => ask(c) }, c))));
  }
  if (data.combo && !isSimple()) {
    lines.push(el('p', { style: 'margin-top:.6rem' }, data.combo.text));
    lines.push(el('div', { class: 'choices' }, el('button', {
      class: 'chip',
      onclick: () => data.combo.items.forEach((it) => addToCart(state.menus.find((m) => m.id === it.id), it.quantity, 'ai-recommend'))
    }, '이 조합 담기')));
  }
  reply.replaceChildren(...lines);
  reply.hidden = false;
  renderBoard();
  $('filterBar').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- 장바구니 ---------- */
function addToCart(menu, qty, source) {
  if (!menu || menu.soldOut) return;
  const cur = state.cart.get(menu.id) || { id: menu.id, name: menu.name, price: menu.price, qty: 0 };
  cur.qty += qty;
  state.cart.set(menu.id, cur);
  window.dispatchEvent(new CustomEvent('menumate:add-to-cart', { detail: { id: menu.id, quantity: qty, source } }));
  renderDock();
  if (isSimple()) {
    // 쉬운 절차: 담자마자 '이대로 주문할까요?'로 바로 이어 준다
    $('moreText').textContent = `${menu.name} ${cur.qty}개 · 합계 ${won(cartTotal())}`;
    $('moreModal').hidden = false;
    say(`${menu.name} 담았어요. 이대로 주문할까요?`);
  } else {
    toast(`${menu.name}을(를) 담았어요.`);
  }
}

function changeQty(id, delta) {
  const it = state.cart.get(id);
  if (!it) return;
  it.qty += delta;
  if (it.qty <= 0) state.cart.delete(id);
  else if (delta > 0 && it.qty >= 2) toast(`${it.name} ${it.qty}개 맞으세요?`);
  if (!state.cart.size && state.screen === 'cart') go('order');
  renderCart();
  renderDock();
}

function renderDock() {
  const show = state.screen === 'order' && state.cart.size > 0;
  $('cartDock').hidden = !show;
  if (show) $('dockText').textContent = `담은 메뉴 ${cartCount()}개 · ${won(cartTotal())}`;
}

function renderCart() {
  $('cartList').replaceChildren(...cartItems().map((it) => el('li', {},
    el('span', { class: 'name' }, it.name),
    el('span', { class: 'qty' },
      el('button', { 'aria-label': `${it.name} 하나 빼기`, onclick: () => changeQty(it.id, -1) }, '−'),
      el('b', {}, `${it.qty}개`),
      el('button', { 'aria-label': `${it.name} 하나 더`, onclick: () => changeQty(it.id, 1) }, '+')),
    el('span', {}, won(it.price * it.qty)))));
  $('cartTotal').textContent = won(cartTotal());
  $('placeInline').hidden = !isSimple(); // 쉬운 절차: 먹고 가기·포장을 이 화면에서 바로
  $('cartNext').textContent = isSimple() ? '결제하기' : '다음';
}

function pickPlace(place) {
  state.place = place;
  document.querySelectorAll('[data-place]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.place === place)));
}

/* ---------- 이벤트 ---------- */
$('showAll').addEventListener('click', () => { state.filter = null; state.tab = '전체'; renderBoard(); });
$('dockGo').addEventListener('click', () => go('cart'));
$('moreOrder').addEventListener('click', () => { $('moreModal').hidden = true; go('cart'); });
$('moreKeep').addEventListener('click', () => { $('moreModal').hidden = true; });
$('cartNext').addEventListener('click', () => {
  if (isSimple() && !state.place) { toast('먹고 가기 또는 가져가기를 골라 주세요.'); say('먹고 가실지, 가져가실지 골라 주세요.'); return; }
  go(nextScreen());
});
document.querySelectorAll('#screen-cart [data-place]').forEach((b) => b.addEventListener('click', () => pickPlace(b.dataset.place)));
document.querySelectorAll('#screen-place [data-place]').forEach((b) => b.addEventListener('click', () => { pickPlace(b.dataset.place); go('pay'); }));
document.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', () => {
  // 데모: 실제 결제 연동은 백엔드 담당
  state.orderNo += 1;
  $('orderNo').textContent = String(state.orderNo);
  go('done');
  say(`주문이 완료되었어요. 주문 번호는 ${state.orderNo}번입니다.`);
  setTimeout(() => { if (state.screen === 'done') resetAll({ keepProfile: state.present }); }, 12000);
}));

// 공통 버튼
$('homeBtn').addEventListener('click', () => resetAll({ keepProfile: true }));
$('backBtn').addEventListener('click', () => {
  if (!$('moreModal').hidden) { $('moreModal').hidden = true; return; }
  if (state.screen === 'order') {
    // 대화를 한 단계 되돌린다 (마지막 대화 전 메뉴판으로)
    state.conversation.pop();
    applyConversation(state.conversation.at(-1));
    return;
  }
  if (state.screen === 'done') return;
  const list = flow().screens;
  go(list[Math.max(0, list.indexOf(state.screen) - 1)]);
});
$('sizeBtn').addEventListener('click', () => {
  const next = (state.level + 1) % 3;
  setLevel(next, 'manual');
  say(`글자 크기 ${LEVEL_NAMES[next]}`);
});
$('helpBtn').addEventListener('click', () => { toast('직원이 오고 있습니다. 잠시만 기다려 주세요.', 6000); say('직원이 오고 있습니다.'); });
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { state.lastTouch = Date.now(); }));

// 손님이 앞에 있는데 15초 동안 아무것도 안 하면 한 번 안내 (FR-05)
setInterval(() => {
  if (state.present && !state.hinted && state.screen === 'order' && !state.conversation.length && Date.now() - state.lastTouch > 15000) {
    state.hinted = true;
    toast('빨간 버튼을 누르고 드시고 싶은 걸 말씀해 보세요.', 6000);
    say('도와 드릴까요? 빨간 버튼을 누르고 드시고 싶은 걸 말씀해 보세요.');
  }
}, 2000);

/* ---------- 카메라 ---------- */
async function cameraOn() {
  try {
    $('cameraState').textContent = '카메라 켜는 중';
    await loadModels((s) => { $('cameraState').textContent = s; });
    await startFace($('video'), {
      onArrive() {
        state.present = true;
        state.lastTouch = Date.now();
      },
      onAgeGroup(group, age) { applyAge(age, group); },
      onLeave() {
        state.present = false;
        // 담은 게 없으면 다음 손님을 위해 초기화 (담은 게 있으면 잠깐 자리 비운 것일 수 있음)
        if (!state.cart.size && (state.screen === 'order' || state.screen === 'done')) resetAll();
      },
      onDebug(info) {
        $('devFace').textContent = info.error ? `오류: ${info.error}`
          : info.face ? `얼굴: 있음, 추정 ${info.age}세 (${info.samples}/6, ${info.decided ? '판단 완료' : '측정 중'})` : '얼굴: 없음';
      }
    });
    state.cameraOn = true;
    $('cameraPill').classList.remove('off');
    $('cameraState').textContent = '카메라 켜짐';
    $('cameraToggle').textContent = '끄기';
  } catch (e) {
    console.warn('카메라 사용 불가:', e);
    cameraOff('카메라 없이 주문 중'); // 카메라가 없어도 주문은 똑같이 된다 (FR-04)
  }
}
function cameraOff(label = '카메라 꺼짐') {
  stopFace($('video'));
  state.cameraOn = false;
  $('cameraPill').classList.add('off');
  $('cameraState').textContent = label;
  $('cameraToggle').textContent = '켜기';
}
$('cameraToggle').addEventListener('click', () => (state.cameraOn ? cameraOff() : cameraOn()));

/* ---------- 시작 ---------- */
if (new URLSearchParams(location.search).has('dev')) {
  $('dev').hidden = false;
  $('devForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('devText').value.trim(); if (v) ask(v); });
  document.querySelectorAll('[data-age]').forEach((b) => b.addEventListener('click', () => {
    const age = Number(b.dataset.age);
    state.levelSource = null; // 테스트용: 수동 선택 무시
    applyAge(age, age >= 55 ? 'senior' : 'adult');
  }));
}
if (!sttSupported) $('pttHint').textContent = '이 브라우저는 음성 인식이 안 돼요. 크롬에서 열거나 메뉴판에서 골라 주세요.';

(async () => {
  try {
    const res = await fetch('/api/menu');
    state.menus = (await res.json()).menus;
  } catch {
    toast('메뉴를 불러오지 못했어요. 직원에게 말씀해 주세요.', 10000);
  }
  setLevel(0, null);
  go('order', { replace: true });
  cameraOn();
})();
