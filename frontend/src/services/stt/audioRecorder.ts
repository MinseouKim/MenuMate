/**
 * 마이크 소리를 메모리에만 모으는 녹음기. 로컬 음성 인식(Whisper)에 넘길 16kHz 모노 샘플로 바꿔 준다.
 * 파일·저장소·서버로 보내지 않고, stop()/cancel() 뒤에는 모두 버린다 (개인정보 규칙 D2).
 */
const SAMPLE_RATE = 16000;
const MAX_SECONDS = 30; // Whisper 한 번에 들을 수 있는 길이

export const recorderSupported = () =>
  typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

export class AudioRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private starting: Promise<void> | null = null;

  start(): Promise<void> {
    this.cancel();
    const chunks: Blob[] = this.chunks = [];
    this.starting = (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      // 시작하는 동안 cancel()이 불렸으면 바로 끈다
      if (this.chunks !== chunks) { stream.getTracks().forEach(t => t.stop()); return; }
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.start(250);
      this.stream = stream; this.recorder = recorder;
    })();
    return this.starting;
  }

  /** 녹음을 끝내고 16kHz 모노 샘플을 돌려준다 */
  async stop(): Promise<Float32Array> {
    try { await this.starting; } catch { return new Float32Array(0); }
    const recorder = this.recorder;
    if (!recorder) return new Float32Array(0);
    const blob = await new Promise<Blob>(resolve => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: recorder.mimeType }));
      if (recorder.state === 'inactive') recorder.onstop(new Event('stop')); else recorder.stop();
    });
    this.release();
    if (blob.size === 0) return new Float32Array(0);
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    try {
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      return decoded.getChannelData(0).slice(0, SAMPLE_RATE * MAX_SECONDS);
    } finally { void ctx.close(); }
  }

  /** 녹음한 것을 버린다 */
  cancel(): void {
    this.release();
    this.chunks = [];
    this.starting = null;
  }

  private release(): void {
    const recorder = this.recorder;
    if (recorder) { recorder.ondataavailable = null; recorder.onstop = null; if (recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* 이미 멈춤 */ } } }
    this.stream?.getTracks().forEach(t => t.stop());
    this.recorder = null; this.stream = null;
  }
}
