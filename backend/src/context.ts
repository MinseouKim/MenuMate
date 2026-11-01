// 상황 인식: 시간대(매장 로컬), 날씨(Open-Meteo, 키 불필요), 혼잡도(최근 결제 완료 주문 수)
import type { PrismaClient } from '@prisma/client';
import type { ContextResponse, Crowd, TimeOfDay, WeatherNow } from './contracts.js';

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function timeOfDay(hour: number): TimeOfDay {
  if (hour < 6) return 'night';
  if (hour < 11) return 'morning';
  if (hour < 14) return 'lunch';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

/** WMO 날씨 해석 코드 → 손님에게 읽어 줄 짧은 한국어 */
export function weatherLabel(code: number): string {
  if (code === 0) return '맑음';
  if (code <= 2) return '구름 조금';
  if (code === 3) return '흐림';
  if (code === 45 || code === 48) return '안개';
  if (code >= 51 && code <= 57) return '이슬비';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return '비';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '눈';
  if (code >= 95) return '천둥번개';
  return '흐림';
}

export function toWeather(tempC: number, code: number): WeatherNow {
  const label = weatherLabel(code);
  return {
    tempC,
    code,
    label,
    rainy: label === '비' || label === '이슬비' || label === '천둥번개' || label === '눈',
    cold: tempC <= 8,
    hot: tempC >= 28,
  };
}

export function crowdLevel(recentOrders: number): Crowd {
  if (recentOrders <= 1) return 'low';
  if (recentOrders <= 4) return 'mid';
  return 'high';
}

export interface WeatherSource {
  /** 현재 날씨. 실패하면 null (서버는 계속 동작) */
  current(): Promise<WeatherNow | null>;
}

/** Open-Meteo를 10분 캐시로 읽는다. fetch는 테스트에서 바꾼다. */
export function openMeteo(lat: number, lon: number, fetchImpl: FetchLike, cacheMs = 10 * 60_000, now: () => number = Date.now): WeatherSource {
  let cached: { at: number; value: WeatherNow | null } | null = null;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,precipitation&timezone=Asia%2FSeoul`;
  return {
    async current() {
      if (cached && now() - cached.at < cacheMs) return cached.value;
      let value: WeatherNow | null = null;
      try {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 4000);
        try {
          const res = await fetchImpl(url, { signal: abort.signal });
          if (res.ok) {
            const body = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
            const t = body.current?.temperature_2m;
            const c = body.current?.weather_code;
            if (typeof t === 'number' && typeof c === 'number') value = toWeather(t, c);
          }
        } finally {
          clearTimeout(timer);
        }
      } catch {
        value = null;
      }
      // 실패는 짧게만 기억해 바로 다음 손님 때 다시 시도한다
      cached = { at: value ? now() : now() - cacheMs + 60_000, value };
      return value;
    },
  };
}

export async function recentPaidOrders(prisma: PrismaClient, since: Date): Promise<number> {
  return prisma.order.count({ where: { status: 'paid', paidAt: { gte: since } } });
}

export interface ContextDeps {
  prisma: PrismaClient;
  weather: WeatherSource;
  crowdWindowMin: number;
  now?: () => Date;
}

export async function buildContext(deps: ContextDeps): Promise<ContextResponse> {
  const now = (deps.now ?? (() => new Date()))();
  const since = new Date(now.getTime() - deps.crowdWindowMin * 60_000);
  const [weather, recentOrders] = await Promise.all([deps.weather.current(), recentPaidOrders(deps.prisma, since)]);
  const hour = now.getHours(); // 프로세스 TZ(Asia/Seoul) 기준
  return { timeOfDay: timeOfDay(hour), hour, weather, crowd: crowdLevel(recentOrders), recentOrders };
}
