import type { FeaturedSet, Menu } from "../types.js";

export function Dashboard({ menus, featuredSets }: { menus: Menu[]; featuredSets: FeaturedSet[] }) {
  const soldOutCount = menus.filter((m) => m.sold_out).length;
  const featuredCount = menus.filter((m) => m.is_featured).length;
  const activeSetCount = featuredSets.filter((s) => s.active).length;
  const byCategory = (category: Menu["category"]) => menus.filter((m) => m.category === category).length;

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
        <h2>카테고리별 메뉴 수</h2>
        <div className="summary-grid">
          <div className="summary-card"><div className="value">{byCategory("main")}</div><div className="label">메인</div></div>
          <div className="summary-card"><div className="value">{byCategory("side")}</div><div className="label">사이드</div></div>
          <div className="summary-card"><div className="value">{byCategory("drink")}</div><div className="label">음료</div></div>
        </div>
      </div>

      <p className="muted">
        참고: 이 대시보드는 지금 메뉴·추천 세트 구성만 보여줘요. 실제 주문/매출 집계는 키오스크의 주문
        완료 흐름이 아직 서버에 연결되어 있지 않아서(프로토타입 단계) 이 화면 범위 밖이에요 — 나중에
        키오스크가 결제 완료 시 서버에 주문을 저장하도록 연결되면 여기에 추가할 수 있어요.
      </p>
    </div>
  );
}
