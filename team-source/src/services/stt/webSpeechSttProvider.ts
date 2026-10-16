import type { SttCallbacks, SttProvider } from "./types";

/**
 * Chrome 등 webkitSpeechRecognition / SpeechRecognition을 지원하는 브라우저용 STT.
 * 누르면 시작·다시 누르면 끝: start()는 첫 번째 누름, stop()은 두 번째 누름에 호출한다.
 * 말하는 동안 끊겨도 이어서 듣도록 continuous로 듣고, 끝날 때 들은 문장을 한 번에 onResult로 넘긴다.
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
    recognition.continuous = true;
    recognition.interimResults = true;

    // 확정된 문장과 아직 말하는 중인 문장을 나눠 모읍니다. 끝낼 때는 둘을 합쳐서 넘깁니다.
    let finals = "";
    let interim = "";
    let failed = false;
    recognition.onresult = (event) => {
      finals = "";
      interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finals += r[0]?.transcript ?? "";
        else interim += r[0]?.transcript ?? "";
      }
      callbacks.onInterim?.(`${finals}${interim}`.trim());
    };
    recognition.onerror = (event) => {
      // 사용자가 끝내기 전에 잠깐 조용했던 것은 오류가 아닙니다(끝날 때 들은 내용이 없으면 안내).
      if (event.error === "no-speech" || event.error === "aborted") return;
      failed = true;
      callbacks.onError(mapSpeechError(event.error));
    };
    recognition.onend = () => {
      if (this.recognition === recognition) this.recognition = null;
      const transcript = `${finals}${interim}`.replace(/\s+/g, " ").trim();
      if (!failed) {
        if (transcript) callbacks.onResult(transcript);
        else callbacks.onError(mapSpeechError("no-speech"));
      }
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
      return "말씀을 듣지 못했어요. 다시 눌러서 말씀해 주세요.";
    case "network":
      return "인터넷 연결이 불안정해서 음성 인식이 되지 않아요. '메뉴판에서 직접 고르기'로 이어서 주문해 주세요.";
    default:
      return "음성 인식 중 오류가 발생했습니다.";
  }
}
