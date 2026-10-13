export type { SttCallbacks, SttProvider } from "./types";
import { WebSpeechSttProvider } from "./webSpeechSttProvider";
import type { SttProvider } from "./types";

const provider = new WebSpeechSttProvider();

/**
 * STT 프로바이더를 가져온다. 브라우저가 지원하지 않으면 null을 반환하므로,
 * 호출부(AI 추천 화면)는 null일 때 텍스트 입력으로 자연스럽게 전환해야 한다.
 */
export function getSttProvider(): SttProvider | null {
  return provider.isSupported() ? provider : null;
}
