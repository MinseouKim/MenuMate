// ururu-menu/menu_reviews.json(수집 원본) → src/prototype/menu/review/menu_reviews.json(키오스크용).
// 원본 인용에는 플랫폼 미리보기가 섞여 있다: '미리보기… / …전체 글'처럼 붙어 있거나, '…'으로 잘리거나,
// 같은 리뷰의 전체 글이 다른 메뉴 쪽에 들어 있다. 여기서 이어 붙이거나 더 긴 글로 바꿔 최대한 전체 리뷰로 만든다.
// 긴 리뷰의 요약은 review_summaries.json(정리된 전체 글 → 요약)에 사람이 적어 두고 여기서 붙인다.
// 실행: node team-source/scripts/buildMenuReviews.mjs  (원본이나 요약을 고친 뒤)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const SOURCE = at('../../ururu-menu/menu_reviews.json');
const SUMMARIES = at('../src/prototype/menu/review/review_summaries.json');
const OUT = at('../src/prototype/menu/review/menu_reviews.json');
export const SUMMARY_FROM = 80; // 이 글자 수를 넘는 리뷰는 요약을 먼저 보여 준다.

const ELLIPSIS = /\s*(?:…|\.\.\.)\s*/g;
const core = (s) => s.replace(/^\s*(?:…|\.\.\.)\s*/, '').replace(/\s*(?:…|\.\.\.)\s*$/, '').trim();

// a의 끝과 b의 앞이 겹치면(10자 이상) 하나로 잇는다.
function join(a, b) {
  const A = core(a), B = core(b);
  if (B.includes(A)) return b; if (A.includes(B)) return a;
  for (let k = Math.min(A.length, B.length); k >= 10; k--) if (A.endsWith(B.slice(0, k))) return (/^\s*…/.test(a) ? '…' : '') + A.slice(0, A.length - k) + B + (/…\s*$/.test(b) ? '…' : '');
  return `${a} ${b}`;
}
const merge = (quote) => quote.split(' / ').reduce((acc, part) => acc === null ? part : join(acc, part), null).trim();

// '…'·'...'으로 줄인 글이 데이터 안의 다른(더 긴) 글에 그대로 들어 있으면 그 글로 바꾼다.
const pattern = (q) => new RegExp(core(q).split(ELLIPSIS).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*?'));
const cut = (q) => /^\s*…|…\s*$|\.\.\./.test(q);

const source = JSON.parse(readFileSync(SOURCE, 'utf8'));
const summaries = JSON.parse(readFileSync(SUMMARIES, 'utf8'));
const split = (q) => { const m = q.match(/^\[([^\]]+)\]\s*/); return m ? { scope: m[1], quote: q.slice(m[0].length) } : { quote: q }; };
const merged = source.menus.flatMap(m => m.reviews.map(r => merge(split(r.quote).quote)));
const fullest = (q) => !cut(q) ? q : merged.filter(o => o !== q && o.length > core(q).length && pattern(q).test(o)).sort((x, y) => cut(x) - cut(y) || y.length - x.length)[0] ?? q;

const missing = [];
const menus = source.menus.filter(m => m.reviews.length).map(m => ({
  id: m.id,
  keywords: m.top_keywords,
  reviews: m.reviews.map(r => {
    const { scope } = split(r.quote); const quote = fullest(merge(split(r.quote).quote));
    const summary = quote.length > SUMMARY_FROM ? summaries[quote] : undefined;
    if (quote.length > SUMMARY_FROM && !summary) missing.push(quote);
    return { platform: r.platform, date: r.date, rating: r.rating, ...(scope && { scope }), quote, ...(cut(quote) && { truncated: true }), ...(summary && { summary }) };
  }),
}));

writeFileSync(OUT, JSON.stringify({ updated: source.info.generated_at, menus }, null, 1) + '\n');
console.log(`[menu-reviews] ${menus.length}개 메뉴 → ${OUT}`);
if (missing.length) { console.log(`[menu-reviews] 요약이 없는 긴 리뷰 ${missing.length}개 (review_summaries.json에 추가):`); for (const q of new Set(missing)) console.log(`- ${q}`); }
