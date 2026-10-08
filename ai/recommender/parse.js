// STT로 받은 문장 → 손님의 의도(원하는 태그, 제외 재료, 맵기, 인원, 예산, 말한 메뉴)
const {
  TAG_KEYWORDS,
  SPICY_WORDS,
  NOT_SPICY_WORDS,
  EXCLUDE_PATTERNS,
  INGREDIENT_ALIASES,
  PEOPLE_WORDS,
  KOREAN_DIGITS
} = require('./keywords');

// 띄어쓰기·문장부호 제거: "매운 거 주세요!" → "매운거주세요"
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s.,!?~·()\[\]"'“”‘’-]/g, '');
}

// "면", "밥"처럼 한 글자 답은 문장 속 우연한 글자("~하면")와 헷갈리므로
// 문장 전체가 그 단어일 때만 인정한다.
const SHORT_ANSWERS = {
  면: 'noodle', 면요: 'noodle', 면이요: 'noodle', 면으로요: 'noodle',
  밥: 'rice', 밥이요: 'rice', 밥으로요: 'rice',
  요리: 'dish', 딤섬: 'dimsum'
};

function findExclusions(t) {
  const excluded = new Set();
  const spans = [];
  // 긴 재료명부터 확인 ("돼지고기"를 "고기"보다 먼저)
  const names = Object.keys(INGREDIENT_ALIASES).sort((a, b) => b.length - a.length);
  for (const name of names) {
    let from = 0;
    while (true) {
      const i = t.indexOf(name, from);
      if (i < 0) break;
      from = i + name.length;
      if (spans.some(([s, e]) => i >= s && i < e)) continue; // 더 긴 이름에 이미 포함
      const after = t.slice(from, from + 8); // 재료 뒤 8글자 안에 제외 표현이 있는지
      const pattern = EXCLUDE_PATTERNS.find((p) => after.includes(p));
      if (pattern) {
        INGREDIENT_ALIASES[name].forEach((ing) => excluded.add(ing));
        spans.push([i, from + after.indexOf(pattern) + pattern.length]);
      }
    }
  }
  // 제외로 쓰인 부분은 지워서 "새우 빼고"의 "새우"가 '해물 원함'으로 잡히지 않게 한다
  let masked = t;
  spans
    .sort((a, b) => b[0] - a[0])
    .forEach(([s, e]) => { masked = masked.slice(0, s) + '#'.repeat(e - s) + masked.slice(e); });
  return { excludeIngredients: [...excluded], masked };
}

function findSpicy(t) {
  if (NOT_SPICY_WORDS.some((w) => t.includes(w))) return false;
  if (SPICY_WORDS.some((w) => t.includes(w))) return true;
  return null; // 말하지 않음
}

function findPeople(t) {
  const digit = t.match(/([0-9]+)(명|분|사람|인)/);
  if (digit) return Number(digit[1]);
  for (const [words, n] of PEOPLE_WORDS) {
    if (words.some((w) => t.includes(w))) return n;
  }
  return null;
}

function koreanNum(s) {
  if (!s) return 1; // "만원"처럼 숫자 없이 단위만 → 1
  if (/^[0-9]+$/.test(s)) return Number(s);
  return KOREAN_DIGITS[s] || 1;
}

function findBudget(t) {
  // 2만5천원 / 만오천원 / 이만원 / 15000원 / 3만원
  const m = t.match(/(?:([0-9]+|[일이삼사오육칠팔구])?만)?(?:([0-9]+|[일이삼사오육칠팔구])?천)?([0-9]{3,})?원/);
  if (!m || (!m[0].includes('만') && !m[0].includes('천') && !m[3])) return null;
  let value = 0;
  if (m[0].includes('만')) value += koreanNum(m[1]) * 10000;
  if (m[0].includes('천')) value += koreanNum(m[2]) * 1000;
  if (m[3]) value += Number(m[3]);
  if (value < 1000) return null;
  const perPerson = /(인당|1인|한사람당|명당|한명당|각자)/.test(t);
  return { amount: value, perPerson };
}

// 문장에 메뉴 이름이 직접 나오면 찾는다. 긴 이름 우선("간짜장" 안의 "짜장"은 무시)
function findMentionedMenus(t, menus) {
  const hits = [];
  for (const menu of menus) {
    const names = [menu.name, ...(menu.aliases || [])].map(normalize).filter((n) => n.length >= 2);
    for (const n of names) {
      const i = t.indexOf(n);
      if (i >= 0) hits.push({ id: menu.id, start: i, end: i + n.length });
    }
  }
  const kept = hits.filter((h) => !hits.some((o) =>
    o !== h && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start));
  const ids = [...new Set(kept.map((h) => h.id))];
  // "탕수육"이라고만 하면 찹쌀탕수육·생등심탕수육처럼 이름에 그 말이 든 메뉴도 관련 메뉴로 본다
  const words = [...new Set(kept.map((h) => t.slice(h.start, h.end)))];
  const related = menus
    .filter((m) => !ids.includes(m.id) && words.some((w) => normalize(m.name).includes(w)))
    .map((m) => m.id);
  return { ids, related };
}

function findTags(t) {
  const tags = new Set();
  if (SHORT_ANSWERS[t]) tags.add(SHORT_ANSWERS[t]);
  for (const [tag, words] of Object.entries(TAG_KEYWORDS)) {
    // "면요리·밥요리·닭요리"의 '요리'는 요리(탕수육류)를 원한다는 뜻이 아니다
    const target = tag === 'dish' ? t.replace(/(면|밥|닭|굴)요리/g, '') : t;
    if (words.some((w) => w.length >= 2 ? target.includes(w) : target === w)) tags.add(tag);
  }
  // 한 글자 키워드('면', '밥')는 다른 단어 뒤에 붙은 형태로만 인정
  if (/(면|국수)(요리|으로|이좋|먹|종류|이요)/.test(t)) tags.add('noodle');
  if (/밥(으로|이좋|먹|종류|이요)/.test(t)) tags.add('rice');
  return [...tags];
}

function parseUtterance(text, menus = []) {
  const t = normalize(text);
  const { excludeIngredients, masked } = findExclusions(t);
  const tags = findTags(masked);
  const spicy = findSpicy(t);
  const people = findPeople(masked);
  const budget = findBudget(masked);
  const { ids: mentionedMenuIds, related: relatedMenuIds } = findMentionedMenus(masked, menus);
  return { text: String(text || ''), tags, excludeIngredients, spicy, people, budget, mentionedMenuIds, relatedMenuIds };
}

// 여러 번 대화한 내용을 합친다 (이전 답 + 새 답)
function mergeContext(prev, cur) {
  if (!prev) return cur;
  return {
    text: [prev.text, cur.text].filter(Boolean).join(' / '),
    tags: [...new Set([...(prev.tags || []), ...cur.tags])],
    excludeIngredients: [...new Set([...(prev.excludeIngredients || []), ...cur.excludeIngredients])],
    spicy: cur.spicy !== null ? cur.spicy : (prev.spicy ?? null),
    people: cur.people ?? prev.people ?? null,
    budget: cur.budget ?? prev.budget ?? null,
    mentionedMenuIds: cur.mentionedMenuIds.length ? cur.mentionedMenuIds : (prev.mentionedMenuIds || []),
    relatedMenuIds: cur.mentionedMenuIds.length ? cur.relatedMenuIds : (prev.relatedMenuIds || []),
    turns: (prev.turns || 1) + 1
  };
}

module.exports = { normalize, parseUtterance, mergeContext };
