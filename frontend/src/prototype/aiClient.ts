// 서버의 AI 조건 추출(POST /api/condition-extraction)을 부릅니다. API 키는 서버 .env에만 있습니다.
// 서버 주소가 없거나, 늦거나, LLM이 아닌 규칙으로 답하면 null을 돌려주고 화면 쪽 규칙 해석을 그대로 씁니다.
import type { Conditions } from './types';
import { KIND_OPTIONS } from './recommendation';

interface ServerConditions { party_size: number; spicy_level: 0 | 1 | 2 | 3 | null; budget_per_person: number | null; excluded_ingredients: string[]; food_keywords: string[] }
const TIMEOUT_MS = 4000;

export async function extractWithServer(text: string): Promise<ServerConditions | null> {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) return null;
  const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/condition-extraction`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ utterance: text }), signal: abort.signal });
    if (!res.ok) return null;
    const body = await res.json() as { conditions?: ServerConditions; source?: string };
    return body.source === 'llm' && body.conditions ? body.conditions : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// LLM 결과를 화면 조건에 합칩니다. 인원·맵기·예산은 LLM 값을 쓰고, 제외 재료는 양쪽을 합쳐 놓치지 않게 합니다.
export function mergeConditions(local: Conditions, ai: ServerConditions): Conditions {
  const kind = KIND_OPTIONS.find(k => ai.food_keywords.some(w => k.includes(w) || w.includes(k))) ?? local.kind;
  return {
    ...local,
    party: Math.min(6, Math.max(1, ai.party_size || local.party)),
    spicy: ai.spicy_level ?? local.spicy,
    budget: local.totalBudget ? local.budget : ai.budget_per_person ?? local.budget,
    exclude: [...new Set([...local.exclude, ...ai.excluded_ingredients])],
    kind,
  };
}
