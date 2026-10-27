import { describe, expect, it } from "vitest";
import { buildEvidenceRows, type MergedMenuReviews } from "../../src/db/menuReviewEvidence.js";

const data: MergedMenuReviews = {
  info: { generated_at: "2026-10-27" },
  menus: [
    {
      id: "dimsum-3",
      name: "소룡포",
      status: "근거 있음 (개별+공통)",
      common_pools: ["딤섬"],
      evidence: [
        { rid: "R010", platform: "네이버지도", keywords: ["맛있음", "최고·강추"] },
        { rid: "R011", platform: "블로그(다이닝코드 경유)", keywords: ["맛있음"] },
      ],
    },
    { id: "dimsum-2", name: "홍콩식 딤섬 트리오", status: "근거 있음 (공통)", common_pools: ["딤섬"], evidence: [] },
    { id: "soup-1", name: "송이 청채 전복 맑은 스프", status: "리뷰 근거 없음", common_pools: [], evidence: [] },
  ],
  common_pools: {
    딤섬: {
      menus: ["dimsum-2", "dimsum-3"],
      reviews: [
        { rid: "R010", platform: "네이버지도", keywords: ["맛있음"] }, // 개별 근거와 같은 리뷰 — 중복으로 세지 않는다
        { rid: "R166", platform: "캐치테이블", keywords: ["맛있음"] },
      ],
    },
  },
};

describe("buildEvidenceRows", () => {
  const rows = buildEvidenceRows(data);

  it("리뷰 근거 없는 메뉴는 행을 만들지 않는다", () => {
    expect(rows.map((r) => r.external_id)).toEqual(["dimsum-3", "dimsum-2"]);
  });

  it("직접 언급 수(mention_count)와 공통 근거 포함 전체 수(sample_size)를 중복 없이 센다", () => {
    const soryongpo = rows.find((r) => r.external_id === "dimsum-3")!;
    expect(soryongpo.mention_count).toBe(2);
    expect(soryongpo.sample_size).toBe(3);
    expect(soryongpo.source_summary).toContain("직접 언급한 긍정 리뷰 2건");
    expect(soryongpo.source_summary).toContain("주요 키워드: 맛있음 2");
  });

  it("공통 근거만 있는 메뉴는 직접 언급이 없다고 정직하게 적는다", () => {
    const trio = rows.find((r) => r.external_id === "dimsum-2")!;
    expect(trio.mention_count).toBe(0);
    expect(trio.source_summary).toContain("직접 언급한 리뷰는 아직 없음");
  });

  it("리뷰 원문을 저장하지 않는 공개 리뷰 집계로만 만든다", () => {
    for (const r of rows) {
      expect(r.source_type).toBe("manual_public_review_aggregate");
      expect(r.field_name).toBe("overall");
      expect(r.collected_at).toBe("2026-10-27");
      expect(r.source_summary.length <= 500).toBe(true);
    }
  });
});
