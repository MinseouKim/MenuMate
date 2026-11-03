import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDatabaseUrl } from '../src/env.js';
import { loadConfig } from '../src/config.js';

const base = path.resolve('/x/backend');
const slash = (p: string) => p.split(path.sep).join('/');

describe('resolveDatabaseUrl', () => {
  it('SQLite 상대 경로를 backend 폴더 기준 절대 경로로 바꾼다', () => {
    expect(resolveDatabaseUrl('file:./data/menumate.db', base)).toBe(
      `file:${slash(path.join(base, 'data', 'menumate.db'))}`,
    );
  });

  it('절대 경로와 PostgreSQL URL은 그대로 둔다', () => {
    const abs = `file:${slash(path.resolve('/abs/a.db'))}`;
    expect(resolveDatabaseUrl(abs, base)).toBe(abs);
    expect(resolveDatabaseUrl('postgresql://u:p@h:5432/db', base)).toBe('postgresql://u:p@h:5432/db');
  });
});

describe('loadConfig', () => {
  it('값이 없으면 env-guide 기본값을 쓴다', () => {
    const c = loadConfig({}, base);
    expect(c.port).toBe(4000);
    expect(c.host).toBe('127.0.0.1');
    expect(c.databaseUrl).toBe(`file:${slash(path.join(base, 'data', 'menumate.db'))}`);
    expect(c.menuSeedFile).toBe(path.join(base, 'seed', 'menu.dummy.json'));
    expect(c.menuImageDir).toBe(path.join(base, 'seed', 'menu-images'));
    expect(c.modelDir).toBe(path.resolve(base, '..', 'ai', 'models'));
    expect(c.frontendDist).toBe(path.resolve(base, '..', 'frontend', 'dist'));
    expect(c.paymentMode).toBe('simulate');
    expect(c.paymentSimResult).toBe('success');
    expect(c.paymentSimDelayMs).toBe(1500);
    expect(c.engineFile).toBe(path.join(base, 'engine', 'menu-features.json'));
  });

  it('env 값을 읽는다', () => {
    const c = loadConfig({ PORT: '4100', PAYMENT_SIM_RESULT: 'fail', PAYMENT_SIM_DELAY_MS: '0' }, base);
    expect(c.port).toBe(4100);
    expect(c.paymentSimResult).toBe('fail');
    expect(c.paymentSimDelayMs).toBe(0);
  });

  it('대화 AI는 기본 Gemini, LLM_PROVIDER=claude면 Claude 키·모델을 읽는다', () => {
    expect(loadConfig({}, base)).toMatchObject({ llmProvider: 'gemini', anthropicApiKey: null, claudeModel: 'claude-sonnet-5-5', claudeEffort: 'medium', anthropicFederation: false });
    expect(loadConfig({ LLM_PROVIDER: 'claude', ANTHROPIC_API_KEY: ' sk-x ', CLAUDE_MODEL: 'claude-haiku-5-5', CLAUDE_EFFORT: 'low' }, base))
      .toMatchObject({ llmProvider: 'claude', anthropicApiKey: 'sk-x', claudeModel: 'claude-haiku-5-5', claudeEffort: 'low' });
    expect(loadConfig({ ANTHROPIC_FEDERATION_RULE_ID: 'fdrl_1' }, base).anthropicFederation).toBe(true);
    expect(() => loadConfig({ LLM_PROVIDER: 'openai' }, base)).toThrow(/LLM_PROVIDER/);
    expect(() => loadConfig({ CLAUDE_EFFORT: 'mid' }, base)).toThrow(/CLAUDE_EFFORT/);
    // Gemini 생각 깊이: 비우면 보내지 않음(모델 기본), 값은 실측하며 고른다
    expect(loadConfig({}, base).geminiThinking).toBeNull();
    expect(loadConfig({ GEMINI_THINKING: 'minimal' }, base).geminiThinking).toBe('minimal');
    expect(() => loadConfig({ GEMINI_THINKING: 'off' }, base)).toThrow(/GEMINI_THINKING/);
  });

  it('잘못된 값이면 서버를 띄우기 전에 알려 준다', () => {
    expect(() => loadConfig({ PAYMENT_SIM_RESULT: 'maybe' }, base)).toThrow(/PAYMENT_SIM_RESULT/);
    expect(() => loadConfig({ PAYMENT_MODE: 'pg' }, base)).toThrow(/PAYMENT_MODE/);
    expect(() => loadConfig({ PORT: 'abc' }, base)).toThrow(/PORT/);
  });
});
