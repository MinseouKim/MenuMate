// [AI 담당] 음성 → 텍스트(STT), 텍스트 → 음성(TTS)
// STT: 크롬 내장 Web Speech API (무료). 인터넷이 필요하고 음성이 구글 서버로 전송된다.
// TTS: 브라우저 내장 speechSynthesis (무료, 오프라인 가능)

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const sttSupported = !!SR;

const ERROR_TEXT = {
  'no-speech': '말씀이 들리지 않았어요. 버튼을 누르고 다시 말씀해 주세요.',
  'audio-capture': '마이크를 찾을 수 없어요.',
  'not-allowed': '마이크 사용이 허용되지 않았어요.',
  network: '인터넷 연결이 없어 음성 인식을 쓸 수 없어요. 화면에서 직접 골라 주세요.'
};

export const PTT_TIMING = {
  TAP_MS: 400,          // 이보다 짧게 누르면 '켜고 끄기' 방식으로 전환
  TAIL_MS: 500,         // 손 뗀 뒤 더 듣는 시간 (말끝 잘림 방지)
  SILENCE_MS: 2500,     // 켜고 끄기 방식: 말이 끝나고 이만큼 조용하면 자동 종료
  MAX_MS: 15000         // 켜고 끄기 방식: 최대 듣는 시간
};

/**
 * Push-to-talk, 두 방식을 모두 지원한다.
 *  - 꾹 누르기: 누르고 있는 동안 듣고, 손을 떼면 끝 (일반 고객)
 *  - 짧게 누르기: 한 번 누르면 듣기 시작, 다시 누르거나 말이 끝나면 자동으로 끝
 *    (버튼을 계속 누르고 있기 힘든 고령층)
 *
 *   const ptt = createPushToTalk({ onStart, onLatched, onInterim, onFinal, onError, onEnd });
 *   pointerdown → ptt.press(e.timeStamp),  pointerup / pointercancel → ptt.release(e.timeStamp)
 */
export function createPushToTalk(handlers = {}) {
  const {
    onStart = () => {}, onLatched = () => {}, onInterim = () => {},
    onFinal = () => {}, onError = () => {}, onEnd = () => {}
  } = handlers;
  const { TAP_MS, TAIL_MS, SILENCE_MS, MAX_MS } = PTT_TIMING;

  let rec = null;
  let pressedAt = 0;
  let finalText = '';
  let cancelled = false;
  let latched = false;      // 짧게 눌러 켜진 상태
  let holding = false;
  let timers = [];
  let silenceTimer = null;

  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; clearTimeout(silenceTimer); };
  const finish = () => { clearTimers(); if (rec) { try { rec.stop(); } catch { /* 이미 멈춤 */ } } };

  // at: 입력 이벤트의 timeStamp (e.timeStamp). 화면이 바빠 처리가 늦어도 실제로 누른 시간으로 판단한다
  function press(at = performance.now()) {
    if (!SR) { onError('unsupported', '이 브라우저는 음성 인식을 지원하지 않아요. 크롬을 사용해 주세요.'); return; }
    if (rec && latched) { finish(); return; } // 켜고 끄기 방식에서 두 번째 누름 = 끝
    if (rec) return;
    if ('speechSynthesis' in window) speechSynthesis.cancel(); // 안내 음성이 마이크에 들어가지 않게
    clearTimers();
    pressedAt = at;
    finalText = '';
    cancelled = false;
    latched = false;
    holding = true;
    onStart();
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
      // 켜고 끄기 방식: 말이 멈추면 잠시 뒤 자동 종료 (다시 누르는 걸 잊어도 됨)
      if (latched) {
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(finish, SILENCE_MS);
      }
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
      latched = false;
      clearTimers();
      if (!cancelled && text) onFinal(text);
      else if (!cancelled && !text) onError('no-speech', ERROR_TEXT['no-speech']);
      onEnd();
    };
    try { rec.start(); } catch { /* 이미 시작됨 */ }
  }

  function release(at = performance.now()) {
    if (!rec || !holding) return;
    holding = false;
    if (at - pressedAt < TAP_MS) {
      // 짧게 눌렀다 → 계속 듣는다 (켜고 끄기 방식)
      latched = true;
      onLatched();
      timers.push(setTimeout(finish, MAX_MS));
      silenceTimer = setTimeout(finish, SILENCE_MS * 3); // 아무 말도 없으면 7.5초 뒤 종료
      return;
    }
    timers.push(setTimeout(finish, TAIL_MS));
  }

  // 화면 이동 등으로 듣기를 취소할 때
  function cancel() {
    if (!rec) return;
    cancelled = true;
    clearTimers();
    try { rec.abort(); } catch { /* 이미 멈춤 */ }
  }

  return { press, release, cancel, get active() { return !!rec; }, get latched() { return latched; } };
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
