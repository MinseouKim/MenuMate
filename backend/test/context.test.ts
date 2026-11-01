import { describe, expect, it } from 'vitest';
import { crowdLevel, openMeteo, timeOfDay, toWeather, weatherLabel } from '../src/context.js';

describe('timeOfDay', () => {
  it('시각을 다섯 시간대로 나눈다', () => {
    expect(timeOfDay(3)).toBe('night');
    expect(timeOfDay(8)).toBe('morning');
    expect(timeOfDay(12)).toBe('lunch');
    expect(timeOfDay(15)).toBe('afternoon');
    expect(timeOfDay(19)).toBe('evening');
    expect(timeOfDay(22)).toBe('night');
  });
});

describe('weather', () => {
  it('WMO 코드를 한국어 라벨로', () => {
    expect(weatherLabel(0)).toBe('맑음');
    expect(weatherLabel(3)).toBe('흐림');
    expect(weatherLabel(63)).toBe('비');
    expect(weatherLabel(71)).toBe('눈');
    expect(weatherLabel(95)).toBe('천둥번개');
  });
  it('비·추위·더위 플래그', () => {
    expect(toWeather(5, 61)).toMatchObject({ rainy: true, cold: true, hot: false, label: '비' });
    expect(toWeather(30, 0)).toMatchObject({ rainy: false, cold: false, hot: true });
  });
});

describe('crowdLevel', () => {
  it('최근 주문 수로 구간을 나눈다', () => {
    expect(crowdLevel(0)).toBe('low');
    expect(crowdLevel(1)).toBe('low');
    expect(crowdLevel(2)).toBe('mid');
    expect(crowdLevel(4)).toBe('mid');
    expect(crowdLevel(5)).toBe('high');
  });
});

describe('openMeteo', () => {
  const ok = (temp: number, code: number) => async () => ({ ok: true, status: 200, json: async () => ({ current: { temperature_2m: temp, weather_code: code } }) });

  it('현재 날씨를 읽고 10분 캐시한다', async () => {
    let calls = 0;
    let t = 0;
    const src = openMeteo(37, 127, async (...a) => { calls++; return ok(12, 61)(); }, 600_000, () => t);
    expect(await src.current()).toMatchObject({ tempC: 12, label: '비', rainy: true });
    t = 300_000;
    await src.current();
    expect(calls).toBe(1);
    t = 700_000;
    await src.current();
    expect(calls).toBe(2);
  });

  it('실패하면 null이고 1분 뒤 다시 시도한다', async () => {
    let calls = 0;
    let t = 0;
    const src = openMeteo(37, 127, async () => { calls++; throw new Error('offline'); }, 600_000, () => t);
    expect(await src.current()).toBeNull();
    t = 30_000;
    expect(await src.current()).toBeNull();
    expect(calls).toBe(1);
    t = 70_000;
    await src.current();
    expect(calls).toBe(2);
  });

  it('HTTP 오류도 null', async () => {
    const src = openMeteo(37, 127, async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await src.current()).toBeNull();
  });
});
