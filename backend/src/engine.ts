// 리뷰 학습 엔진 결과 파일(backend/engine/menu-features.json)을 읽는다 (v2-changes 5장, D74).
// 파일이 없거나 형식이 틀리면 null을 돌려주고, 추천은 v1 점수로 동작한다 (전시 안전).
import fs from 'node:fs';
import type { AgeBand, Tag } from './contracts.js';
import { AGE_BANDS, TAGS } from './recommend.js';

export interface EngineMenu {
  menuName: string;
  menuId?: string;
  /** 0~1. 지금은 v1 태그 5개만 읽고 모르는 키는 무시한다 */
  features: Partial<Record<Tag, number>>;
  ageFit: Record<AgeBand, number>;
  /** 0~1, 0.5가 중립 */
  reputation: number;
  reviewCount: number;
  adFilteredCount: number;
}

export interface Engine {
  version: string;
  weights: { ageFit: number; reputation: number };
  menus: EngineMenu[];
  byId: Map<string, EngineMenu>;
  byName: Map<string, EngineMenu>;
}

export type EngineParseResult = { ok: true; engine: Engine } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function parseEngine(json: unknown): EngineParseResult {
  const errors: string[] = [];
  if (!isObj(json)) return { ok: false, errors: ['파일 전체가 JSON 객체여야 해요'] };
  if (typeof json.engineVersion !== 'string' || json.engineVersion === '') errors.push('engineVersion: 비어 있지 않은 문자열이어야 해요');
  const w = json.weights;
  if (!isObj(w) || typeof w.ageFit !== 'number' || typeof w.reputation !== 'number' || w.ageFit < 0 || w.reputation < 0) {
    errors.push('weights: { ageFit, reputation } 0 이상의 숫자여야 해요');
  }
  const menus: EngineMenu[] = [];
  if (!Array.isArray(json.menus)) {
    errors.push('menus: 배열이어야 해요');
  } else {
    json.menus.forEach((m: unknown, i: number) => {
      const at = `menus[${i}]`;
      if (!isObj(m)) return void errors.push(`${at}: 객체여야 해요`);
      const label = `${at}(${String(m.menuName)})`;
      const before = errors.length;
      if (typeof m.menuName !== 'string' || m.menuName.trim() === '') errors.push(`${label}.menuName: 비어 있지 않은 문자열이어야 해요`);
      if (m.menuId !== undefined && typeof m.menuId !== 'string') errors.push(`${label}.menuId: 문자열이어야 해요`);
      const features: Partial<Record<Tag, number>> = {};
      if (!isObj(m.features)) {
        errors.push(`${label}.features: 객체여야 해요`);
      } else {
        for (const [k, v] of Object.entries(m.features)) {
          if (!isUnit(v)) errors.push(`${label}.features.${k}: 0~1 숫자여야 해요 (받은 값: ${JSON.stringify(v)})`);
          else if (TAGS.includes(k as Tag)) features[k as Tag] = v;
        }
      }
      if (!isObj(m.ageFit)) {
        errors.push(`${label}.ageFit: 객체여야 해요`);
      } else {
        for (const band of AGE_BANDS) {
          if (!isUnit(m.ageFit[band])) errors.push(`${label}.ageFit.${band}: 0~1 숫자여야 해요`);
        }
      }
      if (!isUnit(m.reputation)) errors.push(`${label}.reputation: 0~1 숫자여야 해요`);
      if (!isCount(m.reviewCount)) errors.push(`${label}.reviewCount: 0 이상의 정수여야 해요`);
      if (!isCount(m.adFilteredCount)) errors.push(`${label}.adFilteredCount: 0 이상의 정수여야 해요`);
      if (errors.length > before) return;
      const ageFit = m.ageFit as Record<AgeBand, number>;
      menus.push({
        menuName: (m.menuName as string).trim(),
        ...(m.menuId !== undefined ? { menuId: m.menuId as string } : {}),
        features,
        ageFit: { under35: ageFit.under35, '35to54': ageFit['35to54'], '55plus': ageFit['55plus'] },
        reputation: m.reputation as number,
        reviewCount: m.reviewCount as number,
        adFilteredCount: m.adFilteredCount as number,
      });
    });
  }
  if (errors.length) return { ok: false, errors };
  const weights = w as { ageFit: number; reputation: number };
  return {
    ok: true,
    engine: {
      version: json.engineVersion as string,
      weights: { ageFit: weights.ageFit, reputation: weights.reputation },
      menus,
      byId: new Map(menus.filter((m) => m.menuId).map((m) => [m.menuId!, m])),
      // menuId를 적은 항목은 id로만 매칭한다 (이름이 같은 다른 메뉴에 붙지 않게)
      byName: new Map(menus.filter((m) => !m.menuId).map((m) => [m.menuName, m])),
    },
  };
}

/** menuId가 있는 엔진 항목은 id로, menuId가 없는 항목은 메뉴 이름으로 찾는다 */
export function findEngineMenu(engine: Engine, menu: { id: string; name: string }): EngineMenu | undefined {
  return engine.byId.get(menu.id) ?? engine.byName.get(menu.name.trim());
}

export function loadEngine(filePath: string, log: { info(msg: string): void; warn(msg: string): void }): Engine | null {
  if (!fs.existsSync(filePath)) {
    log.info(`엔진 파일이 없어 v1 점수로 추천합니다: ${filePath}`);
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    log.warn(`엔진 파일을 읽지 못해 v1 점수로 추천합니다: ${filePath} (${(e as Error).message})`);
    return null;
  }
  const r = parseEngine(json);
  if (!r.ok) {
    log.warn(`엔진 파일 형식이 맞지 않아 v1 점수로 추천합니다: ${filePath}\n  - ${r.errors.slice(0, 20).join('\n  - ')}`);
    return null;
  }
  log.info(`엔진 파일 사용: ${r.engine.version} (메뉴 ${r.engine.menus.length}개)`);
  return r.engine;
}
