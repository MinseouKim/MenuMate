/**
 * 병합 리뷰 데이터(ururu-menu/menu_reviews.json) → menu_evidences 행으로 바꾸는 순수 함수.
 * DB 접속 없이 테스트할 수 있게 import 스크립트(importMenuEvidences.ts)와 분리했다.
 *
 * 저장 원칙 (002_seed_placeholder.sql의 공개 리뷰 집계 예시와 같음):
 * - 리뷰 원문·작성자·링크·사진은 DB에 넣지 않는다. 메뉴마다 "공개 리뷰 수기 집계" 한 줄만 넣는다.
 * - source_type은 manual_public_review_aggregate — 가격/품절/재료/알레르기 필드에는 쓰지 않는다
 *   (field_name은 'overall'이라 EVIDENCE_SOURCE_RESTRICTED_FIELD_PREFIXES에 걸리지 않는다).
 * - 리뷰 근거가 없는 메뉴는 행을 만들지 않는다 → 추천 엔진에서 "리뷰 근거 없음"으로 정직하게 처리된다.
 */
export const REVIEW_EVIDENCE_SOURCE_TYPE = "manual_public_review_aggregate" as const;

interface ReviewLike {
  rid?: string;
  platform: string;
  keywords?: string[];
}

export interface MergedMenuReviews {
  info: { generated_at: string };
  menus: {
    id: string;
    name: string;
    status: string;
    common_pools?: string[];
    evidence?: ReviewLike[];
  }[];
  common_pools?: Record<string, { menus: string[]; reviews: ReviewLike[] }>;
}

export interface EvidenceRow {
  external_id: string;
  field_name: string;
  source_type: typeof REVIEW_EVIDENCE_SOURCE_TYPE;
  source_summary: string;
  sample_size: number;
  mention_count: number;
  collected_at: string;
}

const SUMMARY_MAX = 500; // menu_evidences.source_summary VARCHAR(500)

function topKeywords(reviews: ReviewLike[], n = 3): string[] {
  const counts = new Map<string, number>();
  for (const r of reviews) for (const k of r.keywords ?? []) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, c]) => `${k} ${c}`);
}

function platformsOf(reviews: ReviewLike[]): string {
  return [...new Set(reviews.map((r) => r.platform))].join("·");
}

export function buildEvidenceRows(data: MergedMenuReviews): EvidenceRow[] {
  const pools = data.common_pools ?? {};
  const rows: EvidenceRow[] = [];

  for (const menu of data.menus) {
    if (menu.status === "리뷰 근거 없음") continue;
    const specific = menu.evidence ?? [];
    const poolNames = (menu.common_pools ?? []).filter((p) => pools[p]);
    const seen = new Set(specific.map((r) => r.rid).filter(Boolean));
    const common: ReviewLike[] = [];
    for (const name of poolNames) {
      for (const r of pools[name].reviews) {
        if (r.rid && seen.has(r.rid)) continue;
        if (r.rid) seen.add(r.rid);
        common.push(r);
      }
    }
    if (specific.length === 0 && common.length === 0) continue;

    const poolLabel = poolNames.map((p) => `'${p}'`).join("·");
    let summary: string;
    if (specific.length > 0) {
      summary = `공개 리뷰 집계: 이 메뉴를 직접 언급한 긍정 리뷰 ${specific.length}건(${platformsOf(specific)})`;
      if (common.length > 0) summary += `, ${poolLabel} 전체를 칭찬한 리뷰 ${common.length}건`;
    } else {
      summary = `공개 리뷰 집계: ${poolLabel} 전체를 칭찬한 리뷰 ${common.length}건(${platformsOf(common)}) — 이 메뉴를 직접 언급한 리뷰는 아직 없음`;
    }
    const kws = topKeywords(specific.length > 0 ? specific : common);
    if (kws.length) summary += `. 주요 키워드: ${kws.join(", ")}`;

    rows.push({
      external_id: menu.id,
      field_name: "overall",
      source_type: REVIEW_EVIDENCE_SOURCE_TYPE,
      source_summary: summary.length > SUMMARY_MAX ? summary.slice(0, SUMMARY_MAX - 1) + "…" : summary,
      sample_size: specific.length + common.length,
      mention_count: specific.length,
      collected_at: data.info.generated_at,
    });
  }
  return rows;
}
