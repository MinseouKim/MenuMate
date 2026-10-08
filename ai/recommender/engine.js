// 키워드 기반 메뉴 추천 엔진 (무료, 외부 AI API 없음)
// 원칙: 추천만 한다. 장바구니 담기·결제는 손님이 직접 한다 (FR-15).
const { parseUtterance, mergeContext } = require('./parse');
const { FOLLOW_UP_QUESTIONS } = require('./keywords');

const TAG_LABEL = {
  noodle: '면 요리', rice: '밥 요리', soup: '국물 있음', dish: '나눠 먹는 요리', dimsum: '딤섬',
  seafood: '해물', meat: '고기', pork: '돼지고기', chicken: '닭고기', fried: '바삭한 튀김',
  light: '가볍게 먹기 좋음', hearty: '든든함', soft: '부드러워 먹기 편함', kid: '아이도 잘 먹음',
  signature: '가게 대표 메뉴', special: '특별한 날에 좋음', sharing: '여럿이 나눠 먹기 좋음',
  course: '코스', set: '세트'
};
const BASE_TAGS = ['noodle', 'rice', 'dish', 'dimsum', 'course', 'set'];

function isExcluded(menu, intent) {
  if (menu.soldOut) return '품절';
  if (intent.excludeIngredients.some((ing) => (menu.ingredients || []).includes(ing))) return '제외 재료';
  if (intent.spicy === false && menu.spicy >= 2) return '매움';
  // 손님이 직접 말한 메뉴는 예산을 넘어도 보여 준다 (결정은 손님이)
  if (intent.budget && !intent.mentionedMenuIds.includes(menu.id)) {
    const limit = intent.budget.perPerson
      ? intent.budget.amount * (menu.serves || 1)
      : intent.budget.amount;
    if (menu.price > limit) return '예산 초과';
  }
  return null;
}

function scoreMenu(menu, intent) {
  let score = 0;
  const reasons = [];
  const tags = menu.tags || [];

  if (intent.mentionedMenuIds.includes(menu.id)) {
    score += 10;
    reasons.push('말씀하신 메뉴');
  } else if ((intent.relatedMenuIds || []).includes(menu.id)) {
    score += 6;
    reasons.push('말씀하신 메뉴와 같은 종류');
  }

  const wantedBase = intent.tags.filter((t) => BASE_TAGS.includes(t));
  if (wantedBase.length && !wantedBase.some((t) => tags.includes(t))) score -= 4;

  for (const t of intent.tags) {
    if (tags.includes(t)) {
      score += 3;
      if (TAG_LABEL[t]) reasons.push(TAG_LABEL[t]);
    }
  }

  if (intent.spicy === true) {
    if (menu.spicy >= 2) { score += 3; reasons.push('얼큰하고 매콤함'); }
    else if (menu.spicy === 1) { score += 1; reasons.push('살짝 매콤함'); }
    else score -= 2;
  } else if (intent.spicy === false) {
    if (menu.spicy === 0) { score += 1; reasons.push('맵지 않음'); }
    else score -= 2;
  }

  if (intent.people) {
    const serves = menu.serves || 1;
    if (intent.people === 1 && serves >= 2) score -= 3;
    if (intent.people >= 2 && serves >= 2) {
      const diff = Math.abs(serves - intent.people);
      if (diff === 0) { score += 3; reasons.push(`${serves}명이 먹기 적당`); }
      else if (diff === 1) score += 1;
    }
  }

  if (intent.budget && score > 0) reasons.push('예산 안');
  if (tags.includes('signature')) score += 0.5; // 동점일 때 대표 메뉴 우선
  return { score, reasons: [...new Set(reasons)] };
}

function hasAnySignal(intent) {
  return intent.tags.length || intent.spicy !== null || intent.mentionedMenuIds.length || (intent.relatedMenuIds || []).length ||
    intent.excludeIngredients.length || intent.budget || intent.people;
}

// 아직 모르는 정보 중 가장 도움이 되는 질문 하나 (최대 4번까지 묻기 — FR-12)
function nextQuestion(intent) {
  if ((intent.turns || 1) >= 4) return null;
  const hasBase = intent.tags.some((t) => BASE_TAGS.includes(t)) || intent.mentionedMenuIds.length;
  if (!hasBase) return FOLLOW_UP_QUESTIONS.find((q) => q.need === 'base');
  if (intent.spicy === null) return FOLLOW_UP_QUESTIONS.find((q) => q.need === 'spicy');
  if (!intent.people) return FOLLOW_UP_QUESTIONS.find((q) => q.need === 'people');
  return null;
}

// 2명 이상이면 "요리 1개 + 식사 인원수" 조합을 함께 제안 (FR-14)
function buildCombo(candidates, intent) {
  if (!intent.people || intent.people < 2) return null;
  const dish = candidates.find((r) => r.menu.category === '요리');
  const meal = candidates.find((r) => r.menu.category === '식사');
  if (!dish || !meal) return null;
  const total = dish.menu.price + meal.menu.price * intent.people;
  if (intent.budget && !intent.budget.perPerson && total > intent.budget.amount) return null;
  return {
    items: [
      { id: dish.menu.id, name: dish.menu.name, quantity: 1, price: dish.menu.price },
      { id: meal.menu.id, name: meal.menu.name, quantity: intent.people, price: meal.menu.price }
    ],
    total,
    text: `${intent.people}명이면 ${dish.menu.name} 1개와 ${meal.menu.name} ${intent.people}그릇은 어떠세요? 합계 ${total.toLocaleString('ko-KR')}원입니다.`
  };
}

/**
 * @param {object} opts
 * @param {string} opts.text        STT로 받은 손님 말
 * @param {Array}  opts.menus       메뉴 목록 (data/menu.json 또는 DB)
 * @param {object} [opts.context]   이전 대화에서 받은 context (그대로 돌려보내면 이어서 대화)
 * @param {string} [opts.ageGroup]  'senior' | 'adult' | 'young' | 'unknown' (얼굴 인식 결과)
 */
function recommend({ text, menus, context = null, ageGroup = 'unknown' }) {
  const parsed = parseUtterance(text, menus);
  const intent = mergeContext(context, parsed);
  const limit = ageGroup === 'senior' ? 2 : 3; // 쉬운 모드는 선택지를 줄인다

  const candidates = menus
    .filter((m) => !isExcluded(m, intent))
    .map((m) => ({ menu: m, ...scoreMenu(m, intent) }))
    .sort((a, b) => b.score - a.score || a.menu.price - b.menu.price);

  // 같은 요리의 크기(소·중)는 하나만 보여 준다
  const seen = new Set();
  const deduped = candidates.filter((c) => {
    const key = c.menu.name.replace(/\s*\(.*\)$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 대화에 맞는 메뉴만 남긴다.
  // 손님이 원한 종류(국물·해물·면…)가 있으면 그 종류를 모두 가진 메뉴를 우선,
  // 그런 메뉴가 2개 미만이면 하나라도 가진 메뉴까지. 직접 말한 메뉴는 항상 포함.
  const wanted = intent.tags;
  const hits = (c) => wanted.filter((t) => (c.menu.tags || []).includes(t)).length;
  const strictCount = candidates.filter((c) => c.score > 0.5 && wanted.length && hits(c) === wanted.length).length;
  const needHits = !wanted.length ? 0 : strictCount >= 2 ? wanted.length : 1;
  const named = (c) => intent.mentionedMenuIds.includes(c.menu.id) || (intent.relatedMenuIds || []).includes(c.menu.id);
  const spicyOk = (c) => intent.spicy !== true || c.menu.spicy >= 1; // 매운 걸 원하면 안 매운 메뉴는 빼기
  // 메뉴 이름을 직접 말했으면("짜장", "탕수육") 그 메뉴 종류만 남긴다
  const anyNamed = candidates.some(named);
  const fits = (c) => (anyNamed ? named(c) : c.score > 0.5 && hits(c) >= needHits && spicyOk(c));

  let ranked = deduped.filter(fits);
  let fallback = false;
  if (!hasAnySignal(intent) || !ranked.length) {
    // 알아들은 게 없으면 대표 메뉴를 먼저 보여 주고 질문으로 이어 간다
    fallback = true;
    ranked = deduped
      .filter((c) => (c.menu.tags || []).includes('signature') && (c.menu.serves || 1) <= (intent.people || 2))
      .map((c) => ({ ...c, reasons: ['가게 대표 메뉴'] }));
  }

  const recommendations = ranked.slice(0, limit).map((r) => ({
    id: r.menu.id,
    name: r.menu.name,
    price: r.menu.price,
    priceVerified: r.menu.priceVerified !== false,
    category: r.menu.category,
    description: r.menu.description,
    reason: r.reasons.slice(0, 3).join(' · ') || '가게 대표 메뉴',
    score: r.score
  }));

  // 키오스크 메뉴판에 남길 메뉴: 대화 조건에 맞는 것 전부 (크기 다른 같은 요리 포함), 점수 순
  // 고령층 화면은 고를 게 적을수록 쉬우므로 4개까지
  const matchPool = fallback ? ranked : candidates.filter(fits);
  const matches = matchPool.slice(0, ageGroup === 'senior' ? 4 : 8).map((r) => ({
    id: r.menu.id,
    reason: r.reasons.slice(0, 3).join(' · ') || '가게 대표 메뉴',
    score: r.score
  }));

  const question = nextQuestion(intent);
  const names = recommendations.map((r) => r.name).join(', ');
  const speech = recommendations.length
    ? `${fallback ? '이 가게 대표 메뉴는' : '추천 메뉴는'} ${names}입니다.${question ? ' ' + question.text : ''}`
    : '조건에 맞는 메뉴가 없어요. 조건을 바꿔서 다시 말씀해 주세요.';

  return {
    understood: {
      tags: intent.tags.map((t) => TAG_LABEL[t] || t),
      spicy: intent.spicy,
      people: intent.people,
      budget: intent.budget,
      excludeIngredients: intent.excludeIngredients,
      mentionedMenuIds: intent.mentionedMenuIds
    },
    recommendations,
    matches,        // 메뉴판에 보여 줄 메뉴 id (이것만 화면에 남긴다)
    combo: fallback ? null : buildCombo(candidates, intent),
    question,       // null이면 더 묻지 않고 결정을 기다린다
    speech,         // 화면이 그대로 읽어 줄 문장 (TTS)
    fallback,
    context: intent // 다음 요청에 그대로 보내면 대화가 이어진다
  };
}

module.exports = { recommend };
