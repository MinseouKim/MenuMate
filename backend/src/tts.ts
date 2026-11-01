// Google Cloud Text-to-Speech 프록시. 키는 서버에만 두고, 같은 문장은 메모리에 캐시해 비용을 아낀다.
import { createHash } from 'node:crypto';
import { AppError } from './errors.js';

export const TTS_MAX_CHARS = 300;
const ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

export type TtsFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface TtsOptions {
  apiKey: string | null;
  voice: string;
  fetchImpl: TtsFetch;
  cacheSize?: number;
  log?: { warn(msg: string): void };
}

export interface Synthesizer {
  readonly available: boolean;
  /** MP3 바이트. 키가 없거나 실패하면 AppError('TTS_UNAVAILABLE') */
  speak(text: string): Promise<Buffer>;
  /** 테스트·관측용 */
  readonly cacheHits: number;
}

export function createSynthesizer(opts: TtsOptions): Synthesizer {
  const cache = new Map<string, Buffer>();
  const max = opts.cacheSize ?? 200;
  let hits = 0;
  const lang = opts.voice.split('-').slice(0, 2).join('-') || 'ko-KR';

  return {
    available: Boolean(opts.apiKey),
    get cacheHits() {
      return hits;
    },
    async speak(raw) {
      const text = raw.trim();
      if (!text || text.length > TTS_MAX_CHARS) throw new AppError('VALIDATION_FAILED', 'tts text 길이');
      if (!opts.apiKey) throw new AppError('TTS_UNAVAILABLE', 'GOOGLE_TTS_API_KEY 없음');
      const key = createHash('sha1').update(`${opts.voice}\n${text}`).digest('hex');
      const hit = cache.get(key);
      if (hit) {
        hits++;
        // LRU: 최근 사용을 뒤로 보낸다
        cache.delete(key);
        cache.set(key, hit);
        return hit;
      }
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 8000);
      try {
        const res = await opts.fetchImpl(`${ENDPOINT}?key=${encodeURIComponent(opts.apiKey)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode: lang, name: opts.voice },
            audioConfig: { audioEncoding: 'MP3' },
          }),
          signal: abort.signal,
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          if (res.status === 401 || res.status === 403) {
            opts.log?.warn(`Google TTS가 API 키를 거부했어요 (${res.status}). Cloud 콘솔에서 Text-to-Speech API 활성화와 키 제한을 확인하거나 서비스 계정이 필요합니다.`);
          } else {
            opts.log?.warn(`Google TTS 오류 ${res.status}: ${detail.slice(0, 200)}`);
          }
          throw new AppError('TTS_UNAVAILABLE', `google tts ${res.status}`);
        }
        const body = (await res.json()) as { audioContent?: string };
        if (!body.audioContent) throw new AppError('TTS_UNAVAILABLE', 'audioContent 없음');
        const audio = Buffer.from(body.audioContent, 'base64');
        cache.set(key, audio);
        if (cache.size > max) cache.delete(cache.keys().next().value as string);
        return audio;
      } catch (e) {
        if (e instanceof AppError) throw e;
        opts.log?.warn(`Google TTS 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
        throw new AppError('TTS_UNAVAILABLE', 'fetch 실패');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
