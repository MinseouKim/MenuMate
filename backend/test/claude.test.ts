import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeClient, toClaudeSchema } from '../src/claude.js';
import { loadConfig } from '../src/config.js';
import { createLlm } from '../src/llm.js';

describe('toClaudeSchema', () => {
  it('Claude 구조화 출력 규칙에 맞게 바꾼다: 모든 객체에 additionalProperties:false, 타입 배열은 anyOf', () => {
    const input = {
      type: 'object',
      properties: {
        a: { type: ['integer', 'null'] },
        m: { type: ['string', 'null'], enum: ['x', 'y', null] },
        o: { type: 'object', properties: { s: { type: 'string' } }, required: ['s'] },
        l: { type: 'array', items: { type: 'object', properties: { n: { type: 'number' } } } },
      },
      required: ['a'],
    };
    const before = JSON.stringify(input);
    expect(toClaudeSchema(input)).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        a: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
        m: { anyOf: [{ type: 'string', enum: ['x', 'y'] }, { type: 'null' }] },
        o: { type: 'object', additionalProperties: false, properties: { s: { type: 'string' } }, required: ['s'] },
        l: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { n: { type: 'number' } } } },
      },
      required: ['a'],
    });
    expect(JSON.stringify(input)).toBe(before); // Gemini가 쓰는 원본은 그대로
  });
});

/** Claude API 서버 자리에 서는 가짜 fetch. SDK가 실제로 보낸 요청을 기록합니다. */
function fakeApi(message: Record<string, unknown>) {
  const sent: { url: string; headers: Headers; body: any }[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    sent.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }, ...message,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { sent, fetchImpl };
}
const answer = (text: string, stop_reason = 'end_turn') => ({
  stop_reason,
  content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text }],
});
const schema = { type: 'object', properties: { reply: { type: 'string' }, spicy: { type: ['integer', 'null'] } }, required: ['reply', 'spicy'] };

describe('claudeClient', () => {
  it('요청: 첫 메시지는 손님 차례로 맞추고, 고정 지시문만 캐시, JSON 형식 강제, temperature 없음', async () => {
    const api = fakeApi(answer('{"reply":"몇 분이세요?","spicy":null}'));
    const llm = claudeClient({ apiKey: 'sk-test', model: 'claude-opus-5-5', fetchImpl: api.fetchImpl });
    const text = await llm.generateJson(
      ['규칙과 메뉴 목록', '지금 상황: 저녁'],
      [{ role: 'model', text: '어서 오세요! 몇 분이세요?' }, { role: 'user', text: '둘이요' }],
      schema,
      new AbortController().signal,
    );

    expect(text).toBe('{"reply":"몇 분이세요?","spicy":null}'); // 생각(thinking) 블록은 건너뛰고 답만
    const { body, headers } = api.sent[0];
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(body.messages[1].content).toBe('어서 오세요! 몇 분이세요?');
    expect(body.system).toEqual([
      { type: 'text', text: '규칙과 메뉴 목록', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: '지금 상황: 저녁' },
    ]);
    expect(body.output_config).toEqual({ effort: 'low', format: { type: 'json_schema', schema: toClaudeSchema(schema) } });
    expect(body).not.toHaveProperty('temperature');
    expect(body.fallbacks).toBe('default');
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(headers.get('authorization')).toBe('Bearer sk-test'); // SDK 1.x는 키를 Bearer로 보낸다
  });

  it('Haiku는 서버 쪽 대체 실행(fallbacks)이 없어 보내지 않는다', async () => {
    const api = fakeApi(answer('{}'));
    await claudeClient({ apiKey: 'sk-test', model: 'claude-haiku-5-5', fetchImpl: api.fetchImpl })
      .generateJson(['s'], [{ role: 'user', text: 'hi' }], schema, new AbortController().signal);
    expect(api.sent[0].body).not.toHaveProperty('fallbacks');
    expect(api.sent[0].headers.get('anthropic-beta') ?? '').not.toContain('server-side-fallback');
  });

  it('거절(refusal)이면 답을 쓰지 않고 실패로 돌린다 (converse가 CHAT_UNAVAILABLE로 바꿈)', async () => {
    const api = fakeApi(answer('', 'refusal'));
    const llm = claudeClient({ apiKey: 'sk-test', model: 'claude-opus-5-5', fetchImpl: api.fetchImpl });
    await expect(llm.generateJson(['s'], [{ role: 'user', text: 'hi' }], schema, new AbortController().signal)).rejects.toThrow(/refusal/);
  });

  it('중단 신호(25초 제한)를 SDK 요청에 넘긴다', async () => {
    const api = fakeApi(answer('{}'));
    const abort = new AbortController();
    abort.abort();
    const llm = claudeClient({ apiKey: 'sk-test', model: 'claude-opus-5-5', fetchImpl: api.fetchImpl });
    await expect(llm.generateJson(['s'], [{ role: 'user', text: 'hi' }], schema, abort.signal)).rejects.toThrow();
    expect(api.sent).toHaveLength(0);
  });
});

describe('createLlm', () => {
  const base = path.resolve('/srv/menumate/backend');
  it('LLM_PROVIDER에 따라 Gemini 또는 Claude, 키가 없으면 null(대화는 503)', () => {
    expect(createLlm(loadConfig({}, base))).toBeNull();
    expect(createLlm(loadConfig({ GEMINI_API_KEY: 'g' }, base))?.model).toBe('gemini-3.5-flash-lite');
    expect(createLlm(loadConfig({ LLM_PROVIDER: 'claude', GEMINI_API_KEY: 'g' }, base))).toBeNull();
    expect(createLlm(loadConfig({ LLM_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'sk' }, base))?.model).toBe('claude-opus-5-5');
    expect(createLlm(loadConfig({ LLM_PROVIDER: 'claude', ANTHROPIC_FEDERATION_RULE_ID: 'fdrl_1', CLAUDE_MODEL: 'claude-sonnet-5-5' }, base))?.model).toBe('claude-sonnet-5-5');
  });
});
