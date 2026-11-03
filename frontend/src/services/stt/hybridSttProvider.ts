import { mediaErrorMessage } from "../../prototype/media";
import { AudioRecorder, recorderSupported } from "./audioRecorder";
import { loadWhisper, transcribeLocal } from "./localWhisper";
import type { SttCallbacks, SttProvider } from "./types";
import { WebSpeechSttProvider } from "./webSpeechSttProvider";
import { isHallucination, speechLike } from "./whisperFilter";

// 브라우저 음성 인식이 못 쓰는 경우: 인터넷 없음(network), 서비스 막힘, 언어 미지원
const FALLBACK_CODES = new Set(["network", "service-not-allowed", "language-not-supported"]);
const MIN_SAMPLES = 16000 * 0.4; // 0.4초보다 짧으면 말이 없었던 것으로 본다
// 끝내기를 눌렀는데 이 시간 안에 Web Speech가 답이 없으면(오류도 안 내고 멈춘 경우) 로컬로 받아 적는다
const WEB_STOP_TIMEOUT_MS = 4000;

interface Session { cb: SttCallbacks; local: boolean; stopped: boolean; finishing: boolean; watchdog?: ReturnType<typeof setTimeout> }

/**
 * 인터넷이 되면 브라우저 음성 인식(Web Speech)을, 안 되면 이 기기 안의 Whisper를 쓴다 (D32).
 * Web Speech가 처음 실패하면 그 뒤로는 바로 로컬로 간다. 녹음은 로컬 인식에만 쓰고 메모리에만 둔다.
 */
export class HybridSttProvider implements SttProvider {
  readonly name = "web-speech+local-whisper";
  private web = new WebSpeechSttProvider();
  private recorder = new AudioRecorder();
  private webBroken = false;
  private session: Session | null = null;

  isSupported(): boolean {
    return this.web.isSupported() || recorderSupported();
  }

  start(cb: SttCallbacks): void {
    this.cancel();
    const s: Session = { cb, local: false, stopped: false, finishing: false };
    this.session = s;
    const canLocal = recorderSupported();
    s.local = !this.web.isSupported() || this.webBroken || (typeof navigator !== "undefined" && navigator.onLine === false);
    if (s.local && !canLocal) { cb.onError("이 브라우저에서는 음성 인식을 사용할 수 없어요.", "unsupported"); return; }

    if (canLocal) {
      // 소리를 모으는 건 인터넷이 되는 경우의 대비이기도 하다(도중에 끊겨도 이어서 받아 적는다)
      this.recorder.start().catch(e => {
        if (this.session !== s || !s.local) return;
        this.session = null;
        cb.onError(mediaErrorMessage(e, "마이크"), "audio-capture");
        cb.onEnd();
      });
    }
    if (s.local) { void loadWhisper().catch(() => undefined); return; }

    this.web.start({
      onInterim: (t, final) => { if (!s.local) cb.onInterim?.(t, final); },
      onResult: t => { if (!s.local) { clearTimeout(s.watchdog); cb.onResult(t); } },
      onError: (message, code) => {
        if (s.local) return;
        clearTimeout(s.watchdog);
        // 서비스가 안 되는 오류, 또는 끝낸 뒤 빈 결과(Web Speech가 아무것도 못 받음)는 로컬로 다시 받아 적는다
        const broken = Boolean(code && FALLBACK_CODES.has(code));
        if (canLocal && (broken || (s.stopped && (!code || code === "no-speech")))) {
          if (broken) this.webBroken = true;
          s.local = true;
          void loadWhisper().catch(() => undefined); // 말하는 동안 모델을 미리 불러 둔다
          if (s.stopped) void this.finishLocal(s);
          return;
        }
        this.recorder.cancel();
        cb.onError(message, code);
      },
      onEnd: () => { if (s.local) return; clearTimeout(s.watchdog); this.recorder.cancel(); cb.onEnd(); },
    });
  }

  stop(): void {
    const s = this.session;
    if (!s) return;
    s.stopped = true;
    if (s.local) { void this.finishLocal(s); return; }
    this.web.stop();
    if (recorderSupported()) {
      s.watchdog = setTimeout(() => {
        if (this.session !== s || s.local) return;
        this.webBroken = true; s.local = true;
        void this.finishLocal(s);
      }, WEB_STOP_TIMEOUT_MS);
    }
  }

  cancel(): void {
    clearTimeout(this.session?.watchdog);
    this.session = null;
    this.recorder.cancel();
    this.web.cancel();
  }

  private async finishLocal(s: Session): Promise<void> {
    if (s.finishing) return;
    s.finishing = true;
    clearTimeout(s.watchdog);
    try {
      const audio = await this.recorder.stop();
      if (this.session !== s) return;
      // 짧거나 말소리로 보기 어려운 녹음은 받아 적지 않고, Whisper가 지어낸 문장(영상 끝인사 등)은 손님 말로 넘기지 않는다
      const heard = audio.length < MIN_SAMPLES || !speechLike(audio) ? "" : await transcribeLocal(audio);
      if (this.session !== s) return;
      const text = isHallucination(heard) ? "" : heard;
      if (text) s.cb.onResult(text);
      // 코드 없는 "못 들음"은 Web Speech 의 무음과 같게 다룬다: 버튼으로 들을 때는 안내, 핸즈프리는 오류 없이 다시 듣기
      else s.cb.onError("말씀을 듣지 못했어요. 다시 눌러서 말씀해 주세요.");
    } catch {
      if (this.session !== s) return;
      s.cb.onError("음성 인식을 시작하지 못했어요. '메뉴판에서 직접 고르기'로 이어서 주문해 주세요.", "local-failed");
    } finally {
      if (this.session === s) { this.session = null; s.cb.onEnd(); }
    }
  }
}
