/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** AI 조건 추출 서버 주소 (예: http://localhost:4000). LLM 키는 서버 .env에만 둡니다. */
  readonly VITE_API_BASE_URL?: string;
  /** 휴대폰에서 열 수 있는 영수증 배포 주소 */
  readonly VITE_RECEIPT_BASE_URL?: string;
  /** 휴대폰 영수증 아래 설문 링크 */
  readonly VITE_SURVEY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
