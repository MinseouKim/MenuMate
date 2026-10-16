/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_STORE_SLUG?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
