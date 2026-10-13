// 음성·텍스트 요청에서 인원·예산·제외 재료·개수·메뉴 이름을 읽는 함수들.
const KNUM: Record<string, number> = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
const kn = (s?: string) => (!s ? 1 : /^\d/.test(s) ? Number(s) : KNUM[s] ?? 1);
const normalizeNumbers = (text: string) => text.replace(/(\d),(?=\d{3})/g, '$1');

// 15,000원 / 15000원 / 1만5천원 / 만 오천 원 / 이만원 / 만원 / 오천원 / 3만. "만두"는 예산이 아닙니다.
export function parseAmount(text: string): number | null {
  const t = normalizeNumbers(text);
  const plain = t.match(/(\d{4,})\s*원?/);
  if (plain) return Number(plain[1]);
  const man = t.match(/(\d+|[일이삼사오육칠팔구](?=\s*만))?\s*만\s*(?:(\d|[일이삼사오육칠팔구])\s*천\s*)?(?:원|$|\s|으로|이내|이하|정도|까지|안|쯤)/);
  if (man) return kn(man[1]) * 10000 + (man[2] ? kn(man[2]) * 1000 : 0);
  const chun = t.match(/(\d+|[일이삼사오육칠팔구])\s*천\s*원/);
  return chun ? kn(chun[1]) * 1000 : null;
}

// 금액 앞에 "총", "전체", "다 해서", "모두"가 있으면 총예산, 아니면 1인당 예산으로 봅니다.
export function parseBudget(text: string): { perPerson: number | null; total: number | null } {
  const amount = parseAmount(text);
  if (amount === null) return { perPerson: null, total: null };
  const isTotal = /(총|전체|다\s*해서|모두|합쳐서)\s*\S*\s*(\d|[일이삼사오육칠팔구]?\s*만|[일이삼사오육칠팔구]\s*천)/.test(normalizeNumbers(text)) && !/인\s*당|한\s*사람\s*당|1인/.test(text);
  return isTotal ? { perPerson: null, total: amount } : { perPerson: amount, total: null };
}

// "1인당"은 인원이 아니므로 먼저 지웁니다.
const PARTY_WORDS: [RegExp, number][] = [[/혼자|한\s*명|한\s*분/, 1], [/두\s*(명|분)|둘이/, 2], [/세\s*(명|분)|셋이/, 3], [/네\s*(명|분)|넷이/, 4], [/다섯\s*(명|분)/, 5], [/여섯\s*(명|분)/, 6]];
export function parseParty(text: string): number {
  const t = text.replace(/\d*\s*인\s*당|한\s*사람\s*당/g, ' ');
  const n = t.match(/(\d+)\s*(명|분|인)(?!분)/);
  if (n) return Math.min(6, Math.max(1, Number(n[1])));
  return PARTY_WORDS.find(([re]) => re.test(t))?.[1] ?? 1;
}

// 말로 주문할 때 개수: 2개 / 두 개 / 네 개 / 다섯 개 / 한 마리. 개수 표현이 없으면 1개, 읽지 못한 개수 표현이 있으면 null.
const COUNT: [string, number][] = [['하나', 1], ['한', 1], ['둘', 2], ['두', 2], ['셋', 3], ['세', 3], ['넷', 4], ['네', 4], ['다섯', 5], ['여섯', 6], ['일곱', 7], ['여덟', 8], ['아홉', 9], ['열', 10]];
const UNIT = '(개|인분|접시|그릇|마리|판|세트)';
export function parseCount(text: string): number | null {
  const d = text.match(new RegExp(`(\\d+)\\s*${UNIT}`));
  if (d) return Number(d[1]);
  for (const [word, n] of COUNT) if (new RegExp(`(^|\\s)${word}\\s*${UNIT}`).test(text) || new RegExp(`(^|\\s)${word}(요|만|$|\\s*주세요)`).test(text)) return n;
  return new RegExp(`\\S+\\s*${UNIT}`).test(text) ? null : 1;
}

// "X 없는 / X 없이 / X 빼고 / X 말고 / X 알레르기 / X 싫어요"처럼 부정 표현이 바로 붙은 단어만 제외 대상으로 봅니다.
export const NEGATION = '(?:은|는|이|가|을|를|도|랑|하고)?\\s*(?:없는|없이|없고|빼고|빼\\s*주|빼주|빼요|빼|제외|말고|알레르기|알러지|싫|못\\s*먹|안\\s*먹|넣지\\s*말)';
export function negatedTerms(text: string, terms: string[]): string[] {
  return terms.filter(term => new RegExp(`${term}${NEGATION}`).test(text));
}
// 부정한 부분을 지운 문장. 원하는 종류·메뉴 이름을 찾을 때 씁니다.
export const stripNegated = (text: string) => text.replace(new RegExp(`\\S+${NEGATION}\\S*`, 'g'), ' ');

// "면" 단독도 인식합니다. "먹으면", "맛있으면"은 제외.
export const NOODLE = /(?:^|[\s,.])면(?=\s|$|요리|류|으로|을|이|도|요)|국수|짜장|짬뽕|누들|탕면|냉면|딴딴면|차우면/;

// 말로 주문: 이름이 겹치면(소롱포 ⊂ 홍게살 소롱포) 가장 긴 이름만 남깁니다.
export function matchMenus<T extends { name: string; aliases?: string[] }>(text: string, menus: T[]): T[] {
  const norm = (s: string) => s.replace(/\s/g, '');
  const said = norm(text);
  const names = (m: T) => [m.name, ...(m.aliases ?? [])].map(norm);
  const hits = menus.filter(m => names(m).some(n => said.includes(n)));
  return hits.filter(m => !hits.some(o => o !== m && names(o).some(on => names(m).some(n => on !== n && on.includes(n) && said.includes(on)))));
}

// "이렇게 이해했어요" 화면에서 문장의 어느 부분을 어떤 조건으로 읽었는지 표시하기 위한 구간 목록입니다.
export interface Highlight { start: number; end: number; type: 'party' | 'budget' | 'exclude' | 'kind' | 'spicy'; label: string }
export function explain(text: string, kindWords: [string, RegExp][], excludeWords: string[]): Highlight[] {
  const found: Highlight[] = [];
  const add = (m: RegExpExecArray | null, type: Highlight['type'], label: string, offset = 0) => { if (m) found.push({ start: m.index + offset, end: m.index + offset + m[0].trimEnd().length, type, label }); };
  const party = parseParty(text);
  add(/(\d+)\s*(명|분)|혼자|(한|두|세|네|다섯|여섯)\s*(명|분)|둘이|셋이|넷이/.exec(text), 'party', `인원 ${party}명`);
  const { perPerson, total } = parseBudget(text);
  if (perPerson || total) add(/(1\s*인\s*당\s*|총\s*|전체\s*)?(\d[\d,]*\s*원|[\d일이삼사오육칠팔구]*\s*만\s*([\d일이삼사오육칠팔구]\s*천\s*)?원?|[\d일이삼사오육칠팔구]+\s*천\s*원)/.exec(text), 'budget', total ? `총예산 ${total.toLocaleString('ko-KR')}원` : `1인당 ${perPerson!.toLocaleString('ko-KR')}원`);
  for (const term of negatedTerms(text, excludeWords)) add(new RegExp(`${term}${NEGATION}[^\\s,.]*`).exec(text), 'exclude', `${term} 제외`);
  add(/안\s*매운?|안\s*맵게|맵지\s*않|순한|매운\s*(거|것|음식)?\S*\s*(못|안)\s*먹|아주\s*매운?|많이\s*매운?|약간\s*매운?|조금\s*매운?|매콤|매운|맵게|얼큰/.exec(text), 'spicy', '맵기');
  const wanted = stripNegated(text);
  for (const [kind, re] of kindWords) { const m = re.exec(wanted); if (m) { const word = m[0].trim(); const at = text.indexOf(word); if (at >= 0) found.push({ start: at, end: at + word.length, type: 'kind', label: `종류 ${kind}` }); break; } }
  // 겹치는 구간은 먼저 찾은 것만 남깁니다.
  return found.sort((a, b) => a.start - b.start).filter((h, i, all) => !all.slice(0, i).some(o => h.start < o.end && o.start < h.end));
}
