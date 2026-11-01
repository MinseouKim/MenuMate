#!/usr/bin/env node
// ururu-menu/raw/*.json (collect-reviews.mjs 결과) + 기존 menu_reviews.json → 메뉴별 리뷰 파일을 다시 만든다 (D98).
// - 메뉴 이름·aliases·keywords 가 본문에 나오면 그 메뉴에 배정한다 (한 리뷰가 여러 메뉴에 붙을 수 있음)
// - 메뉴당 최대 5건. 최신 날짜·긴 본문 우선. 기존 인용(수기 선별)은 유지한다
// - 키워드는 규칙 12종으로 붙인다 (기존 데이터와 같은 어휘)
// - 닉네임·사진은 애초에 raw 에 없다. 본문은 300자에서 자른다(truncated 표시)
//
//   node scripts/build-menu-reviews.mjs            결과를 frontend/src/prototype/menu/review/menu_reviews.json 에 쓴다
//   node scripts/build-menu-reviews.mjs --dry      쓰지 않고 통계만

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MENU_DIR = path.join(ROOT, 'frontend', 'src', 'prototype', 'menu');
const RAW_DIR = path.join(ROOT, 'ururu-menu', 'raw');
const OUT = path.join(MENU_DIR, 'review', 'menu_reviews.json');
const SUMMARIES = path.join(MENU_DIR, 'review', 'review_summaries.json');
const PER_MENU = 5;
const MAX_LEN = 300;
const dry = process.argv.includes('--dry');

const KEYWORD_RULES = [
  ['맛있음', /맛있|맛나|맛도 좋/], ['최고·강추', /최고|강추|추천|또 올|재방문/], ['바삭함', /바삭/], ['담백·깔끔', /담백|깔끔/],
  ['부드러움', /부드러|촉촉|야들/], ['매콤함', /매콤|칼칼|얼큰/], ['양 넉넉', /양이 많|양도 많|넉넉|푸짐/], ['고소함', /고소/],
  ['간 적당함', /간이 (딱|적당)|짜지 않/], ['신선함', /신선|싱싱/], ['국물 시원함', /국물.*(시원|진하|깊)/], ['면 식감 좋음', /면발|면이 (쫄깃|탱글)|쫄깃/],
];
const keywordsOf = (texts) => KEYWORD_RULES.filter(([, re]) => texts.some((t) => re.test(t))).map(([k]) => k).slice(0, 3);

const menus = JSON.parse(await readFile(path.join(MENU_DIR, 'menus.json'), 'utf8'));
const existing = JSON.parse(await readFile(OUT, 'utf8'));
const summaries = JSON.parse(await readFile(SUMMARIES, 'utf8').catch(() => '{}'));

let raw = [];
try {
  for (const f of await readdir(RAW_DIR)) {
    if (!f.endsWith('.json')) continue;
    const data = JSON.parse(await readFile(path.join(RAW_DIR, f), 'utf8'));
    raw.push(...(data.reviews ?? []));
  }
} catch {
  console.log('ururu-menu/raw/ 가 없어 기존 인용만으로 다시 만듭니다.');
}
console.log(`원본 리뷰 ${raw.length}건, 기존 인용 ${existing.menus.reduce((s, m) => s + m.reviews.length, 0)}건`);

const norm = (s) => s.replace(/\s+/g, '').toLowerCase();
const nameTokens = (m) => [m.name, ...(m.aliases ?? []), ...(m.keywords ?? [])].map(norm).filter((t) => t.length >= 2);
const byId = new Map(existing.menus.map((m) => [m.id, { id: m.id, keywords: m.keywords ?? [], reviews: [...m.reviews] }]));
const have = new Set(existing.menus.flatMap((m) => m.reviews.map((r) => norm(r.quote))));

const parseDate = (d) => {
  const m = String(d ?? '').match(/(\d{2,4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/);
  if (!m) return null;
  const y = m[1].length === 2 ? `20${m[1]}` : m[1];
  return `${y}.${m[2].padStart(2, '0')}.${m[3].padStart(2, '0')}`;
};

let added = 0;
for (const menu of menus) {
  const tokens = nameTokens(menu);
  const matched = raw
    .filter((r) => { const n = norm(r.quote); return !have.has(n) && tokens.some((t) => n.includes(t)); })
    .sort((a, b) => (parseDate(b.date) ?? '').localeCompare(parseDate(a.date) ?? '') || b.quote.length - a.quote.length);
  if (!matched.length) continue;
  const entry = byId.get(menu.id) ?? { id: menu.id, keywords: [], reviews: [] };
  for (const r of matched) {
    if (entry.reviews.length >= PER_MENU) break;
    const full = r.quote.trim();
    const quote = full.length > MAX_LEN ? `${full.slice(0, MAX_LEN)}…` : full;
    const row = { platform: r.platform, date: parseDate(r.date) ?? '날짜 미상', rating: r.rating ?? null, quote };
    if (full.length > MAX_LEN) row.truncated = true;
    if (summaries[full]) row.summary = summaries[full];
    entry.reviews.push(row);
    have.add(norm(full));
    added++;
  }
  entry.keywords = [...new Set([...entry.keywords, ...keywordsOf(entry.reviews.map((r) => r.quote))])].slice(0, 3);
  byId.set(menu.id, entry);
}

const order = menus.map((m) => m.id);
const out = {
  updated: new Date().toISOString().slice(0, 10),
  menus: [...byId.values()].filter((m) => m.reviews.length).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
};
const total = out.menus.reduce((s, m) => s + m.reviews.length, 0);
console.log(`새로 붙인 리뷰 ${added}건 → 메뉴 ${out.menus.length}개, 리뷰 ${total}건 (메뉴당 최대 ${PER_MENU})`);
if (dry) process.exit(0);
await writeFile(OUT, `${JSON.stringify(out, null, 1).replace(/\n\s+"/g, '\n "')}\n`);
console.log(`저장: ${path.relative(ROOT, OUT)}`);
