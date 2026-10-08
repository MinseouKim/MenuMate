// 우루루 AI 키오스크 데모 화면: 얼굴 인식 → 화면 모드 제안, 음성 → 키워드 추천
import { loadModels, startFace, stopFace } from './face.js';
import { listenOnce, speak, sttSupported } from './voice.js';

const $ = (id) => document.getElementById(id);
const won = (n) => `${n.toLocaleString('ko-KR')}원`;
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

const state = {
  ageGroup: 'unknown',      // 얼굴 인식 결과 (서버에는 연령대 단어만 보냄)
  easy: false,
  declinedEasy: false,      // 이번 손님이 쉬운 모드를 거절했으면 다시 묻지 않음
  context: null,            // 추천 대화 이어가기용
  history: [],              // '이전' 버튼용
  cart: new Map(),
  present: false,
  cameraOn: false,
  lastTouch: Date.now(),
  helpOffered: false,
  listener: null
};

/* ---------- 공통 ---------- */
let toastTimer;
function toast(msg, ms = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
const say = (text) => speak(text, { rate: state.easy ? 0.85 : 1 });

function setEasy(on) {
  state.easy = on;
  document.documentElement.classList.toggle('easy', on); // rem 크기가 함께 커지도록 <html>에 적용
  $('bigBtn').textContent = on ? '보통 화면' : '화면 크게';
  if (state.history.length) render(state.history.at(-1));
}

function resetAll() {
  state.context = null;
  state.history = [];
  state.cart.clear();
  state.declinedEasy = false;
  state.helpOffered = false;
  state.ageGroup = 'unknown';
  setEasy(false);
  $('modeModal').hidden = true;
  $('hero').hidden = false;
  $('result').hidden = true;
  $('heard').textContent = '';
  renderCart();
  window.scrollTo({ top: 0 });
}

/* ---------- 얼굴 인식 → 모드 제안 (AI는 제안만, 바꾸는 건 손님) ---------- */
function suggestEasyMode() {
  if (state.easy || state.declinedEasy || !$('modeModal').hidden) return;
  $('modeModal').hidden = false;
  speak('글씨를 크게, 천천히 안내해 드릴까요?', { rate: 0.85 });
}

async function cameraOn() {
  const pill = $('cameraPill');
  try {
    $('cameraState').textContent = '카메라 켜는 중';
    await loadModels((s) => { $('cameraState').textContent = s; });
    await startFace($('video'), {
      onArrive() {
        state.present = true;
        state.lastTouch = Date.now();
        if (!state.history.length) toast('어서 오세요! 빨간 버튼을 누르고 드시고 싶은 걸 말씀해 주세요.');
      },
      onAgeGroup(group, age) {
        state.ageGroup = group;
        $('devAge').textContent = `연령대: ${group} (추정 ${age}세)`;
        if (group === 'senior') suggestEasyMode();
      },
      onLeave() {
        state.present = false;
        if (state.cart.size === 0) resetAll(); // 담은 게 있으면 잠깐 자리 비운 것일 수 있어 유지
      },
      onDebug(info) {
        $('devFace').textContent = info.error ? `오류: ${info.error}`
          : info.face ? `얼굴: 있음, 추정 ${info.age}세 (${info.samples}회 측정, 판단 ${info.decided ? '완료' : '중'})` : '얼굴: 없음';
      }
    });
    state.cameraOn = true;
    pill.classList.remove('off');
    $('cameraState').textContent = '카메라 켜짐';
    $('cameraToggle').textContent = '카메라 끄기';
  } catch (e) {
    // 카메라가 없거나 거부돼도 주문은 똑같이 된다 (FR-04)
    console.warn('카메라 사용 불가:', e);
    cameraOff('카메라 없이 주문 중');
  }
}

function cameraOff(label = '카메라 꺼짐') {
  stopFace($('video'));
  state.cameraOn = false;
  state.ageGroup = 'unknown';
  $('cameraPill').classList.add('off');
  $('cameraState').textContent = label;
  $('cameraToggle').textContent = '카메라 켜기';
}

/* ---------- 음성 → 추천 ---------- */
function startListening() {
  if (state.listener) { state.listener.stop(); return; }
  if (!sttSupported) { toast('이 브라우저는 음성 인식이 안 돼요. 크롬에서 열어 주세요.'); return; }
  speechSynthesis.cancel(); // 안내 음성이 마이크에 들어가지 않게
  const heard = $('heard');
  $('micBtn').classList.add('listening');
  $('micLabel').textContent = '듣고 있어요…';
  heard.className = 'heard interim';
  heard.textContent = '';
  state.listener = listenOnce({
    onInterim: (t) => { heard.textContent = t; },
    onFinal: (t) => ask(t),
    onError: (_code, msg) => { toast(msg); say(msg); },
    onEnd: () => {
      state.listener = null;
      $('micBtn').classList.remove('listening');
      $('micLabel').textContent = '눌러서 말하기';
    }
  });
}

async function ask(text) {
  const heard = $('heard');
  heard.className = 'heard';
  heard.textContent = `“${text}”`;
  try {
    const res = await fetch('/api/ai/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, context: state.context, ageGroup: state.ageGroup })
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || '추천을 잠시 쓸 수 없어요. 메뉴판에서 직접 골라 주세요.');
      return;
    }
    state.context = data.context;
    state.history.push(data);
    render(data);
    say(data.speech);
  } catch {
    toast('서버에 연결할 수 없어요. 직원에게 말씀해 주세요.');
  }
}

function render(data) {
  $('result').hidden = false;

  // 1) 이렇게 알아들었어요 — 잘못 알아들었는지 손님이 바로 확인할 수 있게
  const u = data.understood;
  const tags = [
    ...u.tags.map((t) => el('span', { class: 'tag' }, t)),
    u.spicy === true ? el('span', { class: 'tag' }, '매운맛') : null,
    u.spicy === false ? el('span', { class: 'tag' }, '안 매운 맛') : null,
    u.people ? el('span', { class: 'tag' }, `${u.people}명`) : null,
    u.budget ? el('span', { class: 'tag' }, `${u.budget.perPerson ? '1인 ' : ''}${won(u.budget.amount)} 이하`) : null,
    ...u.excludeIngredients.map((i) => el('span', { class: 'tag minus' }, i))
  ].filter(Boolean);
  $('understood').replaceChildren(
    el('span', { class: 'label' }, tags.length ? '이렇게 알아들었어요' : '가게 대표 메뉴를 먼저 보여 드려요'),
    ...tags
  );

  // 2) 추천 카드
  $('cards').replaceChildren(...data.recommendations.map((r, i) => {
    const btn = el('button', { class: 'btn-primary btn-wide', onclick: () => addToCart(r, 1) }, '담기');
    if (state.easy && i === 0) btn.classList.add('pointer'); // 손가락 안내 (FR-09)
    return el('article', { class: 'card' },
      el('span', { class: 'rank' }, `추천 ${i + 1}`),
      el('h3', {}, r.name),
      el('div', { class: 'price' }, won(r.price), r.priceVerified ? null : el('small', {}, '예시 가격')),
      el('div', { class: 'reason' }, r.reason),
      el('p', { class: 'desc' }, r.description || ''),
      btn);
  }));

  // 3) 인원 조합
  const combo = $('combo');
  combo.hidden = !data.combo || state.easy;
  if (data.combo) {
    combo.replaceChildren(
      el('p', {}, data.combo.text),
      el('button', { class: 'btn-secondary', onclick: () => data.combo.items.forEach((it) => addToCart(it, it.quantity)) }, '이 조합 담기'));
  }

  // 4) 다음 질문 (버튼으로도 답할 수 있게)
  const q = $('question');
  q.hidden = !data.question;
  if (data.question) {
    q.replaceChildren(
      el('p', {}, data.question.text),
      el('div', { class: 'choices' }, data.question.choices.map((c) =>
        el('button', { class: 'chip', onclick: () => ask(c) }, c))),
      el('p', { class: 'lead', style: 'font-size:.85rem;margin-top:10px' }, '말로 답하셔도 돼요.'));
  }
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- 장바구니 (데모) ----------
   실제 장바구니는 팀 주문 화면이 관리한다. 담기 버튼은 아래 이벤트도 같이 보내므로
   팀 화면에서 window.addEventListener('wooruru:add-to-cart', e => ...) 로 받으면 된다. */
function addToCart(item, qty) {
  const cur = state.cart.get(item.id) || { id: item.id, name: item.name, price: item.price, qty: 0 };
  cur.qty += qty;
  state.cart.set(item.id, cur);
  window.dispatchEvent(new CustomEvent('wooruru:add-to-cart', { detail: { id: item.id, quantity: qty, source: 'ai-recommend' } }));
  renderCart();
  toast(`${item.name}을(를) 담았어요.`);
  say(`${item.name} 담았습니다.`);
}

function changeQty(id, delta) {
  const it = state.cart.get(id);
  if (!it) return;
  it.qty += delta;
  if (it.qty <= 0) state.cart.delete(id);
  else if (delta > 0 && it.qty >= 2) toast(`${it.name} ${it.qty}개 맞으세요?`); // 수량 확인 (FR-18)
  renderCart();
}

function renderCart() {
  const items = [...state.cart.values()];
  $('cart').hidden = items.length === 0;
  $('cartList').replaceChildren(...items.map((it) => el('li', {},
    el('span', {}, it.name),
    el('span', { class: 'qty' },
      el('button', { 'aria-label': '하나 빼기', onclick: () => changeQty(it.id, -1) }, '−'),
      el('b', {}, `${it.qty}개`),
      el('button', { 'aria-label': '하나 더', onclick: () => changeQty(it.id, 1) }, '+')),
    el('span', {}, won(it.price * it.qty)))));
  $('cartTotal').textContent = won(items.reduce((s, it) => s + it.price * it.qty, 0));
}

/* ---------- 이벤트 ---------- */
$('micBtn').addEventListener('click', startListening);
document.querySelectorAll('[data-say]').forEach((b) => b.addEventListener('click', () => ask(b.dataset.say)));
$('modeYes').addEventListener('click', () => { $('modeModal').hidden = true; setEasy(true); say('글씨를 크게 바꿨어요. 빨간 버튼을 누르고 말씀해 주세요.'); });
$('modeNo').addEventListener('click', () => { $('modeModal').hidden = true; state.declinedEasy = true; });
$('homeBtn').addEventListener('click', resetAll);
$('backBtn').addEventListener('click', () => {
  state.history.pop();
  const prev = state.history.at(-1);
  state.context = prev ? prev.context : null;
  if (prev) render(prev); else { $('result').hidden = true; $('heard').textContent = ''; }
});
$('bigBtn').addEventListener('click', () => setEasy(!state.easy));
$('helpBtn').addEventListener('click', () => { toast('직원이 오고 있습니다. 잠시만 기다려 주세요.', 6000); say('직원이 오고 있습니다.'); });
$('checkoutBtn').addEventListener('click', () => toast('데모: 여기서 팀의 주문 확인·결제 화면으로 넘어갑니다.'));
$('cameraToggle').addEventListener('click', () => (state.cameraOn ? cameraOff() : cameraOn()));
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { state.lastTouch = Date.now(); }));

// 머뭇거림 감지 (FR-05): 손님이 앞에 있는데 15초 동안 아무것도 안 누르면 한 번 도움 제안
setInterval(() => {
  if (state.present && !state.helpOffered && !state.history.length && Date.now() - state.lastTouch > 15000) {
    state.helpOffered = true;
    toast('도와 드릴까요? 빨간 버튼을 누르고 드시고 싶은 걸 말씀해 주세요.', 6000);
    say('도와 드릴까요? 빨간 버튼을 누르고 드시고 싶은 걸 말씀해 주세요.');
  }
}, 2000);

// 개발용 패널 (?dev=1)
if (new URLSearchParams(location.search).has('dev')) {
  $('dev').hidden = false;
  $('devForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('devText').value.trim(); if (v) ask(v); });
  document.querySelectorAll('[data-age]').forEach((b) => b.addEventListener('click', () => {
    state.ageGroup = b.dataset.age;
    $('devAge').textContent = `연령대: ${b.dataset.age} (수동)`;
    if (b.dataset.age === 'senior') suggestEasyMode();
  }));
}

cameraOn();
