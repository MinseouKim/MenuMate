export interface SttCallbacks {
  onResult: (transcript: string) => void;
  onError: (reason: string) => void;
  onEnd: () => void;
}

/**
 * STT(음성 인식) 프로바이더 인터페이스. Push-to-talk 전용:
 * 버튼을 누르고 있는 동안 start(), 떼는 순간 stop()을 호출하는 식으로 쓴다.
 * 녹음 원문(오디오)은 어디에도 저장하지 않는다 — 브라우저 음성 인식 결과(텍스트)만 콜백으로 전달.
 */
export interface SttProvider {
  readonly name: string;
  isSupported(): boolean;
  start(callbacks: SttCallbacks): void;
  stop(): void;
}
