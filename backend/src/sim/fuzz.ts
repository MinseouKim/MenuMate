// 오프라인 서버 검사 시험 (2026-11-03 팀장 요청: Gemini 키가 안 되면 API 키 없이도 시험을 계속).
// 직원 LLM 자리에 "일부러 실수하는 가짜 LLM"을 넣고 진짜 converse()(서버 검사 포함)를 통과시킨 뒤 채점한다.
// 목적은 "서버 검사가 LLM 실수를 모두 막는가". 실수 종류별 통과율이 1보다 낮으면 그 실수는 서버 검사를 빠져나간 것이다.
import { askedExclude, askedKind, converse, excludeFromSpeech, excludeMentioned, GREETING, partyMentioned, SEAFOOD, wantsAnything, type LlmClient } from '../chat.js';
import type { KnowledgeMenu, MenuKnowledge } from '../menuKnowledge.js';
import { scriptedCustomer } from './customer.js';
import { PERSONA_SEED, type Persona } from './personas.js';
import { runPersona } from './run.js';
import { scoreConversation } from './score.js';

export const FUZZ_MISTAKES = [
  'early-done',      // 인원·재료·종류를 다 알기 전에 done (매 턴)
  'question-done',   // 추천하면서 질문으로 끝남
  'long-done',       // 60자 넘는 추천 답
  'wrong-party',     // 조건의 party를 틀리게 (손님 말 + 1)
  'excluded-pick',   // 손님이 뺀 재료가 든 메뉴를 1순위로
  'spicy-pick',      // 안 맵게인데 매운 메뉴를 1순위로
  'ghost-id',        // 없는 메뉴 id를 1순위로
  'missing-exclude', // 손님이 말한 재료를 exclude에서 빠뜨리고 그 재료 메뉴도 고름
  'missing-asking',  // 질문하면서 asking을 빠뜨림
  'share-single',    // 1인분 메뉴를 "나눠 먹기"로 소개 (why·reply)
] as const;
export type FuzzMistake = (typeof FUZZ_MISTAKES)[number];
/** 손님 번호마다 실수 종류를 차례로 돌려 고르게 섞는다 */
export const mistakeFor = (index: number): FuzzMistake => FUZZ_MISTAKES[((index % FUZZ_MISTAKES.length) + FUZZ_MISTAKES.length) % FUZZ_MISTAKES.length];

const QUESTIONS = {
  party: '몇 분이서 드실 건가요?',
  spicy: '매운 음식도 잘 드시나요?',
  exclude: '못 드시는 재료 있으세요?',
  kind: '면, 밥, 딤섬 중에 어떤 종류가 좋으세요?',
} as const;
const KIND_HINTS: [string, RegExp][] = [['면', /(?<![가-힣])면|국수|짜장|짬뽕/], ['밥', /밥/], ['딤섬', /딤섬|만두/], ['스프/탕', /국물|스프|탕(?!수)/]];

function spicyOf(text: string): number | null {
  if (!/매|맵/.test(text)) return null;
  if (/못\s*먹|안\s*매|안\s*맵|순한/.test(text)) return 0;
  if (/조금|약간|살짝/.test(text)) return 1;
  if (/좋아|잘\s*먹|아주/.test(text)) return 2;
  return null;
}

function excludedSet(exclude: string[]): string[] {
  const out = exclude.flatMap((x) => (x === '해산물' ? SEAFOOD : [x]));
  if (out.some((x) => SEAFOOD.includes(x))) out.push('해산물');
  return out;
}

/** 실수 없는 기준 직원: 대화에서 들은 것만으로 다음 질문(인원 → 매운맛 → 재료 → 종류)을 고르고, 다 알면 조건에 맞는 메뉴를 고른다 */
function honest(knowledge: MenuKnowledge, userTexts: string[], asked: string[], seed: number) {
  const party = userTexts.map(partyMentioned).filter((n): n is number => n !== null).at(-1) ?? null;
  const spicy = userTexts.map(spicyOf).filter((n): n is number => n !== null).at(-1) ?? null;
  const exclude = [...new Set(userTexts.flatMap(excludeFromSpeech))];
  const kind = userTexts.map((t) => KIND_HINTS.find(([k, re]) => knowledge.kinds.includes(k) && re.test(t))?.[0]).filter((k): k is string => !!k).at(-1) ?? '상관없음';
  const spicyKnown = spicy !== null || asked.some((t) => /매운|맵/.test(t));
  const excludeKnown = exclude.length > 0 || userTexts.some(excludeMentioned) || asked.some(askedExclude);
  const kindKnown = kind !== '상관없음' || userTexts.some(wantsAnything) || asked.some(askedKind);
  const next: keyof typeof QUESTIONS | null = party === null ? 'party' : !spicyKnown ? 'spicy' : !excludeKnown ? 'exclude' : !kindKnown ? 'kind' : null;
  const conditions = { party: party ?? 1, spicy, kind, texture: '상관없음', exclude, budget: null, totalBudget: null };
  // 빼는 재료가 있으면 재료가 확인 안 된 메뉴도 고르지 않음 (서버 checkPicks와 같은 규칙)
  const fits = (m: KnowledgeMenu, ex: string[]) => !m.soldOut && !m.ingredients.some((i) => ex.includes(i)) && !(ex.length && m.ingredients.length === 0 && !m.ingredientsChecked) && !(spicy === 0 && m.spicy > 0);
  const choose = (ex: string[]) => {
    // 손님마다 다른 메뉴가 나오게 메뉴 순서를 seed만큼 돌린다 (늘 앞쪽의 순한 메뉴만 고르면 매운맛 구멍이 안 보임)
    const k = knowledge.menus.length ? seed % knowledge.menus.length : 0;
    const ok = [...knowledge.menus.slice(k), ...knowledge.menus.slice(0, k)].filter((m) => fits(m, ex));
    const sameKind = ok.filter((m) => kind === '상관없음' || m.kind === kind);
    return (sameKind.length ? sameKind : ok).slice(0, 3);
  };
  const excluded = excludedSet(exclude);
  /** 조건에 맞는 1인분 메뉴 하나 (share-single 실수용) */
  const single = () => knowledge.menus.find((m) => m.servingPeople <= 1 && fits(m, excluded));
  return { next, conditions, choose, single, excluded, spicy };
}

/**
 * 일부러 실수하는 가짜 직원 LLM (mistake=null이면 실수 없는 기준 직원). 받은 대화만 보고 답 JSON을 만든다. seed: 메뉴 고르는 순서.
 * skipped: 손님 조건 때문에 실수를 넣지 못한 까닭 (share-single인데 조건에 맞는 1인분 메뉴가 없음). 그때는 실수 없이 답한다 — 통과로 세면 서버 검사를 시험한 셈이 아니므로
 */
export function fuzzLlm(knowledge: MenuKnowledge, mistake: FuzzMistake | null, seed = 0): LlmClient & { skipped: string | null } {
  return {
    skipped: null,
    model: 'offline-fuzz',
    async generateJson(_system, messages) {
      const talk = messages.filter((m) => !m.text.startsWith('[지금까지'));
      const userTexts = talk.filter((m) => m.role === 'user').map((m) => m.text);
      const asked = talk.filter((m) => m.role === 'model').map((m) => m.text);
      const h = honest(knowledge, userTexts, asked, seed);
      const conditions = { ...h.conditions };
      if (mistake === 'wrong-party') conditions.party = h.conditions.party + 1;
      if (mistake === 'missing-exclude') conditions.exclude = [];
      const done = h.next === null || mistake === 'early-done';
      if (!done) {
        const out: Record<string, unknown> = { reply: QUESTIONS[h.next!], conditions, mood: null, picks: [], done: false, asking: h.next };
        if (mistake === 'missing-asking') delete out.asking;
        return JSON.stringify(out);
      }
      let menus: { id: string; name: string }[] = h.choose(mistake === 'missing-exclude' ? [] : h.excluded);
      const first = (m: KnowledgeMenu | undefined) => { if (m) menus = [{ id: m.id, name: m.name }, ...menus.filter((x) => x.id !== m.id)].slice(0, 3); };
      if (mistake === 'excluded-pick') first(knowledge.menus.find((m) => m.ingredients.some((i) => h.excluded.includes(i))));
      if (mistake === 'spicy-pick') first(knowledge.menus.find((m) => m.spicy > 0));
      if (mistake === 'ghost-id') menus = [{ id: 'ghost-404', name: '없는 메뉴' }, ...menus].slice(0, 3);
      let share = mistake === 'share-single';
      if (share) {
        const single = h.choose(h.excluded).find((m) => m.servingPeople <= 1) ?? h.single();
        if (single) first(single);
        else { share = false; this.skipped = 'share-single: 손님 조건에 맞는 1인분 메뉴가 없어 실수를 넣지 못함'; }
      }
      const name = menus[0]?.name ?? '추천 메뉴';
      const reply = share ? `둘이 나눠 먹기 좋은 ${name} 골라 봤어요.`
        : mistake === 'question-done' ? `${name} 어떠세요?`
        : mistake === 'long-done' ? `말씀 잘 들었습니다. 오늘 같은 날 일행분들과 함께 편안하게 나눠 드시기 정말 좋은 ${name}를 정성껏 골라 봤어요. 천천히 보시고 마음에 드시면 담아 주세요.`
          : `말씀 듣고 ${name} 골라 봤어요.`;
      const why = share ? '둘이 나눠 먹기 좋은 메뉴예요' : '말씀하신 조건에 맞아요';
      return JSON.stringify({ reply, conditions, mood: null, picks: menus.map((m) => ({ id: m.id, why, heard: null })), done: true, asking: 'other' });
    },
  };
}

/** 손님 한 명을 오프라인으로: 손님 = 예시 답변(scriptedCustomer), 직원 = fuzz LLM + 진짜 converse(). 요청 간격 없이 바로 */
export async function runOffline(opts: { persona: Persona; index: number; knowledge: MenuKnowledge; at?: string }) {
  const { persona, index, knowledge } = opts;
  const mistake = mistakeFor(index);
  const llm = fuzzLlm(knowledge, mistake, index);
  const rec = await runPersona({
    persona, greeting: GREETING, customer: scriptedCustomer(knowledge, PERSONA_SEED),
    staff: (turns, conditions) => converse({ llm, knowledge }, { turns, conditions, context: {} }),
  });
  const score = scoreConversation(rec, knowledge);
  // 실수를 못 넣은 대화는 그 실수로 세지 않는다 (fuzz 없음 → 요약의 실수별 통과율에서 빠짐). 까닭은 fuzzSkipped에 남김
  return { at: opts.at ?? new Date().toISOString(), model: 'offline-fuzz', mode: 'offline-fuzz' as const, customer: 'script', fuzz: llm.skipped ? null : mistake, ...(llm.skipped ? { fuzzSkipped: llm.skipped } : {}), ...rec, score };
}
