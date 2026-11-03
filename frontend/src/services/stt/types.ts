export interface SttCallbacks {
  /** 듣기를 끝냈을 때 들은 문장 전체를 한 번 넘깁니다. */
  onResult: (transcript: string) => void;
  /**
   * 말하는 중간에 지금까지 들은 문장을 넘깁니다(화면에 보여 주기용).
   * final: 들은 말이 모두 인식기에서 확정됐는지(아직 말하는 중인 조각이 없음). 핸즈프리가 말끝을 빨리 판단할 때 씁니다.
   */
  onInterim?: (transcript: string, final?: boolean) => void;
  /** code: 브라우저 음성 인식 오류 코드(network 등). 대체 수단으로 넘길지 판단하는 데 쓴다. */
  onError: (reason: string, code?: string) => void;
  onEnd: () => void;
}

/**
 * STT(음성 인식) 프로바이더 인터페이스. 누르면 시작·다시 누르면 끝:
 * 첫 번째 누름에 start(), 두 번째 누름에 stop()을 호출한다.
 * 녹음 원문(오디오)은 어디에도 저장하지 않는다 — 브라우저 음성 인식 결과(텍스트)만 콜백으로 전달.
 */
export interface SttProvider {
  readonly name: string;
  isSupported(): boolean;
  start(callbacks: SttCallbacks): void;
  stop(): void;
}
