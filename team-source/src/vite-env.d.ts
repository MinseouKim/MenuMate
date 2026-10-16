/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** AI 조건 추출 서버 주소 (예: http://localhost:4000). LLM 키는 서버 .env에만 둡니다.
   * 설정돼 있으면 메뉴 품절/가격/추천 지정 여부도 이 서버에서 주기적으로 받아오고(menuLive.ts),
   * 결제 완료 주문도 이 서버로 보냅니다(orderClient.ts). */
  readonly VITE_API_BASE_URL?: string;
  /** 서버 쪽 매장 slug. 비워 두면 'ururu-headquarters'를 씁니다 (server/admin-app과 동일한 기본값). */
  readonly VITE_STORE_SLUG?: string;
  /** 휴대폰에서 열 수 있는 영수증 배포 주소 */
  readonly VITE_RECEIPT_BASE_URL?: string;
  /** 휴대폰 영수증 아래 설문 링크 */
  readonly VITE_SURVEY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
