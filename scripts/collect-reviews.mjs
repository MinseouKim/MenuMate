#!/usr/bin/env node
// 우루루 평촌본점 공개 리뷰 반자동 수집 (D98). 사람이 로그인해 둔 Chrome 프로필로 네이버 플레이스 리뷰 페이지를 열고,
// 보이는 리뷰의 본문·날짜·별점만 모아 ururu-menu/raw/<플랫폼>-<날짜>.json 에 둔다 (git 제외, D74).
// 닉네임·프로필·사진은 저장하지 않는다. 자동 로그인·대량 반복 호출은 하지 않는다(플랫폼 약관 리스크는 사용자가 인지, D98).
//
//   npx playwright install chromium          (최초 1회)
//   node scripts/collect-reviews.mjs --url "https://m.place.naver.com/restaurant/<id>/review/visitor" --max 300
//   node scripts/collect-reviews.mjs --url "..." --profile ~/Library/Application\ Support/Google/Chrome/Default
//
// 그다음 node scripts/build-menu-reviews.mjs 로 메뉴별 파일을 다시 만든다.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'ururu-menu', 'raw');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const url = arg('url');
const max = Number(arg('max', '300'));
const profile = arg('profile');
if (!url) {
  console.error('사용법: node scripts/collect-reviews.mjs --url <리뷰 페이지 주소> [--max 300] [--profile <Chrome 프로필 폴더>]');
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright가 없습니다. 루트에서  npm i -D playwright && npx playwright install chromium  을 먼저 실행하세요.');
  process.exit(1);
}

const platform = /naver/.test(url) ? '네이버지도' : /kakao/.test(url) ? '카카오맵' : /catchtable/.test(url) ? '캐치테이블' : '기타';
const context = profile
  ? await chromium.launchPersistentContext(profile, { headless: false, viewport: { width: 480, height: 900 } })
  : await (await chromium.launch({ headless: false })).newContext({ viewport: { width: 480, height: 900 } });
const page = context.pages()[0] ?? (await context.newPage());
await page.goto(url, { waitUntil: 'domcontentloaded' });
console.log('페이지를 열었습니다. 로그인·동의 창이 있으면 직접 처리하세요. 리뷰가 보이면 자동으로 "더보기"를 누르며 모읍니다.');

// 플랫폼마다 DOM이 달라서 넓은 선택자로 "리뷰 블록처럼 보이는 것"을 모으고, 본문 길이로 거른다.
const SELECTORS = {
  '네이버지도': { item: 'li', text: 'a[role="button"] span, .pui__vn15t2, [class*="review"] span', date: 'time', more: 'a:has-text("더보기"), button:has-text("더보기")' },
  '카카오맵': { item: 'li', text: '[class*="txt_comment"], [class*="desc"]', date: '[class*="time"], time', more: 'a:has-text("후기 더보기"), button:has-text("더보기")' },
  '캐치테이블': { item: 'li, article', text: 'p', date: 'time, span', more: 'button:has-text("더보기")' },
  '기타': { item: 'li, article', text: 'p, span', date: 'time', more: 'button:has-text("더보기")' },
}[platform];

const seen = new Map();
let stale = 0;
while (seen.size < max && stale < 6) {
  const before = seen.size;
  const items = await page.$$eval(SELECTORS.item, (nodes, sel) => nodes.map((n) => {
    const texts = [...n.querySelectorAll(sel.text)].map((e) => e.textContent?.trim() ?? '').filter((t) => t.length >= 15);
    const quote = texts.sort((a, b) => b.length - a.length)[0] ?? '';
    const date = n.querySelector(sel.date)?.textContent?.trim() ?? null;
    const star = n.textContent?.match(/([1-5](?:\.\d)?)\s*점|별점\s*([1-5])/);
    return { quote, date, rating: star ? Number(star[1] ?? star[2]) : null };
  }), SELECTORS);
  for (const it of items) {
    if (it.quote.length < 15 || it.quote.length > 1200) continue;
    if (!seen.has(it.quote)) seen.set(it.quote, { platform, date: it.date, rating: it.rating, quote: it.quote });
  }
  stale = seen.size === before ? stale + 1 : 0;
  const more = await page.$(SELECTORS.more);
  if (more) { await more.click().catch(() => {}); await page.waitForTimeout(1200); }
  else { await page.mouse.wheel(0, 2400); await page.waitForTimeout(900); }
  process.stdout.write(`\r모은 리뷰 ${seen.size}개`);
}
console.log();

await mkdir(OUT_DIR, { recursive: true });
const file = path.join(OUT_DIR, `${platform}-${new Date().toISOString().slice(0, 10)}.json`);
await writeFile(file, JSON.stringify({ platform, url, collectedAt: new Date().toISOString(), reviews: [...seen.values()] }, null, 1));
console.log(`저장: ${path.relative(ROOT, file)} (${seen.size}건). 다음: node scripts/build-menu-reviews.mjs`);
await context.close();
