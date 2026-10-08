// [AI 담당] 음성 → 텍스트(STT), 텍스트 → 음성(TTS)
// STT: 크롬 내장 Web Speech API (무료). 인터넷이 필요하고 음성이 구글 서버로 전송된다.
// TTS: 브라우저 내장 speechSynthesis (무료, 오프라인 가능)

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const sttSupported = !!SR;

const ERROR_TEXT = {
  'no-speech': '말씀이 들리지 않았어요. 버튼을 누른 채로 말씀해 주세요.',
  'audio-capture': '마이크를 찾을 수 없어요.',
  'not-allowed': '마이크 사용이 허용되지 않았어요.',
  network: '인터넷 연결이 없어 음성 인식을 쓸 수 없어요. 화면에서 직접 골라 주세요.'
};

/**
 * Push-to-talk: 버튼을 누르고 있는 동안만 듣는다.
 *   const ptt = createPushToTalk({ onInterim, onFinal, onError, onTooShort, onEnd });
 *   버튼 누름 → ptt.press(),  손 뗌 → ptt.release()
 * 손을 뗀 뒤 0.5초 더 들어서 말끝이 잘리지 않게 한다.
 */
export function createPushToTalk(handlers = {}) {
  const {
    onInterim = () => {}, onFinal = () => {}, onError = () => {},
    onTooShort = () => {}, onEnd = () => {}
  } = handlers;
  const TAIL_MS = 500;      // 손 뗀 뒤 더 듣는 시간
  const MIN_HOLD_MS = 400;  // 이보다 짧게 누르면 '누른 채로 말하세요' 안내

  let rec = null;
  let pressedAt = 0;
  let finalText = '';
  let cancelled = false;
  let stopTimer = null;

  function press() {
    if (!SR) { onError('unsupported', '이 브라우저는 음성 인식을 지원하지 않아요. 크롬을 사용해 주세요.'); return; }
    if (rec) return;
    if ('speechSynthesis' in window) speechSynthesis.cancel(); // 안내 음성이 마이크에 들어가지 않게
    clearTimeout(stopTimer);
    pressedAt = Date.now();
    finalText = '';
    cancelled = false;
    rec = new SR();
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = true;      // 누르고 있는 동안 계속
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onInterim((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      if (e.error === 'no-speech' && cancelled) return;
      cancelled = true;
      onError(e.error, ERROR_TEXT[e.error] || '음성 인식에 문제가 생겼어요.');
    };
    rec.onend = () => {
      const text = finalText.trim();
      rec = null;
      if (!cancelled && text) onFinal(text);
      onEnd();
    };
    try { rec.start(); } catch { /* 이미 시작됨 */ }
  }

  function release() {
    if (!rec) return;
    if (Date.now() - pressedAt < MIN_HOLD_MS) {
      cancelled = true;
      rec.abort();
      onTooShort();
      return;
    }
    const r = rec;
    stopTimer = setTimeout(() => r.stop(), TAIL_MS);
  }

  return { press, release, get active() { return !!rec; } };
}

let koVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  koVoice = voices.find((v) => v.lang === 'ko-KR' && /google|neural|online/i.test(v.name))
    || voices.find((v) => v.lang.startsWith('ko')) || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

let muted = false;
export function setMuted(v) { muted = v; if (v) speechSynthesis.cancel(); }

export function speak(text, { rate = 1 } = {}) {
  if (muted || !('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = rate;
  if (koVoice) u.voice = koVoice;
  speechSynthesis.speak(u);
}
