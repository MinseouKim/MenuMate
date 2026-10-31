import type { FeaturedSet, Menu } from "../types.js";

export function Dashboard({ menus, featuredSets }: { menus: Menu[]; featuredSets: FeaturedSet[] }) {
  const soldOutCount = menus.filter((m) => m.sold_out).length;
  const featuredCount = menus.filter((m) => m.is_featured).length;
  const activeSetCount = featuredSets.filter((s) => s.active).length;
  // 우루루 메뉴는 전부 category가 "main"이라 카테고리별 개수는 의미가 없다 → 음식 종류(kind)별로 센다.
  const kindCounts = [...menus.reduce((acc, m) => acc.set(m.kind ?? "미분류", (acc.get(m.kind ?? "미분류") ?? 0) + 1), new Map<string, number>())];

  return (
    <div>
      <div className="summary-grid">
        <div className="summary-card">
          <div className="value">{menus.length}</div>
          <div className="label">전체 메뉴</div>
        </div>
        <div className="summary-card">
          <div className="value">{soldOutCount}</div>
          <div className="label">품절 중</div>
        </div>
        <div className="summary-card">
          <div className="value">{featuredCount}</div>
          <div className="label">추천 메뉴 지정</div>
        </div>
        <div className="summary-card">
          <div className="value">{activeSetCount}</div>
          <div className="label">활성 추천 세트</div>
        </div>
      </div>

      <div className="panel">
        <h2>음식 종류별 메뉴 수</h2>
        <div className="summary-grid">
          {kindCounts.map(([kind, count]) => (
            <div className="summary-card" key={kind}><div className="value">{count}</div><div className="label">{kind}</div></div>
          ))}
        </div>
      </div>

      <p className="muted">
        참고: 키오스크에서 결제가 끝난 주문은 서버에 저장되고 있어요. 주문 내역 조회와 매출 집계 화면은
        아직 없어요.
      </p>
    </div>
  );
}
