import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors.js';
import { createSynthesizer, type TtsFetch } from '../src/tts.js';

const audio = Buffer.from('ID3fake-mp3').toString('base64');
function fakeFetch(status = 200): { fetch: TtsFetch; calls: { url: string; body: any }[] } {
  const calls: { url: string; body: any }[] = [];
  const fetch: TtsFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: status === 200, status, json: async () => ({ audioContent: audio }), text: async () => 'denied' };
  };
  return { fetch, calls };
}

describe('createSynthesizer', () => {
  it('키가 없으면 available=false이고 TTS_UNAVAILABLE', async () => {
    const s = createSynthesizer({ apiKey: null, voice: 'ko-KR-Chirp3-HD-Leda', fetchImpl: fakeFetch().fetch });
    expect(s.available).toBe(false);
    await expect(s.speak('안녕하세요')).rejects.toMatchObject({ code: 'TTS_UNAVAILABLE', status: 503 });
  });

  it('Google TTS에 목소리·MP3로 요청하고 바이트를 돌려준다', async () => {
    const f = fakeFetch();
    const s = createSynthesizer({ apiKey: 'k', voice: 'ko-KR-Chirp3-HD-Leda', fetchImpl: f.fetch });
    const out = await s.speak('어서 오세요');
    expect(out.toString()).toBe('ID3fake-mp3');
    expect(f.calls[0].url).toContain('text:synthesize?key=k');
    expect(f.calls[0].body).toEqual({
      input: { text: '어서 오세요' },
      voice: { languageCode: 'ko-KR', name: 'ko-KR-Chirp3-HD-Leda' },
      audioConfig: { audioEncoding: 'MP3' },
    });
  });

  it('같은 문장은 캐시에서 준다', async () => {
    const f = fakeFetch();
    const s = createSynthesizer({ apiKey: 'k', voice: 'v', fetchImpl: f.fetch });
    await s.speak('반복');
    await s.speak(' 반복 ');
    expect(f.calls.length).toBe(1);
    expect(s.cacheHits).toBe(1);
  });

  it('키 거부(403)는 TTS_UNAVAILABLE', async () => {
    const warns: string[] = [];
    const s = createSynthesizer({ apiKey: 'k', voice: 'v', fetchImpl: fakeFetch(403).fetch, log: { warn: (m) => warns.push(m) } });
    await expect(s.speak('x')).rejects.toBeInstanceOf(AppError);
    expect(warns[0]).toContain('거부');
  });

  it('빈 문장·너무 긴 문장은 VALIDATION_FAILED', async () => {
    const s = createSynthesizer({ apiKey: 'k', voice: 'v', fetchImpl: fakeFetch().fetch });
    await expect(s.speak('   ')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(s.speak('가'.repeat(301))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
