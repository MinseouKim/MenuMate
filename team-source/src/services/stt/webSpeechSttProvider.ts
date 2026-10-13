import type { SttCallbacks, SttProvider } from "./types";

/**
 * Chrome 등 webkitSpeechRecognition / SpeechRecognition을 지원하는 브라우저용 STT.
 * Push-to-talk: start()는 버튼을 누르는 순간, stop()은 떼는 순간 호출한다.
 * 오디오/녹음 원문은 저장하지 않고, 인식된 텍스트만 콜백으로 전달한다.
 */
export class WebSpeechSttProvider implements SttProvider {
  readonly name = "web-speech-api";
  private recognition: SpeechRecognitionLike | null = null;

  isSupported(): boolean {
    return Boolean(
      typeof window !== "undefined" &&
        (window.SpeechRecognition || window.webkitSpeechRecognition),
    );
  }

  start(callbacks: SttCallbacks): void {
    this.cancel();
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      callbacks.onError("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const transcript = last?.[0]?.transcript ?? "";
      callbacks.onResult(transcript);
    };
    recognition.onerror = (event) => {
      callbacks.onError(mapSpeechError(event.error));
    };
    recognition.onend = () => {
      if (this.recognition === recognition) this.recognition = null;
      callbacks.onEnd();
    };

    this.recognition = recognition;
    recognition.start();
  }

  stop(): void {
    this.recognition?.stop();
  }

  /** Discard pending results when leaving a screen or cancelling a gesture. */
  cancel(): void {
    const recognition = this.recognition;
    this.recognition = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.abort();
  }
}

function mapSpeechError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "permission-denied":
      return "마이크 권한이 막혀 있어요. 주소창 왼쪽 아이콘에서 마이크를 '허용'으로 바꾼 뒤 새로고침해 주세요. 앱 안의 미리보기 창이라면 Chrome에서 직접 열어 주세요.";
    case "service-not-allowed":
      return "이 브라우저 창에서는 음성 인식 서비스를 쓸 수 없어요. Chrome이나 Edge에서 직접 열어 주세요.";
    case "audio-capture":
      return "연결된 마이크를 찾지 못했어요. 마이크 연결을 확인해 주세요.";
    case "no-speech":
      return "음성이 감지되지 않았습니다. 다시 눌러서 말씀해주세요.";
    case "network":
      return "인터넷 연결이 불안정해서 음성 인식이 되지 않아요. '버튼으로 고르기'로 이어서 주문해 주세요.";
    default:
      return "음성 인식 중 오류가 발생했습니다.";
  }
}
