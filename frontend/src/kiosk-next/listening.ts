// 핸즈프리 대화의 듣기 규칙 (2026-11-03 설계 4-1, Yum·프론트 합의). 화면·브라우저와 무관한 순수 함수라 따로 테스트합니다.

/** 이어 말할 것 같은 끝말 ("그리고", "음…") → 조금 더 기다림 */
const CONTINUING = /(그리고|그러니까|근데|그럼|저기|하고|랑|음+|어+)$/;
/** 말을 맺는 끝말 ("~요", "~주세요", "~니다") → 빨리 보냄 */
const FINISHED = /(요|니다)$/;

/**
 * 손님 말이 멈춘 뒤(마지막 중간 인식 결과 뒤) 몇 ms 조용하면 "다 말했다"고 볼지. 버튼을 다시 누르지 않아도 끝나게 합니다.
 * 브라우저 인식은 중간 결과가 0.2~0.4초 늦게 오므로 실제 침묵은 이보다 깁니다. 0.5초는 말 중간에 끊겨서 늘렸습니다 (2026-11-03 팀장 시험).
 */
export function endpointDelay(text: string, large = false): number {
  const t = text.trim().replace(/[.!?…~,\s]+$/, '');
  const base = CONTINUING.test(t) ? 1400 : FINISHED.test(t) ? 700 : 1000;
  return base + (large ? 500 : 0);
}

const norm = (s: string) => s.replace(/[\s.,!?…~'"“”‘’·]/g, '');

/** 말을 맺은 끝말 (인식기가 확정했을 때만 씀): "~요", "~다", "~까", "~죠", 인원 답 "~명" */
const COMPLETE = /(요|다|까|죠|명|분)$/;
/** 확정(final)된 말이 이만큼 짧으면("셋", "네", "혼자") 끝말과 관계없이 완결 답으로 봅니다 */
const SHORT_ANSWER = 4;
/**
 * 인식기가 들은 말을 모두 확정(final)했을 때 몇 ms 뒤 넘길지 (2026-11-03 팀장: "말이 끝나면 바로").
 * 말을 맺은 꼴이나 짧은 답이면 0.25초(큰 글씨 +0.2초), 이어질 꼴이거나 맺지 않은 긴 말이면 예전 끝말 대기(endpointDelay).
 */
export function finalDelay(text: string, large = false): number {
  const t = text.trim().replace(/[.!?…~,\s]+$/, '');
  if (!t || CONTINUING.test(t)) return endpointDelay(t, large);
  if (COMPLETE.test(t) || norm(t).length <= SHORT_ANSWER) return 250 + (large ? 200 : 0);
  return endpointDelay(t, large);
}

/**
 * 직원 음성이 나오는 동안 들린 말이 그 음성 자체(스피커 → 마이크)인지.
 * 지금 읽는 문장에 없는 글자가 2자(긴 말은 5분의 1)를 넘으면 손님 말로 봅니다. 브라우저가 메아리를 조금 잘못 알아들어도 견딥니다.
 */
export function isEcho(heard: string, speaking: string): boolean {
  const s = norm(speaking);
  if (!s) return false;
  const h = norm(heard);
  const allowed = Math.max(2, Math.floor(h.length / 5));
  let unmatched = 0;
  for (let i = 0; i < h.length;) {
    let len = 0;
    for (let l = h.length - i; l >= 2; l--) if (s.includes(h.slice(i, i + l))) { len = l; break; }
    if (len) i += len;
    else { unmatched++; i++; }
    if (unmatched > allowed) return false;
  }
  return true;
}

/** 끼어든 말 앞에 섞여 들어온 직원 문장 조각을 덜어 냅니다 ("몇 분이서 오셨어요 셋이요" → "셋이요"). */
export function stripEcho(text: string, spoken: string): string {
  const s = norm(spoken);
  const words = text.trim().split(/\s+/);
  let cut = 0;
  while (cut < words.length && s && s.includes(norm(words.slice(0, cut + 1).join('')))) cut++;
  return words.slice(cut).join(' ');
}

const SKIP = /[\s.,!?…~'"“”‘’·]/;
/**
 * 들은 말이 메아리 스냅샷(직원이 말하는 동안 들린 원문)으로 시작하면 그 뒤만 남깁니다. 띄어쓰기·문장부호는 무시합니다.
 * 스냅샷으로 시작하지 않으면(브라우저가 앞부분을 고쳐 들었으면) 그대로 돌려줍니다.
 */
export function dropPrefix(text: string, snapshot: string): string {
  const want = norm(snapshot);
  if (!want) return text.trim();
  let j = 0;
  let i = 0;
  for (; i < text.length && j < want.length; i++) {
    if (SKIP.test(text[i])) continue;
    if (text[i] !== want[j]) return text.trim();
    j++;
  }
  if (j < want.length) return text.trim();
  return text.slice(i).replace(/^[\s.,!?…~'"“”‘’·]+/, '').trim();
}
