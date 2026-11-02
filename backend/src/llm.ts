// 대화형 추천에 쓸 AI를 설정(LLM_PROVIDER)에 따라 고른다. 고른 쪽 인증이 없으면 null → /api/chat은 503.
import { geminiClient, type LlmClient } from './chat.js';
import { claudeClient } from './claude.js';
import type { Config } from './config.js';

export function createLlm(config: Config): LlmClient | null {
  if (config.llmProvider === 'claude') {
    if (!config.anthropicApiKey && !config.anthropicFederation) return null;
    return claudeClient({ model: config.claudeModel, effort: config.claudeEffort, apiKey: config.anthropicApiKey });
  }
  return config.geminiApiKey ? geminiClient(config.geminiApiKey, config.geminiModel, { thinking: config.geminiThinking }) : null;
}
