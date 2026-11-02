// 대화형 추천을 Claude API로 돌릴 때의 LlmClient (LLM_PROVIDER=claude). Gemini와 같은 계약이라 대화 로직은 그대로다.
// 인증: ANTHROPIC_API_KEY. 나중에 Render Pro의 ID 페더레이션으로 바꾸면 키 없이 SDK가 환경 변수에서 알아서 찾는다.
import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient } from './chat.js';
import type { ClaudeEffort } from './config.js';

type Schema = Record<string, unknown>;

/**
 * Gemini용 JSON 스키마를 Claude 구조화 출력 규칙에 맞게 바꾼다 (원본은 건드리지 않음).
 * - 모든 객체에 additionalProperties:false (Claude 필수)
 * - type: ['integer', 'null'] 같은 타입 배열 → anyOf (Claude 지원 목록에 없는 표기)
 */
export function toClaudeSchema(schema: Schema): Schema {
  const { type, enum: values, properties, items, ...rest } = schema;
  if (Array.isArray(type)) {
    return {
      anyOf: type.map((t) => {
        const own = Array.isArray(values) ? values.filter((v) => (t === 'null' ? v === null : v !== null)) : null;
        return toClaudeSchema({ ...rest, type: t, ...(own && t !== 'null' ? { enum: own } : {}), ...(properties ? { properties } : {}), ...(items ? { items } : {}) });
      }),
    };
  }
  const out: Schema = { type, ...rest };
  if (values !== undefined) out.enum = values;
  if (type === 'object') {
    out.additionalProperties = false;
    if (properties) out.properties = Object.fromEntries(Object.entries(properties as Record<string, Schema>).map(([k, v]) => [k, toClaudeSchema(v)]));
  }
  if (items) out.items = toClaudeSchema(items as Schema);
  return out;
}

// Haiku는 거절됐을 때 서버가 다른 모델로 다시 돌리는 기능(fallbacks)이 없다.
const hasFallback = (model: string) => !model.includes('haiku');

export function claudeClient(opts: { model: string; effort: ClaudeEffort; apiKey?: string | null; fetchImpl?: typeof fetch }): LlmClient {
  const client = new Anthropic({ apiKey: opts.apiKey ?? undefined, ...(opts.fetchImpl ? { fetch: opts.fetchImpl } : {}) });
  const { model } = opts;
  return {
    model,
    async generateJson(system, messages, schema, signal) {
      // Claude는 첫 메시지가 손님(user)이어야 한다. 우리 기록은 직원 인사로 시작하므로 시작 신호를 앞에 붙인다.
      const turns = messages[0]?.role === 'model' ? [{ role: 'user' as const, text: '[대화 시작]' }, ...messages] : messages;
      const res = await client.beta.messages.create(
        {
          model,
          max_tokens: 16000,
          ...(hasFallback(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          output_config: { effort: opts.effort, format: { type: 'json_schema', schema: toClaudeSchema(schema as Schema) } },
          system: system.map((text, i) => (i === 0 ? { type: 'text' as const, text, cache_control: { type: 'ephemeral' as const } } : { type: 'text' as const, text })),
          messages: turns.map((m) => ({ role: m.role === 'model' ? ('assistant' as const) : ('user' as const), content: m.text })),
        },
        { signal },
      );
      if (res.stop_reason === 'refusal') throw new Error('Claude refusal');
      const block = res.content.find((b) => b.type === 'text');
      return block?.type === 'text' ? block.text : '';
    },
  };
}
